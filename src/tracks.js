import { distanceM } from './geo.js';

export const MAX_POINTS = 600;
const MAX_ACTIVE = 256;
const MISSING_MS = 60000;

function validPoint(p) {
  return p && ['lat', 'lon', 'altitudeM', 'ts'].every(k => Number.isFinite(p[k]));
}

function compact(points) {
  // Keep both endpoints while reducing old samples.
  while (points.length > MAX_POINTS) {
    points = points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
  }
  return points;
}

export class BrowserTrackManager {
  constructor(saved = {}) {
    const clean = list => (Array.isArray(list) ? list : [])
      .filter(t => t && typeof t.aircraftId === 'string' && Array.isArray(t.points))
      .map(t => ({ ...t, points: compact(t.points.filter(validPoint)) }));
    this.active = new Map(clean(saved.active).slice(0, MAX_ACTIVE).map(t => [t.aircraftId, t]));
    this.history = clean(saved.history).slice(0, 500);
    this.area = saved.area || null;
  }

  setArea(settings) {
    const area = JSON.stringify([settings.center.lat, settings.center.lon, settings.radiusM]);
    if (this.area !== area) {
      for (const id of this.active.keys()) this.finish(id, Date.now());
      this.area = area;
    }
    this.history.length = Math.min(this.history.length, settings.historyTracks);
  }

  finish(id, now) {
    const track = this.active.get(id);
    track.endedAt = now;
    this.history.unshift(track);
    this.active.delete(id);
  }

  update(aircraft, settings, now = Date.now()) {
    this.setArea(settings);
    // Expire before processing: a reappearing aircraft starts a new pass.
    for (const [id, track] of this.active) {
      if (now - track.lastSeen > MISSING_MS) this.finish(id, now);
    }
    for (const item of aircraft) {
      if (distanceM(settings.center.lat, settings.center.lon, item.lat, item.lon) > settings.radiusM) continue;
      const point = { ts: Number(item.timestamp) * 1000, lat: item.lat, lon: item.lon, altitudeM: item.altitudeM };
      if (!validPoint(point) || now - point.ts > MISSING_MS || point.ts > now + 10000) continue;
      let track = this.active.get(item.id);
      if (!track) {
        if (this.active.size >= MAX_ACTIVE) this.finish(this.active.keys().next().value, now);
        track = {
          id: `${item.id}-${now}`, aircraftId: item.id,
          flight: item.flight || item.callsign || '', type: item.type || '',
          startedAt: now, lastSeen: now, lastSourceTs: 0, points: []
        };
        this.active.set(item.id, track);
      }
      if (point.ts <= (track.lastSourceTs || track.points.at(-1)?.ts || 0)) continue;
      track.lastSeen = now;
      track.lastSourceTs = point.ts;
      const previous = track.points.at(-1);
      const moved = !previous || distanceM(previous.lat, previous.lon, point.lat, point.lon) >= 25;
      const elapsed = !previous || point.ts - previous.ts >= 15000;
      const climbed = !previous || Math.abs(point.altitudeM - previous.altitudeM) >= 15;
      if (moved || elapsed || climbed) track.points.push(point);
      track.points = compact(track.points);
    }
    this.history.length = Math.min(this.history.length, settings.historyTracks);
  }

  snapshot() {
    return { active: [...this.active.values()], history: this.history, area: this.area };
  }
}
