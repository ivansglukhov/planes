const DEFAULT_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

const endpoints = [...new Set([
  process.env.OVERPASS_URL,
  ...DEFAULT_ENDPOINTS
].filter(Boolean))];

function query(settings) {
  const { lat, lon } = settings.center;
  const radius = Math.round(settings.radiusM);
  return `[out:json][timeout:25];(
way(around:${radius},${lat},${lon})["highway"~"^(primary|secondary|primary_link|secondary_link)$"];
way(around:${radius},${lat},${lon})["building"]["building:levels"];
way(around:${radius},${lat},${lon})["building"]["height"];
relation(around:${radius},${lat},${lon})["building"]["building:levels"];
relation(around:${radius},${lat},${lon})["building"]["height"];
);out geom;`;
}

async function request(endpoint, settings) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'personal-air-radar/0.2'
    },
    body: new URLSearchParams({ data: query(settings) }),
    signal: AbortSignal.timeout(28000)
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  if (!Array.isArray(data.elements) || data.remark) throw new Error(data.remark || 'Invalid Overpass response');
  return data;
}

export async function getOsm(settings) {
  const failures = [];
  for (const endpoint of endpoints) {
    try {
      return await request(endpoint, settings);
    } catch (error) {
      const cause = error.cause?.code || error.cause?.message || error.code || '';
      const reason = `${new URL(endpoint).host}: ${error.message || error} ${cause}`.trim();
      console.warn('Overpass request failed:', reason);
      failures.push(reason);
    }
  }
  throw new Error(`Overpass unavailable (${failures.join('; ')})`);
}
