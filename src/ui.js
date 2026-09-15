export class RadarUI {
  constructor(app) {
    app.innerHTML = `
      <section class="hud">
        <h1>AIR RADAR <small>LOCAL VIEW</small></h1>
        <form id="settings-form">
          <label>CENTER LAT, LON<input id="center" required placeholder="55.623087, 37.360494"></label>
          <div class="row">
            <label>RADIUS, m<input id="radius" type="number" min="250" max="30000" required></label>
            <label>HEIGHT SCALE<input id="hs" type="number" min="0.05" max="10" step="0.05" required></label>
          </div>
          <div class="row">
            <label>HISTORY PASSES<input id="hist" type="number" min="1" max="500" step="1" required></label>
            <label>MIN ALTITUDE, m<input id="min-alt" type="number" min="0" max="20000" step="100" required></label>
          </div>
          <label>FILTER FLIGHT / TYPE<input id="filter" type="search" maxlength="80" placeholder="SU, B738, DME…"></label>
          <div class="toggles">
            <label><input id="show-osm" type="checkbox">Map</label>
            <label><input id="show-active" type="checkbox">Live tracks</label>
            <label><input id="show-history" type="checkbox">History</label>
          </div>
          <div class="buttons"><button type="submit">APPLY</button><button id="reload-osm" type="button">REFRESH MAP</button></div>
        </form>
        <div class="buttons"><button id="pause" type="button">PAUSE</button><button id="home" type="button">HOME VIEW</button></div>
        <p id="count">AIRCRAFT 0</p>
        <div id="feed-status" class="status" role="status">Connecting…</div>
        <div id="osm-status" class="status" role="status">Map: waiting…</div>
        <div id="storage-status" class="status" role="status">History and maps stay in this browser.</div>
        <div id="form-status" class="status warn" role="alert"></div>
      </section>
      <section id="aircraft-card" class="aircraft-card" hidden aria-label="Selected aircraft">
        <button id="close-card" type="button" aria-label="Close aircraft details">×</button>
        <h2 id="card-title"></h2><dl id="card-details"></dl>
      </section>
      <aside class="legend">BLUE GRID · GROUND<br>WHITE · OSM<br>CYAN · ACTIVE TRACK<br>FADED · HISTORY<br>
        <span id="height-legend"></span><br>Click an aircraft for details.<br>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </aside>`;
    this.app = app;
  }

  el(id) { return this.app.querySelector('#' + id); }

  setSettings(settings) {
    this.el('center').value = `${settings.center.lat}, ${settings.center.lon}`;
    for (const [id, key] of [['radius','radiusM'],['hs','heightScale'],['hist','historyTracks'],['min-alt','minAltitudeM'],['filter','filter']]) {
      this.el(id).value = settings[key];
    }
    for (const [id, key] of [['show-osm','showOsm'],['show-active','showActiveTracks'],['show-history','showHistory']]) {
      this.el(id).checked = settings[key];
    }
    this.el('height-legend').textContent = `HEIGHT ×${settings.heightScale} · metres`;
  }

  readSettings() {
    const parts = this.el('center').value.split(',').map(s => s.trim());
    const [lat, lon] = parts.map(Number);
    if (parts.length !== 2 || parts.some(s => !s) || !Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -85 || lat > 85 || lon < -180 || lon > 180) {
      throw new Error('Enter LAT, LON. Supported latitude: −85…85°, longitude: −180…180°.');
    }
    return {
      center: { lat, lon }, radiusM: Number(this.el('radius').value),
      heightScale: Number(this.el('hs').value), historyTracks: Number(this.el('hist').value),
      minAltitudeM: Number(this.el('min-alt').value), filter: this.el('filter').value,
      showOsm: this.el('show-osm').checked, showActiveTracks: this.el('show-active').checked,
      showHistory: this.el('show-history').checked
    };
  }

  status(id, text, warning = false) {
    this.el(id).textContent = text;
    this.el(id).className = 'status' + (warning ? ' warn' : '');
  }

  showAircraft(item) {
    this.el('aircraft-card').hidden = !item;
    if (!item) return;
    this.el('card-title').textContent = item.flight || item.callsign || item.registration || item.id;
    const age = Math.max(0, Math.round((Date.now() - item.timestamp * 1000) / 1000));
    const entries = [
      ['Callsign', item.callsign], ['Type', item.type], ['Registration', item.registration],
      ['Route', `${item.origin || '—'} → ${item.destination || '—'}`],
      ['Altitude', `${Math.round(item.altitudeM)} m`], ['Speed', `${Math.round(item.speedKmh)} km/h`],
      ['Heading', `${Math.round(item.heading)}°`],
      ['Vertical speed', Number.isFinite(item.verticalSpeedMps) ? `${item.verticalSpeedMps.toFixed(1)} m/s` : 'Unavailable'],
      ['Source', item.source], ['Data age', `${age} s`]
    ];
    this.el('card-details').replaceChildren(...entries.flatMap(([key, value]) => {
      const term = document.createElement('dt'), description = document.createElement('dd');
      term.textContent = key; description.textContent = value || '—';
      return [term, description];
    }));
  }
}
