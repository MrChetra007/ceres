// Persistent client cache for resolved Earth Engine tile metadata.
//
// A month's tile costs 5-20s on the server when cold, but the response is just
// a signed URL + the facts the map labels. Keeping that response in IndexedDB
// lets a reload or a revisit skip the ee-data round-trip entirely until the
// signed URL's safe TTL lapses (same windows as ee-data: closed month 2h, open
// month 20min). Only whole-month scrubs are cached — per-scene (sceneDate)
// requests are keyed differently server-side and must never reuse a month row.
//
// Everything degrades silently: private mode / missing IndexedDB / quota errors
// all behave like a cache miss.

const DB_NAME = 'ceres-tile-cache'
const STORE = 'tiles'
// v2 (2026-11): the SAVI/EVI reflectance fix changes every cached SAVI/EVI tile.
// Bumping the IndexedDB version drops the v1 store on the next open so no old
// value survives its TTL. This clears all tile rows once, which is safe — it is
// only a cache.
const DB_VERSION = 2
const MAX_ENTRIES = 60
const CLOSED_TTL_MS = 2 * 60 * 60 * 1000
const OPEN_TTL_MS = 20 * 60 * 1000

let dbPromise = null

function isClosedMonth(year, month) {
  // Date.UTC is 0-indexed, so month (1-12) is already the NEXT real month.
  return Date.UTC(year, month, 1) <= Date.now()
}

function ttlFor(year, month) {
  return isClosedMonth(year, month) ? CLOSED_TTL_MS : OPEN_TTL_MS
}

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      resolve(null)
      return
    }
    req.onupgradeneeded = (event) => {
      const db = req.result
      if (event.oldVersion < 2 && db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE)
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('at', 'at')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      resolve(null)
    }
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

// Same FNV-1a 32-bit digest as ee-data's geometryHash, so a client key and the
// server's cache identity move together when a boundary is edited.
export function geometryHash(geometry) {
  const s = JSON.stringify(geometry)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function cachedTileKey(index, year, month, geometry) {
  return index + '|' + year + '|' + month + '|' + geometryHash(geometry)
}

export async function getCachedTile(key) {
  const db = await openDb()
  if (!db || !key) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => {
        const row = req.result
        if (!row) {
          resolve(null)
          return
        }
        if (Date.now() - row.at > (row.ttl || OPEN_TTL_MS)) {
          deleteCachedTile(key)
          resolve(null)
          return
        }
        resolve(row.res || null)
      }
      req.onerror = () => resolve(null)
    } catch (e) {
      resolve(null)
    }
  })
}

export async function putCachedTile(key, res, year, month) {
  if (!key || !res || res.mode === 'error') return
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({
      key,
      res,
      at: Date.now(),
      ttl: ttlFor(year, month),
    })
    tx.oncomplete = () => prune(db)
  } catch (e) {
    // Cache writes are best-effort.
  }
}

export function deleteCachedTile(key) {
  if (!key) return
  openDb().then((db) => {
    if (!db) return
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
    } catch (e) {
      // ignore
    }
  })
}

function prune(db) {
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const countReq = store.count()
    countReq.onsuccess = () => {
      let excess = countReq.result - MAX_ENTRIES
      if (excess <= 0) return
      const cursorReq = store.index('at').openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor || excess <= 0) return
        cursor.delete()
        excess--
        cursor.continue()
      }
    }
  } catch (e) {
    // ignore
  }
}
