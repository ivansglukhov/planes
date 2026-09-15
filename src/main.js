import { RadarScene } from './radarScene.js';
import { RadarUI } from './ui.js';
import { loadSettings, saveSettings, normalizeSettings } from './settings.js';
import { fetchAircraft, fetchOsm } from './api.js';
import { loadTrackState, saveTrackState, loadOsm, saveOsm, osmKey } from './storage.js';
import { BrowserTrackManager } from './tracks.js';

const ui = new RadarUI(document.querySelector('#app'));
let settings = loadSettings();
ui.setSettings(settings);
let tracks = new BrowserTrackManager();
let aircraft = [], selectedId = null, paused = false;
let updatedAt = null, feedError = null, failures = 0;
let generation = 0, mapGeneration = 0, timer;
let scene;

const storageError = error => ui.status('storage-status', `Browser storage: ${error.message}. This session can continue without saving.`, true);
const persistTracks = () => saveTrackState(tracks.snapshot()).catch(storageError);

function renderState() {
  const visible = scene.setAircraft(aircraft);
  scene.renderTracks(tracks.snapshot());
  ui.el('count').textContent = `AIRCRAFT ${visible} / ${aircraft.length}`;
  updateStatus();
}

function updateStatus() {
  const age = updatedAt ? Math.floor((Date.now() - updatedAt) / 1000) : null;
  const newest = aircraft.length ? Math.max(...aircraft.map(a => a.timestamp * 1000)) : null;
  const stale = age !== null && (age > 30 || (newest && Date.now() - newest > 30000));
  const text = paused ? 'PAUSED · monitoring and animation stopped' :
    feedError ? `Aircraft: ${feedError}` :
    updatedAt ? `${stale ? 'STALE DATA' : 'FR24 live'} · last received ${age}s ago` : 'Connecting aircraft…';
  ui.status('feed-status', text, !!feedError || !!stale);
  ui.showAircraft(aircraft.find(a => a.id === selectedId) || null);
}

async function poll() {
  if (paused) return;
  const revision = generation;
  try {
    const data = await fetchAircraft(settings);
    if (revision !== generation || paused) return;
    aircraft = data.aircraft;
    updatedAt = data.updatedAt;
    feedError = null; failures = 0;
    tracks.update(aircraft, settings);
    renderState();
    void persistTracks();
  } catch (error) {
    if (revision !== generation || paused) return;
    feedError = error.message; failures++;
    tracks.update([], settings);
    updateStatus();
    void persistTracks();
  } finally {
    if (revision === generation && !paused) {
      timer = setTimeout(poll, Math.min(60000, settings.pollMs * 2 ** Math.min(failures, 4)));
    }
  }
}

function restartPoll() {
  generation++;
  clearTimeout(timer);
  void poll();
}

async function refreshMap(force = false) {
  const revision = ++mapGeneration;
  const area = structuredClone(settings);
  ui.el('reload-osm').disabled = true;
  ui.status('osm-status', force ? 'Map: downloading fresh data…' : 'Map: checking browser cache…');
  let cached = null;
  try {
    if (!force) {
      try { cached = await loadOsm(area); } catch (error) { storageError(error); }
    }
    if (revision !== mapGeneration) return;
    if (cached) {
      scene.renderOsm(cached);
      ui.status('osm-status', `Map: ${cached.elements.length} elements · browser cache`);
      return;
    }
    ui.status('osm-status', 'Map: loading OSM… backup servers may take up to 90s');
    const data = await fetchOsm(area);
    if (revision !== mapGeneration) return;
    scene.renderOsm(data);
    ui.status('osm-status', `Map: ${data.elements.length} elements · updated`);
    try { await saveOsm(area, data); } catch (error) { storageError(error); }
  } catch (error) {
    if (revision !== mapGeneration) return;
    let fallback = null;
    try { fallback = await loadOsm(area, true); } catch {}
    if (revision !== mapGeneration) return;
    if (fallback) scene.renderOsm(fallback);
    ui.status('osm-status', `Map: ${error.message}${fallback ? ' · showing saved map' : ''}`, true);
  } finally {
    if (revision === mapGeneration) ui.el('reload-osm').disabled = false;
  }
}

async function init() {
  scene = new RadarScene(document.querySelector('#app'), item => {
    selectedId = item?.id || null; ui.showAircraft(item);
  });
  ui.setSettings(settings);
  scene.setSettings(settings);
  try { tracks = new BrowserTrackManager(await loadTrackState() || {}); } catch (error) { storageError(error); }
  tracks.setArea(settings);
  tracks.update([], settings);
  renderState();
  ui.el('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const next = normalizeSettings({ ...settings, ...ui.readSettings() });
      const areaChanged = osmKey(next) !== osmKey(settings);
      settings = next;
      try { saveSettings(settings); } catch (error) { storageError(error); }
      tracks.setArea(settings);
      if (areaChanged) { aircraft = []; selectedId = null; updatedAt = null; }
      scene.setSettings(settings);
      ui.setSettings(settings);
      ui.status('form-status', '');
      renderState();
      void persistTracks();
      if (areaChanged) { void refreshMap(); restartPoll(); }
    } catch (error) { ui.status('form-status', error.message, true); }
  });
  ui.el('reload-osm').onclick = () => void refreshMap(true);
  ui.el('home').onclick = () => scene.home();
  ui.el('close-card').onclick = () => { selectedId = null; ui.showAircraft(null); };
  ui.el('pause').onclick = () => {
    paused = !paused;
    scene.setPaused(paused);
    ui.el('pause').textContent = paused ? 'RESUME' : 'PAUSE';
    restartPoll();
    updateStatus();
  };
  setInterval(updateStatus, 1000);
  // Aircraft start independently of slow/failed map requests.
  restartPoll();
  void refreshMap();
}

init().catch(error => ui.status('feed-status', `Startup failed: ${error.message}`, true));
