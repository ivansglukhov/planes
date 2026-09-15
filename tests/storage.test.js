import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOsm, saveOsm, saveTrackState, loadTrackState, OSM_TTL_MS } from '../src/storage.js';
const area = { center: { lat: 55, lon: 37 }, radiusM: 5000 };
test('map TTL, forced replacement, area isolation and track persistence', async () => {
  const data = { elements: [{ id: 1 }] };
  await saveOsm(area, data);
  assert.deepEqual(await loadOsm(area), data);
  assert.equal(await loadOsm({ ...area, radiusM: 1000 }), null);
  const realNow = Date.now;
  Date.now = () => realNow() + OSM_TTL_MS + 1000;
  try {
    assert.equal(await loadOsm(area), null);
    assert.deepEqual(await loadOsm(area, true), data);
  } finally { Date.now = realNow; }
  await saveOsm(area, { elements: [] });
  assert.deepEqual(await loadOsm(area), { elements: [] });
  const tracks = { active: [], history: [{ id: 'test' }] };
  await saveTrackState(tracks);
  assert.deepEqual(await loadTrackState(), tracks);
});
test('aborted writes reject instead of reporting a successful save', async () => {
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = original.apply(this, args);
    this.transaction.abort();
    return request;
  };
  try {
    await assert.rejects(saveTrackState({ active: [], history: [] }));
  } finally { IDBObjectStore.prototype.put = original; }
  assert.equal((await loadTrackState()).history[0].id, 'test');
});
