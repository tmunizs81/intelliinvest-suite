/**
 * Lightweight IndexedDB persistent cache for quotes and snapshots.
 * Falls back gracefully if IndexedDB is unavailable.
 */

const DB_NAME = 'simplynvest_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

interface CacheEntry<T = any> {
  key: string;
  data: T;
  expiresAt: number;  // timestamp
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry || Date.now() > entry.expiresAt) {
          resolve(null);
        } else {
          resolve(entry.data);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry<T> = {
        key,
        data,
        expiresAt: Date.now() + ttlMs,
        createdAt: Date.now(),
      };
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail - cache is optional
  }
}

export async function clearCache(prefix?: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      if (!prefix) {
        store.clear();
      } else {
        const req = store.getAllKeys();
        req.onsuccess = () => {
          for (const k of req.result) {
            if (String(k).startsWith(prefix)) store.delete(k);
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silent fail
  }
}

// Convenience TTL constants
export const CACHE_TTL = {
  QUOTES: 5 * 60 * 1000,          // 5 min
  SNAPSHOTS: 60 * 60 * 1000,      // 1 hour
  RATES: 30 * 60 * 1000,          // 30 min
  AI_RESPONSE: 10 * 60 * 1000,    // 10 min
} as const;
