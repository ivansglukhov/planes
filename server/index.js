import express from 'express';
import path from 'node:path';
import { fetchAircraft } from './providers/fr24Web.js';
import { getOsm } from './overpass.js';
import { distanceM } from './geo.js';

const app = express();
app.use(express.json({ limit: '32kb' }));

function areaFrom(query) {
  if (['lat', 'lon', 'radiusM'].some(key => typeof query[key] !== 'string' || !query[key].trim())) return null;
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radiusM = Number(query.radiusM);
  if (!Number.isFinite(lat) || lat < -85 || lat > 85) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (!Number.isFinite(radiusM) || radiusM < 250 || radiusM > 30000) return null;
  return { center: { lat, lon }, radiusM };
}

app.get('/api/health', (req, res) => res.json({ ok: true, storage: 'browser' }));

app.get('/api/aircraft', async (req, res) => {
  const area = areaFrom(req.query);
  if (!area) return res.status(400).json({ error: 'Invalid lat, lon or radiusM' });
  try {
    const aircraft = (await fetchAircraft(area)).filter((item) =>
      distanceM(area.center.lat, area.center.lon, item.lat, item.lon) <= area.radiusM
    );
    const sourceTimestamp = aircraft.length
      ? Math.max(...aircraft.map((item) => Number(item.timestamp) || 0)) * 1000
      : null;
    res.json({ aircraft, updatedAt: Date.now(), sourceTimestamp });
  } catch (error) {
    res.status(502).json({ error: String(error.message || error) });
  }
});

app.get('/api/osm', async (req, res) => {
  const area = areaFrom(req.query);
  if (!area) return res.status(400).json({ error: 'Invalid lat, lon or radiusM' });
  try {
    res.json(await getOsm(area));
  } catch (error) {
    res.status(502).json({ error: String(error.message || error) });
  }
});

const dist = path.resolve('dist');
app.use(express.static(dist));
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(dist, 'index.html'));
  }
  next();
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`Air Radar: http://localhost:${port}`));
