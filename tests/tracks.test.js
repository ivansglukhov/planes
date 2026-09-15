import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserTrackManager, MAX_POINTS } from '../src/tracks.js';
import { normalizeSettings } from '../src/settings.js';
const settings = normalizeSettings({ center: { lat: 55, lon: 37 }, radiusM: 30000, historyTracks: 2 });
const base = 1700000000000;
const plane = (offset = 0) => ({
  id: 'abc', timestamp: (base + offset) / 1000,
  lat: 55 + offset / 1000 * 0.000001, lon: 37, altitudeM: 900, flight: 'TEST1', type: 'B738'
});
test('bounds long tracks, keeps endpoints, ignores duplicate packets', () => {
  const tracks = new BrowserTrackManager();
  for (let i = 0; i < 2000; i++) {
    const offset = i * 15000;
    tracks.update([{ ...plane(), timestamp: (base + offset) / 1000, altitudeM: 900 + (i % 2) * 20 }], settings, base + offset);
  }
  const points = tracks.snapshot().active[0].points;
  assert.ok(points.length <= MAX_POINTS);
  assert.equal(points[0].ts, base);
  assert.equal(points.at(-1).ts, base + 1999 * 15000);
  const count = points.length;
  tracks.update([{ ...plane(), timestamp: points.at(-1).ts / 1000 }], settings, points.at(-1).ts);
  assert.equal(tracks.snapshot().active[0].points.length, count);
});
test('restart restores active track; timeout starts a new pass and enforces history limit', () => {
  let tracks = new BrowserTrackManager();
  tracks.update([plane()], settings, base);
  tracks = new BrowserTrackManager(structuredClone(tracks.snapshot()));
  tracks.update([plane(5000)], settings, base + 5000);
  assert.equal(tracks.snapshot().active.length, 1);
  assert.equal(tracks.snapshot().history.length, 0);
  for (const offset of [70000, 140000, 210000]) tracks.update([plane(offset)], settings, base + offset);
  assert.equal(tracks.snapshot().history.length, 2);
  assert.equal(tracks.snapshot().active[0].startedAt, base + 210000);
});
test('changing area finishes active passes; stale packets do not resurrect planes', () => {
  const tracks = new BrowserTrackManager();
  tracks.update([plane()], settings, base);
  tracks.setArea({ ...settings, center: { lat: 60, lon: 40 } });
  assert.equal(tracks.snapshot().active.length, 0);
  tracks.update([plane()], settings, base + 120000);
  assert.equal(tracks.snapshot().active.length, 0);
  assert.equal(tracks.snapshot().history.length, 1);
});
