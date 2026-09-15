import { bboxForRadius } from '../geo.js';

const FEED_URL = process.env.FR24_LIVEFEED_URL || 'https://data-cloud.flightradar24.com/zones/fcgi/feed.js';

function parseAircraft(id, a) {
  if (!Array.isArray(a) || a.length < 10) return null;
  // Legacy FR24 feed array layout. Fields vary slightly over time, so keep parsing defensive.
  const lat = Number(a[1]), lon = Number(a[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const altitudeFt = Number(a[4]) || 0;
  const speedKt = Number(a[5]) || 0;
  const stableId = String(a[0] || a[9] || a[16] || id).trim() || String(id);
  return {
    id: stableId,
    hex: a[0] || '',
    lat, lon,
    heading: Number(a[3]) || 0,
    altitudeM: altitudeFt * 0.3048,
    speedKmh: speedKt * 1.852,
    squawk: a[6] || '',
    radar: a[7] || '',
    type: a[8] || '',
    registration: a[9] || '',
    timestamp: Number(a[10]) || Math.floor(Date.now()/1000),
    origin: a[11] || '',
    destination: a[12] || '',
    flight: a[13] || '',
    // The legacy feed does not provide a verified vertical-rate field.
    verticalSpeedMps: null,
    callsign: a[16] || a[13] || '',
    source: 'fr24-web'
  };
}

export async function fetchAircraft(settings) {
  const b = bboxForRadius(settings.center.lat, settings.center.lon, settings.radiusM * 1.05);
  const u = new URL(FEED_URL);
  u.searchParams.set('bounds', `${b.north},${b.south},${b.west},${b.east}`);
  for (const [k,v] of Object.entries({faa:1,satellite:1,mlat:1,flarm:1,adsb:1,gnd:1,air:1,vehicles:0,estimated:1,maxage:60,gliders:1,stats:1})) u.searchParams.set(k,v);
  // FR24's legacy web feed may be cached by URL. Always add a cache-buster.
  u.searchParams.set('time', String(Date.now()));
  const r = await fetch(u, {
    headers:{
      'user-agent':'Mozilla/5.0',
      'referer':'https://www.flightradar24.com/',
      'accept':'application/json,text/plain,*/*',
      'cache-control':'no-cache',
      'pragma':'no-cache'
    },
    cache:'no-store',
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error(`FR24 ${r.status}`);
  const raw = await r.json();
  return Object.entries(raw)
    .filter(([k]) => !['full_count','version','stats'].includes(k))
    .map(([id,a]) => parseAircraft(id,a))
    .filter(Boolean);
}
