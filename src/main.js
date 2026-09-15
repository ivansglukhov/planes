import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { project, pointInRadius } from './geo.js';

const app=document.querySelector('#app');
app.innerHTML=`<div class="hud"><h1>AIR RADAR / LOCAL</h1><div class="row"><label style="flex:1 1 100%">CENTER LAT, LON<input id="center" type="text" inputmode="decimal" placeholder="55.623087, 37.360494"></label></div><div class="row"><label>RADIUS, m<input id="radius" type="number" min="250" max="30000"></label><label>HEIGHT SCALE<input id="hs" type="number" min="0.05" max="10" step="0.05"></label></div><div class="row"><label>HISTORY PASSES<input id="hist" type="number" min="1" max="500"></label><label>&nbsp;<span id="count">AIRCRAFT 0</span></label></div><div class="buttons"><button id="save">SAVE / RELOAD OSM</button><button id="home">HOME VIEW</button></div><div id="status" class="status">starting…</div></div><div class="legend">BLUE GRID · GROUND<br>WHITE · OSM<br>CYAN · ACTIVE TRACK<br>FADED · HISTORY</div>`;

const scene=new THREE.Scene(); scene.background=new THREE.Color('#071426');
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,1,100000); camera.up.set(0,1,0);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); app.appendChild(renderer.domElement);
const labels=new CSS2DRenderer(); labels.setSize(innerWidth,innerHeight); labels.domElement.style.position='fixed';labels.domElement.style.inset='0';labels.domElement.style.pointerEvents='none';app.appendChild(labels.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.08;
scene.add(new THREE.HemisphereLight(0x9adfff,0x06111d,1.7)); const sun=new THREE.DirectionalLight(0xffffff,1);sun.position.set(1,3,2);scene.add(sun);
const groundG=new THREE.Group(), osmG=new THREE.Group(), aircraftG=new THREE.Group(), tracksG=new THREE.Group(); scene.add(groundG,osmG,tracksG,aircraftG);
let settings, socket;

function disposeObject(o){for(const c of [...o.children])disposeObject(c);o.element?.remove?.();o.geometry?.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())}}
function clear(g){for(const o of [...g.children]){g.remove(o);disposeObject(o)}}
function home(){const r=settings?.radiusM||3500;camera.position.set(r*.9,r*.75,r*.9);controls.target.set(0,0,0);controls.update()}
function makeGrid(){clear(groundG);const r=settings.radiusM,step=Math.max(50,Math.round(r/35/50)*50);const pts=[];for(let x=-r;x<=r;x+=step){for(let z=-r;z<r;z+=step){if(pointInRadius(x,z,r)&&pointInRadius(x,z+step,r))pts.push(x,0,z,x,0,z+step)}}for(let z=-r;z<=r;z+=step){for(let x=-r;x<r;x+=step){if(pointInRadius(x,z,r)&&pointInRadius(x+step,z,r))pts.push(x,0,z,x+step,0,z)}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));groundG.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x087cac,transparent:true,opacity:.55})));const circle=new THREE.Mesh(new THREE.RingGeometry(r-2,r,192),new THREE.MeshBasicMaterial({color:0x39bce8,side:THREE.DoubleSide}));circle.rotation.x=-Math.PI/2;circle.position.y=.5;groundG.add(circle)}
function shapeFromGeometry(geom){if(!geom?.length)return null;const sh=new THREE.Shape();geom.forEach((n,i)=>{const p=project(n.lat,n.lon,settings.center);if(i===0)sh.moveTo(p.x,-p.z);else sh.lineTo(p.x,-p.z)});return sh}
async function loadOsm(){document.querySelector('#status').textContent='loading OSM…';const r=await fetch('/api/osm');const data=await r.json();if(!r.ok)throw new Error(data.error||'OSM error');clear(osmG);for(const e of data.elements||[]){if(e.tags?.highway&&e.geometry){const ps=e.geometry.map(n=>{const p=project(n.lat,n.lon,settings.center);return new THREE.Vector3(p.x,1,p.z)});if(ps.length>1){const g=new THREE.BufferGeometry().setFromPoints(ps);osmG.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.9})))}}else if(e.tags?.building&&e.geometry?.length>2){const sh=shapeFromGeometry(e.geometry);if(!sh)continue;const taggedLevels=Number.parseFloat(e.tags['building:levels']);let h=Number.parseFloat(e.tags.height);const estimatedLevels=Number.isFinite(taggedLevels)?taggedLevels:(Number.isFinite(h)?h/3:2);if(estimatedLevels<5)continue;if(!Number.isFinite(h))h=taggedLevels*3;h=Math.max(2,Math.min(h,150));const g=new THREE.ExtrudeGeometry(sh,{depth:h,bevelEnabled:false});g.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(g,new THREE.MeshPhongMaterial({color:0x071b28,transparent:true,opacity:.6,side:THREE.DoubleSide}));mesh.position.y=0;osmG.add(mesh);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.42}));osmG.add(edges)}}document.querySelector('#status').textContent=`OSM: ${data.elements?.length||0} elements`;}
function label(text,cls='label'){const d=document.createElement('div');d.className=cls;d.textContent=text;return new CSS2DObject(d)}
function aircraftMarkerTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.clearRect(0,0,64,64);x.beginPath();x.arc(32,32,11,0,Math.PI*2);x.fillStyle='#ffffff';x.fill();x.beginPath();x.arc(32,32,16,0,Math.PI*2);x.strokeStyle='#4be1ff';x.lineWidth=3;x.stroke();const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
const aircraftMarkerMap=aircraftMarkerTexture();
const aircraftViews=new Map();

