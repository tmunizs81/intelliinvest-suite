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
  /**
   * Conta dona da entrada. Entradas gravadas por um usuário nunca são servidas
   * a outro, mesmo que a chave colida e mesmo que a limpeza de logout falhe.
   */
  owner?: string | null;
}

export interface CacheScope {
  /** id do usuário logado; `null`/undefined = dado público (cotações, câmbio). */
  owner?: string | null;
}

/**
 * Versão do esquema de chaves. Ao subir esta constante, todas as entradas
 * gravadas por versões anteriores (inclusive as antigas, sem id de usuário)
 * deixam de ser encontradas e são apagadas por `rotateCacheSchema()`.
 */
export const CACHE_SCHEMA = 'v2';

/**
 * Monta uma chave de cache isolada por conta.
 * Use SEMPRE que o conteúdo derivar de dados da carteira do usuário.
 */
export function userScopedKey(userId: string | null | undefined, key: string): string {
  return `${CACHE_SCHEMA}:u:${userId ?? 'anon'}:${key}`;
}

const SCHEMA_FLAG_KEY = 'cache_schema_version';

/**
 * Rotação de chaves: remove qualquer entrada gravada antes da versão atual
 * (chaves sem escopo de usuário ou sem o campo `owner`), garantindo que nada
 * do modelo antigo seja reaproveitado após a correção de isolamento.
 * Idempotente — só faz varredura completa quando a versão muda.
 */
export async function rotateCacheSchema(): Promise<void> {
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(SCHEMA_FLAG_KEY);
  } catch {
    previous = null;
  }
  if (previous === CACHE_SCHEMA) return;

  // IndexedDB: apaga tudo que não pertence ao esquema atual.
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        for (const raw of (req.result as CacheEntry[]) ?? []) {
          const legacyKey = !String(raw.key).startsWith(`${CACHE_SCHEMA}:`);
          const legacyEntry = !('owner' in raw);
          if (legacyKey || legacyEntry) store.delete(raw.key);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* cache é opcional */
  }

  // localStorage: derruba espelhos antigos de dados pessoais.
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/^(dashboard_bootstrap|portfolio_|ai-|alerts:|quotes:|metrics:)/.test(k)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(SCHEMA_FLAG_KEY, CACHE_SCHEMA);
  } catch {
    /* noop */
  }
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

export async function getCached<T>(key: string, scope?: CacheScope): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        const expectedOwner = scope?.owner ?? null;
        const entryOwner = entry?.owner ?? null;
        if (!entry || Date.now() > entry.expiresAt) {
          resolve(null);
        } else if (entryOwner !== expectedOwner) {
          // Dono diferente: descarta silenciosamente (nunca vaza entre contas).
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

export async function setCache<T>(key: string, data: T, ttlMs: number, scope?: CacheScope): Promise<void> {
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
        owner: scope?.owner ?? null,
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
