const DB_NAME = 'air-radar-v2';
export const OSM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const OSM_LIMIT_BYTES = 100 * 1024 * 1024;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let expired = false;
    const timeout = setTimeout(() => {
      expired = true;
      reject(new Error('Browser storage did not respond within 5 seconds'));
    }, 5000);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('state');
      request.result.createObjectStore('osm', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (expired) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timeout); reject(request.error); };
    request.onblocked = () => {
      clearTimeout(timeout);
      expired = true;
      reject(new Error('Close other radar tabs to update storage'));
    };
  });
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Resolve only after the transaction commits, including quota/disk failures.
async function useStore(name, mode, operation) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let value, failure;
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('Storage transaction aborted')); };
    Promise.resolve().then(() => operation(tx.objectStore(name))).then(data => {
      value = data;
    }).catch(error => {
      failure = error;
      try { tx.abort(); } catch { db.close(); reject(error); }
    });
  });
}

export function osmKey(settings) {
  return JSON.stringify([settings.center.lat, settings.center.lon, settings.radiusM, 2]);
}

export function loadTrackState() {
  return useStore('state', 'readonly', store => result(store.get('tracks')));
}

export function saveTrackState(state) {
  return useStore('state', 'readwrite', store => result(store.put(state, 'tracks')));
}

export function loadOsm(settings, allowExpired = false) {
  return useStore('osm', 'readwrite', async store => {
    const record = await result(store.get(osmKey(settings)));
    if (!record || (!allowExpired && Date.now() - record.savedAt > OSM_TTL_MS)) return null;
    record.lastAccess = Date.now();
    store.put(record);
    return record.data;
  });
}

export function saveOsm(settings, data) {
  const size = new Blob([JSON.stringify(data)]).size;
  if (size > OSM_LIMIT_BYTES) return Promise.reject(new Error('This map exceeds the 100 MB cache limit'));
  return useStore('osm', 'readwrite', async store => {
    const key = osmKey(settings);
    const records = await result(store.getAll());
    let total = size + records.filter(r => r.key !== key).reduce((sum, r) => sum + r.size, 0);
    for (const record of records.sort((a, b) => a.lastAccess - b.lastAccess)) {
      if (total <= OSM_LIMIT_BYTES) break;
      if (record.key === key) continue;
      store.delete(record.key);
      total -= record.size;
    }
    store.put({ key, data, size, savedAt: Date.now(), lastAccess: Date.now() });
  });
}
