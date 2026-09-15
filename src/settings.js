export const DEFAULT_SETTINGS = {
  center: { lat: 55.596355, lon: 37.493173 },
  radiusM: 5000,
  heightScale: 1,
  historyTracks: 30,
  pollMs: 5000,
  filter: '',
  minAltitudeM: 0,
  showOsm: true,
  showActiveTracks: true,
  showHistory: true
};

const KEY = 'air-radar-settings-v2';

function finite(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function normalizeSettings(value = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    center: {
      lat: finite(value.center?.lat, DEFAULT_SETTINGS.center.lat, -85, 85),
      lon: finite(value.center?.lon, DEFAULT_SETTINGS.center.lon, -180, 180)
    },
    radiusM: finite(value.radiusM, DEFAULT_SETTINGS.radiusM, 250, 30000),
    heightScale: finite(value.heightScale, DEFAULT_SETTINGS.heightScale, 0.05, 10),
    historyTracks: Math.round(finite(value.historyTracks, DEFAULT_SETTINGS.historyTracks, 1, 500)),
    pollMs: finite(value.pollMs, DEFAULT_SETTINGS.pollMs, 2000, 60000),
    filter: String(value.filter || '').slice(0, 80),
    minAltitudeM: finite(value.minAltitudeM, 0, 0, 20000),
    showOsm: value.showOsm !== false,
    showActiveTracks: value.showActiveTracks !== false,
    showHistory: value.showHistory !== false
  };
}

export function loadSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return normalizeSettings(value && typeof value === 'object' ? value : {});
  } catch {
    return normalizeSettings();
  }
}

export function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
}
