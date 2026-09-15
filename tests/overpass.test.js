import test from 'node:test';
import assert from 'node:assert/strict';
import { getOsm } from '../server/overpass.js';
const area = { center: { lat: 55, lon: 37 }, radiusM: 5000 };
test('tries backup server on network failure and rejects incomplete Overpass results', async () => {
  const original = globalThis.fetch;
  const endpoints = [];
  globalThis.fetch = async url => {
    endpoints.push(url);
    if (endpoints.length === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    if (endpoints.length === 2) return new Response(JSON.stringify({ elements: [], remark: 'runtime error' }));
    return new Response(JSON.stringify({ elements: [{ id: 1 }] }));
  };
  try {
    assert.deepEqual(await getOsm(area), { elements: [{ id: 1 }] });
    assert.equal(new Set(endpoints).size, 3);
  } finally { globalThis.fetch = original; }
});
