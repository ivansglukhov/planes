import { test, expect } from '@playwright/test';
const map = { elements: [
  { type: 'way', id: 1, tags: { highway: 'primary' }, geometry: [
    { lat: 55.59, lon: 37.47 }, { lat: 55.61, lon: 37.51 }
  ] },
  { type: 'way', id: 2, tags: { building: 'yes', 'building:levels': '8' }, geometry: [
    { lat: 55.594, lon: 37.49 }, { lat: 55.594, lon: 37.491 },
    { lat: 55.595, lon: 37.491 }, { lat: 55.595, lon: 37.49 }, { lat: 55.594, lon: 37.49 }
  ] }
] };
test('map cache, explicit refresh, filters, pause, selection and restoration', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let mapRequests = 0, mapFails = false;
  await page.route('**/api/osm?**', async route => {
    mapRequests++;
    await route.fulfill({ status: mapFails ? 502 : 200, json: mapFails ? { error: 'Upstream test failure' } : map });
  });
  await page.route('**/api/aircraft?**', route => route.fulfill({ json: {
    updatedAt: Date.now(), aircraft: [{
      id: 'test-plane', flight: 'TEST123', type: 'B738', callsign: 'TEST123',
      registration: 'TEST-REG', lat: 55.596355, lon: 37.493173,
      altitudeM: 1200, speedKmh: 0, heading: 0, timestamp: Math.floor(Date.now() / 1000),
      origin: 'DME', destination: 'LED', source: 'test'
    }]
  }}));
  await page.goto('/');
  await expect(page.locator('#osm-status')).toContainText('updated');
  await expect(page.locator('#count')).toHaveText('AIRCRAFT 1 / 1');
  expect(mapRequests).toBe(1);
  await page.locator('#pause').click();
  await expect(page.locator('#feed-status')).toContainText('PAUSED');
  await page.locator('canvas').click({ position: { x: 680, y: 296 } });
  await expect(page.locator('#aircraft-card')).toBeVisible();
  await expect(page.locator('#card-title')).toHaveText('TEST123');
  await page.locator('#filter').fill('NOTFOUND');
  await page.getByRole('button', { name: 'APPLY', exact: true }).click();
  await expect(page.locator('#count')).toHaveText('AIRCRAFT 0 / 1');
  await page.locator('#filter').fill('');
  await page.getByRole('button', { name: 'APPLY', exact: true }).click();
  await expect(page.locator('#count')).toHaveText('AIRCRAFT 1 / 1');
  await page.reload();
  await expect(page.locator('#osm-status')).toHaveText(/^Map: \d+ elements · browser cache$/);
  await expect(page.locator('#count')).toHaveText('AIRCRAFT 1 / 1');
  expect(mapRequests).toBe(1);
  await page.locator('#reload-osm').click();
  await expect(page.locator('#osm-status')).toContainText('updated');
  expect(mapRequests).toBe(2);
  mapFails = true;
  await page.locator('#reload-osm').click();
  await expect(page.locator('#osm-status')).toContainText('showing saved map');
  await page.screenshot({ path: 'test-results/radar-desktop.png' });
  expect(errors).toEqual([]);
  const saved = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('air-radar-v2'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    return new Promise(resolve => {
      const r = db.transaction('state').objectStore('state').get('tracks'); r.onsuccess = () => { db.close(); resolve(r.result); };
    });
  });
  expect(saved.active[0].aircraftId).toBe('test-plane');
});
test('aircraft still load while map fails; invalid API input is rejected', async ({ page, request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  expect((await request.get('/api/osm?lat=NaN&lon=37&radiusM=5000')).status()).toBe(400);
  expect((await request.get('/api/aircraft')).status()).toBe(400);
  await page.route('**/api/osm?**', route => route.fulfill({ status: 502, json: { error: 'fetch failed' } }));
  await page.route('**/api/aircraft?**', route => route.fulfill({ json: { aircraft: [], updatedAt: Date.now() } }));
  await page.goto('/');
  await expect(page.locator('#osm-status')).toContainText('fetch failed');
  await expect(page.locator('#feed-status')).toContainText('FR24 live');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#reload-osm')).toBeInViewport();
  await page.screenshot({ path: 'test-results/radar-mobile.png' });
});
