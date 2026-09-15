function areaParams(settings) {
  return new URLSearchParams({
    lat: settings.center.lat,
    lon: settings.center.lon,
    radiusM: settings.radiusM
  });
}

async function getJson(path, timeoutMs) {
  const response = await fetch(path, { signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function fetchAircraft(settings) {
  return getJson(`/api/aircraft?${areaParams(settings)}`, 20000).then(data => {
    if (!Array.isArray(data.aircraft)) throw new Error('Invalid aircraft response');
    return data;
  });
}

export function fetchOsm(settings) {
  return getJson(`/api/osm?${areaParams(settings)}`, 95000).then(data => {
    if (!Array.isArray(data.elements) || data.remark) throw new Error(data.remark || 'Invalid map response');
    return data;
  });
}