function removeAircraftView(id){
 const v=aircraftViews.get(id); if(!v)return;
 aircraftG.remove(v.group); disposeObject(v.group); aircraftViews.delete(id);
}
function clearAircraftViews(){for(const id of [...aircraftViews.keys()])removeAircraftView(id)}
function lerpVec(a,b,t,out=new THREE.Vector3()){return out.set(THREE.MathUtils.lerp(a.x,b.x,t),THREE.MathUtils.lerp(a.y,b.y,t),THREE.MathUtils.lerp(a.z,b.z,t))}
const CORRECTION_MS=1800;
const MAX_PREDICTION_SEC=15;
const activeTrackTails=new Map();
function smooth01(t){t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t)}
function velocityForAircraft(a){
 const speed=Math.max(0,Number(a.speedKmh)||0)/3.6;
 const h=THREE.MathUtils.degToRad(Number(a.heading)||0);
 return new THREE.Vector3(
   Math.sin(h)*speed,
   (Number(a.verticalSpeedMps)||0)*(settings?.heightScale||1),
   -Math.cos(h)*speed
 );
}
function sampleAircraftView(v,now){
 const dt=Math.min(MAX_PREDICTION_SEC,Math.max(0,(now-v.modelAt)/1000));
 const from=v.fromPos.clone().addScaledVector(v.velocity,dt);
 const to=v.toPos.clone().addScaledVector(v.velocity,dt);
 return lerpVec(from,to,smooth01((now-v.modelAt)/v.correctionMs));
}
function updateAircraftViewGeometry(v,pos){
 const a=v.line.geometry.attributes.position;
 a.setXYZ(0,pos.x,0,pos.z); a.setXYZ(1,pos.x,pos.y,pos.z); a.needsUpdate=true;
 v.line.computeLineDistances();
 v.marker.position.copy(pos);
 v.altLabel.position.set(pos.x,pos.y/2,pos.z);
 v.altLabel.element.textContent=`${Math.round(pos.y/Math.max(.001,settings.heightScale))} m`;
 const tail=activeTrackTails.get(v.id);
 if(tail){const q=tail.geometry.attributes.position;q.setXYZ(1,pos.x,pos.y,pos.z);q.needsUpdate=true;}
}
function makeAircraftView(a,target,velocity,now){
 const group=new THREE.Group();
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([target.x,0,target.z,target.x,target.y,target.z],3));
 const line=new THREE.Line(g,new THREE.LineDashedMaterial({color:0xbfeeff,dashSize:25,gapSize:15,transparent:true,opacity:.55}));
 line.computeLineDistances(); group.add(line);
 const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:aircraftMarkerMap,transparent:true,depthTest:false,depthWrite:false}));
 const markerSize=Math.max(18,settings.radiusM*.008); marker.scale.set(markerSize,markerSize,1); group.add(marker);
 const altLabel=label(`${Math.round(a.altitudeM)} m`,'label alt'); group.add(altLabel);
 aircraftG.add(group);
 const v={id:a.id,group,line,marker,altLabel,fromPos:target.clone(),toPos:target.clone(),velocity:velocity.clone(),modelAt:now,correctionMs:1};
 aircraftViews.set(a.id,v); updateAircraftViewGeometry(v,target); return v;
}
function updateAircraftTargets(aircraft){
 const now=performance.now(), epochNow=Date.now(), seen=new Set();
 for(const a of aircraft||[]){
   seen.add(a.id);
   const p=project(a.lat,a.lon,settings.center), altitudeM=Number(a.altitudeM)||0;
   const reported=new THREE.Vector3(p.x,Math.max(15,altitudeM*settings.heightScale),p.z);
   const velocity=velocityForAircraft(a);
   // FR24 position can already be a few seconds old when it reaches us. Project that
   // measurement forward to "now", but cap the correction so a stale packet cannot
   // shoot a marker across the whole scene.
   const sourceMs=(Number(a.timestamp)||0)*1000;
   const ageSec=sourceMs>0?THREE.MathUtils.clamp((epochNow-sourceMs)/1000,0,MAX_PREDICTION_SEC):0;
   const nowTarget=reported.clone().addScaledVector(velocity,ageSec);
   let v=aircraftViews.get(a.id);
   if(!v){makeAircraftView(a,nowTarget,velocity,now);continue}
   // Never snap to a newly received coordinate. Continue from the exact rendered
   // position and bleed the correction in while the plane keeps moving by heading/speed.
   const current=sampleAircraftView(v,now);
   v.fromPos.copy(current);
   v.toPos.copy(nowTarget);
   v.velocity.copy(velocity);
   v.modelAt=now;
   v.correctionMs=CORRECTION_MS;
 }
 for(const id of [...aircraftViews.keys()])if(!seen.has(id))removeAircraftView(id);
}
function animateAircraft(now){
 for(const v of aircraftViews.values()) updateAircraftViewGeometry(v,sampleAircraftView(v,now));
}
function rebuildTracks(state){
 clear(tracksG); activeTrackTails.clear();
 const hs=settings.heightScale;
 const drawTrack=(t,opacity,color,active=false)=>{
   if(!t.points||t.points.length<1)return;
   const ps=t.points.map(q=>{const p=project(q.lat,q.lon,settings.center);return new THREE.Vector3(p.x,(q.altitudeM||0)*hs,p.z)});
   if(ps.length>1) tracksG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ps),new THREE.LineBasicMaterial({color,transparent:true,opacity})));
   if(active){
     const last=ps.at(-1);
     const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute([last.x,last.y,last.z,last.x,last.y,last.z],3));
     const tail=new THREE.Line(gg,new THREE.LineBasicMaterial({color,transparent:true,opacity}));tracksG.add(tail);activeTrackTails.set(t.aircraftId,tail);
   }
 };
 (state.tracks?.history||[]).forEach((t,i,a)=>drawTrack(t,Math.max(.08,.55*(1-i/Math.max(1,a.length))),0x4f91aa,false));
 (state.tracks?.active||[]).forEach(t=>drawTrack(t,.9,0x4be1ff,true));
}
function renderState(state){
 settings=state.settings||settings;if(!settings)return;document.querySelector('#count').textContent=`AIRCRAFT ${(state.aircraft||[]).length}`;const st=document.querySelector('#status');const upd=state.feedUpdatedAt?new Date(state.feedUpdatedAt).toLocaleTimeString():'';const src=state.feedSourceTimestamp?new Date(state.feedSourceTimestamp).toLocaleTimeString():'';st.textContent=state.feedError?`FR24: ${state.feedError}`:`FR24 live · ${(state.aircraft||[]).length} aircraft · poll ${upd}${src?` · data ${src}`:''}`;st.className='status'+(state.feedError?' warn':'');rebuildTracks(state);
 updateAircraftTargets(state.aircraft||[]);
}
async function init(){clearAircraftViews();settings=await (await fetch('/api/settings')).json();document.querySelector('#center').value=`${settings.center.lat}, ${settings.center.lon}`;for(const [id,v] of [['radius',settings.radiusM],['hs',settings.heightScale],['hist',settings.historyTracks]])document.querySelector('#'+id).value=v;makeGrid();home();try{await loadOsm()}catch(e){document.querySelector('#status').textContent=String(e)}connect()}
function connect(){socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.onmessage=e=>renderState(JSON.parse(e.data));socket.onclose=()=>setTimeout(connect,2000)}
document.querySelector('#save').onclick=async()=>{const raw=document.querySelector('#center').value.trim();const parts=raw.split(',').map(v=>v.trim());const lat=Number(parts[0]),lon=Number(parts[1]);if(parts.length!==2||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){const st=document.querySelector('#status');st.textContent='CENTER: enter coordinates as LAT, LON — for example 55.623087, 37.360494';st.className='status warn';return}const body={center:{lat,lon},radiusM:+document.querySelector('#radius').value,heightScale:+document.querySelector('#hs').value,historyTracks:+document.querySelector('#hist').value};clearAircraftViews();settings=await (await fetch('/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();document.querySelector('#center').value=`${settings.center.lat}, ${settings.center.lon}`;makeGrid();home();await loadOsm()};document.querySelector('#home').onclick=home;
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);labels.setSize(innerWidth,innerHeight)});
(function loop(now){requestAnimationFrame(loop);animateAircraft(now);controls.update();renderer.render(scene,camera);labels.render(scene,camera)})();init();
