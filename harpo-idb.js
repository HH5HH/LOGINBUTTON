/**
 * harpo-idb.js — HARPO IndexedDB storage layer
 *
 * Works in both MV3 service worker context and regular extension page context.
 * No quota limits. No chrome.storage.session. Handles HAR payloads of any size.
 *
 * Schema:
 *   DB:    harpo-v1
 *   Store: sessions  (keyPath: none — external key)
 *   Each record: { har, source, fileName, programmerName, createdAt }
 */

const HARPO_IDB_NAME    = "harpo-v1";
const HARPO_IDB_VERSION = 1;
const HARPO_IDB_STORE   = "sessions";

// ── Open (or upgrade) the database ───────────────────────────────────────────

function harpoOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HARPO_IDB_NAME, HARPO_IDB_VERSION);

    req.onupgradeneeded = ({ target }) => {
      const db = target.result;
      if (!db.objectStoreNames.contains(HARPO_IDB_STORE)) {
        db.createObjectStore(HARPO_IDB_STORE);
      }
    };

    req.onsuccess  = ({ target }) => resolve(target.result);
    req.onerror    = ({ target }) => reject(target.error);
    req.onblocked  = ()           => reject(new Error("HARPO IDB blocked by open connection."));
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Write a HARPO session record.
 * @param {string} key  - unique session key (e.g. "harpo:abc123")
 * @param {object} value - { har, source, fileName, programmerName, createdAt }
 */
export async function harpoIdbPut(key, value) {
  const db = await harpoOpenDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(HARPO_IDB_STORE, "readwrite");
    const store = tx.objectStore(HARPO_IDB_STORE);
    store.put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = ({ target }) => { db.close(); reject(target.error); };
    tx.onabort    = ({ target }) => { db.close(); reject(target.error); };
  });
}

/**
 * Read a HARPO session record by key.
 * Returns null if not found.
 */
export async function harpoIdbGet(key) {
  const db = await harpoOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(HARPO_IDB_STORE, "readonly");
    const req = tx.objectStore(HARPO_IDB_STORE).get(key);
    req.onsuccess = ({ target }) => { db.close(); resolve(target.result ?? null); };
    req.onerror   = ({ target }) => { db.close(); reject(target.error); };
  });
}

/**
 * Delete a HARPO session record.
 */
export async function harpoIdbDelete(key) {
  const db = await harpoOpenDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(HARPO_IDB_STORE, "readwrite");
    const store = tx.objectStore(HARPO_IDB_STORE);
    store.delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = ({ target }) => { db.close(); reject(target.error); };
  });
}

/**
 * List all session keys in the store.
 */
export async function harpoIdbListKeys() {
  const db = await harpoOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(HARPO_IDB_STORE, "readonly");
    const req = tx.objectStore(HARPO_IDB_STORE).getAllKeys();
    req.onsuccess = ({ target }) => { db.close(); resolve(target.result ?? []); };
    req.onerror   = ({ target }) => { db.close(); reject(target.error); };
  });
}

/**
 * Delete all sessions older than maxAgeMs. Call on harpo.html load for housekeeping.
 */
export async function harpoIdbPurgeExpired(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await harpoOpenDB();
  const cutoff = Date.now() - maxAgeMs;
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(HARPO_IDB_STORE, "readwrite");
    const store = tx.objectStore(HARPO_IDB_STORE);
    const req   = store.openCursor();
    let   purged = 0;

    req.onsuccess = ({ target }) => {
      const cursor = target.result;
      if (!cursor) return;
      const createdAt = cursor.value?.createdAt;
      if (createdAt && new Date(createdAt).getTime() < cutoff) {
        cursor.delete();
        purged++;
      }
      cursor.continue();
    };

    tx.oncomplete = () => { db.close(); resolve(purged); };
    tx.onerror    = ({ target }) => { db.close(); reject(target.error); };
  });
}
