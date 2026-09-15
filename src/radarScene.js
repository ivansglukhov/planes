import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { project, pointInRadius, distanceM } from './geo.js';

const CORRECTION_MS = 1800;
const MAX_PREDICTION_SEC = 15;

function label(text, className = 'label') {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  return new CSS2DObject(element);
}

function markerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  context.beginPath();
  context.arc(32, 32, 11, 0, Math.PI * 2);
  context.fillStyle = '#ffffff';
  context.fill();
  context.beginPath();
  context.arc(32, 32, 16, 0, Math.PI * 2);
  context.strokeStyle = '#4be1ff';
  context.lineWidth = 3;
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeObject(object) {
  for (const child of [...object.children]) disposeObject(child);
  object.element?.remove?.();
  object.geometry?.dispose();
  if (object.material) {
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((item) => item.dispose());
  }
}

function clear(group) {
  for (const object of [...group.children]) {
    group.remove(object);
    disposeObject(object);
  }
}

function smooth01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export class RadarScene {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.settings = null;
    this.aircraft = new Map();
    this.views = new Map();
    this.activeTrackTails = new Map();
    this.markerMap = markerTexture();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#071426');
    this.camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 100000);
    this.camera.up.set(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.setSize(innerWidth, innerHeight);
    Object.assign(this.labels.domElement.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none'
    });
    container.appendChild(this.labels.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.scene.add(new THREE.HemisphereLight(0x9adfff, 0x06111d, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(1, 3, 2);
    this.scene.add(sun);

    this.groundGroup = new THREE.Group();
    this.osmGroup = new THREE.Group();
    this.tracksGroup = new THREE.Group();
    this.aircraftGroup = new THREE.Group();
    this.scene.add(this.groundGroup, this.osmGroup, this.tracksGroup, this.aircraftGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener('click', (event) => this.selectAt(event));
    addEventListener('resize', () => this.resize());
    requestAnimationFrame((now) => this.loop(now));
  }

  setSettings(settings, resetView = false) {
    const areaChanged = !this.settings ||
      this.settings.radiusM !== settings.radiusM ||
      this.settings.center.lat !== settings.center.lat ||
      this.settings.center.lon !== settings.center.lon;
    this.settings = settings;
    this.osmGroup.visible = settings.showOsm;
    this.tracksGroup.visible = settings.showActiveTracks || settings.showHistory;
    if (areaChanged) {
      this.makeGrid();
      this.clearAircraft();
      clear(this.tracksGroup);
      this.activeTrackTails.clear();
      clear(this.osmGroup);
    }
    if (areaChanged || resetView) this.home();
  }

  home() {
    const radius = this.settings?.radiusM || 3500;
    this.camera.position.set(radius * 0.9, radius * 0.75, radius * 0.9);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setPaused(paused) {
    const now = performance.now();
    if (paused && !this.paused) this.pausedAt = now;
    if (!paused && this.paused) {
      for (const view of this.views.values()) view.modelAt += now - this.pausedAt;
    }
    this.paused = paused;
  }

  makeGrid() {
    clear(this.groundGroup);
    const radius = this.settings.radiusM;
    const step = Math.max(50, Math.round(radius / 35 / 50) * 50);
    const points = [];
    for (let x = -radius; x <= radius; x += step) {
      for (let z = -radius; z < radius; z += step) {
        if (pointInRadius(x, z, radius) && pointInRadius(x, z + step, radius)) {
          points.push(x, 0, z, x, 0, z + step);
        }
      }
    }
    for (let z = -radius; z <= radius; z += step) {
      for (let x = -radius; x < radius; x += step) {
        if (pointInRadius(x, z, radius) && pointInRadius(x + step, z, radius)) {
          points.push(x, 0, z, x + step, 0, z);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.groundGroup.add(new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x087cac, transparent: true, opacity: 0.55 })
    ));
    const circle = new THREE.Mesh(
      new THREE.RingGeometry(radius - 2, radius, 192),
      new THREE.MeshBasicMaterial({ color: 0x39bce8, side: THREE.DoubleSide })
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.5;
    this.groundGroup.add(circle);
  }

  shapeFromGeometry(geometry) {
    if (!geometry?.length) return null;
    const shape = new THREE.Shape();
    geometry.forEach((node, index) => {
      const point = project(node.lat, node.lon, this.settings.center);
      if (index === 0) shape.moveTo(point.x, -point.z);
      else shape.lineTo(point.x, -point.z);
    });
    return shape;
  }

  renderOsm(data) {
    clear(this.osmGroup);
    for (const element of data.elements || []) {
      if (element.tags?.highway && element.geometry) {
        const points = element.geometry.map((node) => {
          const point = project(node.lat, node.lon, this.settings.center);
          return new THREE.Vector3(point.x, 1, point.z);
        });
        if (points.length > 1) {
          this.osmGroup.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
          ));
        }
      } else if (element.tags?.building && element.geometry?.length > 2) {
        const shape = this.shapeFromGeometry(element.geometry);
        if (!shape) continue;
        const levels = Number.parseFloat(element.tags['building:levels']);
        let height = Number.parseFloat(element.tags.height);
        const estimatedLevels = Number.isFinite(levels) ? levels : (Number.isFinite(height) ? height / 3 : 2);
        if (estimatedLevels < 5) continue;
        if (!Number.isFinite(height)) height = levels * 3;
        height = Math.max(2, Math.min(height, 150));
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
        geometry.rotateX(-Math.PI / 2);
        this.osmGroup.add(new THREE.Mesh(
          geometry,
          new THREE.MeshPhongMaterial({
            color: 0x071b28,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
          })
        ));
        this.osmGroup.add(new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 })
        ));
      }
    }
  }

  velocity(item) {
    const speed = Math.max(0, Number(item.speedKmh) || 0) / 3.6;
    const heading = THREE.MathUtils.degToRad(Number(item.heading) || 0);
    return new THREE.Vector3(
      Math.sin(heading) * speed,
      (Number(item.verticalSpeedMps) || 0) * this.settings.heightScale,
      -Math.cos(heading) * speed
    );
  }

  sample(view, now) {
    const seconds = Math.min(MAX_PREDICTION_SEC, Math.max(0, (now - view.modelAt) / 1000));
    const from = view.fromPos.clone().addScaledVector(view.velocity, seconds);
    const to = view.toPos.clone().addScaledVector(view.velocity, seconds);
    return from.lerp(to, smooth01((now - view.modelAt) / view.correctionMs));
  }

  createView(item, target, velocity, now) {
    const group = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      target.x, 0, target.z, target.x, target.y, target.z
    ], 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineDashedMaterial({
        color: 0xbfeeff,
        dashSize: 25,
        gapSize: 15,
        transparent: true,
        opacity: 0.55
      })
    );
    line.computeLineDistances();
    line.frustumCulled = false;
    group.add(line);
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.markerMap,
      transparent: true,
      depthTest: false,
      depthWrite: false
    }));
    const markerSize = Math.max(18, this.settings.radiusM * 0.008);
    marker.scale.set(markerSize, markerSize, 1);
    marker.userData.aircraftId = item.id;
    group.add(marker);
    const altitudeLabel = label(`${Math.round(item.altitudeM)} m`, 'label alt');
    group.add(altitudeLabel);
    this.aircraftGroup.add(group);
    const view = {
      id: item.id,
      group,
      line,
      marker,
      altitudeLabel,
      fromPos: target.clone(),
      toPos: target.clone(),
      velocity: velocity.clone(),
      modelAt: now,
      correctionMs: 1
    };
    if (this.paused) view.modelAt = this.pausedAt;
    this.views.set(item.id, view);
    this.updateView(view, target);
  }

  updateView(view, position) {
    const attribute = view.line.geometry.attributes.position;
    attribute.setXYZ(0, position.x, 0, position.z);
    attribute.setXYZ(1, position.x, position.y, position.z);
    attribute.needsUpdate = true;
    view.line.computeLineDistances();
    view.marker.position.copy(position);
    view.altitudeLabel.position.set(position.x, position.y / 2, position.z);
    view.altitudeLabel.element.textContent =
      `${Math.round(position.y / Math.max(0.001, this.settings.heightScale))} m`;
    const tail = this.activeTrackTails.get(view.id);
    if (tail) {
      const tailPosition = tail.geometry.attributes.position;
      tailPosition.setXYZ(1, position.x, position.y, position.z);
      tailPosition.needsUpdate = true;
    }
  }

  matches(item) {
    const query = this.settings.filter.trim().toLowerCase();
    const text = [item.flight, item.callsign, item.registration, item.type, item.origin, item.destination]
      .join(' ')
      .toLowerCase();
    return (Number(item.altitudeM) || 0) >= this.settings.minAltitudeM && (!query || text.includes(query));
  }

  setAircraft(items) {
    const now = this.paused ? this.pausedAt : performance.now();
    const epochNow = Date.now();
    const filtered = items.filter((item) => this.matches(item));
    this.aircraft = new Map(items.map((item) => [item.id, item]));
    const seen = new Set();
    for (const item of filtered) {
      seen.add(item.id);
      const projected = project(item.lat, item.lon, this.settings.center);
      const reported = new THREE.Vector3(
        projected.x,
        Math.max(15, (Number(item.altitudeM) || 0) * this.settings.heightScale),
        projected.z
      );
      const velocity = this.velocity(item);
      const sourceMs = (Number(item.timestamp) || 0) * 1000;
      const ageSeconds = sourceMs > 0
        ? THREE.MathUtils.clamp((epochNow - sourceMs) / 1000, 0, MAX_PREDICTION_SEC)
        : 0;
      const target = reported.clone().addScaledVector(velocity, ageSeconds);
      const view = this.views.get(item.id);
      if (!view) {
        this.createView(item, target, velocity, now);
        continue;
      }
      view.fromPos.copy(this.sample(view, now));
      view.toPos.copy(target);
      view.velocity.copy(velocity);
      view.modelAt = now;
      view.correctionMs = CORRECTION_MS;
    }
    for (const id of [...this.views.keys()]) {
      if (!seen.has(id)) this.removeView(id);
    }
    return filtered.length;
  }

  renderTracks(snapshot) {
    clear(this.tracksGroup);
    this.activeTrackTails.clear();
    const draw = (track, opacity, color, active) => {
      if (!track.points?.length) return;
      const query = this.settings.filter.trim().toLowerCase();
      if (query && !active && ![track.flight, track.type].join(' ').toLowerCase().includes(query)) return;
      if (!track.points.some(p => distanceM(
        this.settings.center.lat, this.settings.center.lon, p.lat, p.lon
      ) <= this.settings.radiusM && p.altitudeM >= this.settings.minAltitudeM)) return;
      const points = track.points.map((item) => {
        const point = project(item.lat, item.lon, this.settings.center);
        return new THREE.Vector3(point.x, (item.altitudeM || 0) * this.settings.heightScale, point.z);
      });
      if (points.length > 1) {
        this.tracksGroup.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity })
        ));
      }
      if (active) {
        const last = points.at(-1);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
          last.x, last.y, last.z, last.x, last.y, last.z
        ], 3));
        const tail = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color, transparent: true, opacity })
        );
        tail.frustumCulled = false;
        this.tracksGroup.add(tail);
        this.activeTrackTails.set(track.aircraftId, tail);
      }
    };
    if (this.settings.showHistory) {
      (snapshot.history || []).forEach((track, index, all) =>
        draw(track, Math.max(0.08, 0.55 * (1 - index / Math.max(1, all.length))), 0x4f91aa, false)
      );
    }
    if (this.settings.showActiveTracks) {
      (snapshot.active || []).forEach((track) => {
        if (this.views.has(track.aircraftId)) draw(track, 0.9, 0x4be1ff, true);
      });
    }
  }

  removeView(id) {
    const view = this.views.get(id);
    if (!view) return;
    this.aircraftGroup.remove(view.group);
    disposeObject(view.group);
    this.views.delete(id);
  }

  clearAircraft() {
    for (const id of [...this.views.keys()]) this.removeView(id);
    this.aircraft.clear();
  }

  selectAt(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.views.values()].map((view) => view.marker))[0];
    const item = hit ? this.aircraft.get(hit.object.userData.aircraftId) : null;
    this.onSelect?.(item || null);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.labels.setSize(innerWidth, innerHeight);
  }

  loop(now) {
    requestAnimationFrame((next) => this.loop(next));
    for (const view of this.views.values()) this.updateView(view, this.sample(view, this.paused ? this.pausedAt : now));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
