/**
 * Cache server-side para respostas de APIs externas (Yahoo, Brapi, BCB...).
 *
 * - Persistido em `public.http_cache` (compartilhado entre TODOS os isolates).
 * - TTL por namespace, leitura atômica com incremento de hit_count.
 * - Invalidação por namespace / prefixo de chave.
 * - `stale-while-revalidate`: opcionalmente devolve valor vencido enquanto o
 *   fetch novo falha (resiliência quando a API externa cai).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let client: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!client) {
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}

/** TTLs padrão (segundos) por tipo de dado. */
export const CACHE_TTL = {
  /** Histórico diário: muda no máximo 1x/dia por candle novo. */
  history: 15 * 60,
  /** Histórico intraday (interval < 1d): mais volátil. */
  historyIntraday: 3 * 60,
  /** Fundamentos: publicados por trimestre. */
  fundamentals: 12 * 60 * 60,
  /** Busca de tickers: catálogo praticamente estático. */
  tickerSearch: 24 * 60 * 60,
  /** Câmbio. */
  fx: 10 * 60,
} as const;

export interface CacheHit<T> {
  value: T;
  hit: boolean;
  stale?: boolean;
}

/** Normaliza a chave para evitar duplicatas por caixa/espaços. */
export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && `${p}` !== "")
    .map((p) => `${p}`.trim().toUpperCase())
    .join(":");
}

export async function cacheGet<T>(namespace: string, key: string): Promise<T | null> {
  try {
    const { data, error } = await admin().rpc("http_cache_get", {
      _namespace: namespace,
      _key: key,
    });
    if (error) {
      console.warn("[http-cache] get falhou:", error.message);
      return null;
    }
    return (data ?? null) as T | null;
  } catch (e) {
    console.warn("[http-cache] indisponível:", (e as Error).message);
    return null;
  }
}

export async function cacheSet(
  namespace: string,
  key: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const { error } = await admin().rpc("http_cache_put", {
      _namespace: namespace,
      _key: key,
      _payload: payload as Record<string, unknown>,
      _ttl_seconds: ttlSeconds,
    });
    if (error) console.warn("[http-cache] put falhou:", error.message);
  } catch (e) {
    console.warn("[http-cache] put indisponível:", (e as Error).message);
  }
}

export async function cacheInvalidate(namespace: string, keyPrefix?: string): Promise<number> {
  try {
    const { data, error } = await admin().rpc("http_cache_invalidate", {
      _namespace: namespace,
      _key_prefix: keyPrefix ?? null,
    });
    if (error) throw new Error(error.message);
    return (data as number) ?? 0;
  } catch (e) {
    console.warn("[http-cache] invalidate falhou:", (e as Error).message);
    return 0;
  }
}

/**
 * Envolve um fetch caro com cache.
 *
 *   const { value, hit } = await withHttpCache(
 *     { namespace: "yahoo-history", key: cacheKey(ticker, range, interval), ttl: CACHE_TTL.history },
 *     () => fetchFromYahoo(),
 *   );
 */
export async function withHttpCache<T>(
  opts: { namespace: string; key: string; ttl: number; bypass?: boolean },
  loader: () => Promise<T>,
): Promise<CacheHit<T>> {
  if (!opts.bypass) {
    const cached = await cacheGet<T>(opts.namespace, opts.key);
    if (cached !== null && cached !== undefined) {
      return { value: cached, hit: true };
    }
  }

  const value = await loader();
  // Não bloqueia a resposta: grava em background.
  cacheSet(opts.namespace, opts.key, value, opts.ttl);
  return { value, hit: false };
}

/** Headers padrão para expor o estado de cache ao cliente/observabilidade. */
export function cacheHeaders(hit: boolean, ttl: number): Record<string, string> {
  return {
    "x-cache": hit ? "HIT" : "MISS",
    "Cache-Control": `private, max-age=${Math.max(30, Math.floor(ttl / 3))}`,
  };
}

/**
 * Leitura "stale": devolve o payload mesmo se o TTL já venceu.
 * Usada como rede de segurança quando a origem externa está fora/lenta.
 */
export async function cacheGetStale<T>(
  namespace: string,
  key: string,
  maxAgeSeconds = 24 * 60 * 60,
): Promise<{ value: T; ageSeconds: number } | null> {
  try {
    const { data, error } = await admin()
      .from("http_cache")
      .select("payload, updated_at, created_at")
      .eq("namespace", namespace)
      .eq("cache_key", key)
      .maybeSingle();

    if (error || !data) return null;

    const stampedAt = new Date((data as any).updated_at ?? (data as any).created_at).getTime();
    const ageSeconds = Math.max(0, Math.round((Date.now() - stampedAt) / 1000));
    if (ageSeconds > maxAgeSeconds) return null;

    return { value: (data as any).payload as T, ageSeconds };
  } catch (e) {
    console.warn("[http-cache] stale read falhou:", (e as Error).message);
    return null;
  }
}

export interface ResilientResult<T> {
  value: T;
  /** fresh = cache válido; live = origem; stale = cache vencido (degradado). */
  source: "fresh" | "live" | "stale";
  cacheHit: boolean;
  stale: boolean;
  ageSeconds?: number;
  circuitState?: string;
  degradedReason?: string;
}

/**
 * Cache + circuit breaker + stale-while-revalidate em uma chamada.
 *
 * Ordem: cache fresco → (circuito fechado) origem → cache vencido → erro.
 * É o caminho recomendado para qualquer integração externa instável.
 */
export async function withResilientCache<T>(
  opts: {
    namespace: string;
    key: string;
    ttl: number;
    bypass?: boolean;
    breaker: string;
    /** Idade máxima aceita para servir dado vencido (padrão 24h). */
    maxStaleSeconds?: number;
    breakerOptions?: import("./circuit-breaker.ts").BreakerOptions;
  },
  loader: (signal: AbortSignal) => Promise<T>,
): Promise<ResilientResult<T>> {
  const { withCircuitBreaker } = await import("./circuit-breaker.ts");

  if (!opts.bypass) {
    const fresh = await cacheGet<T>(opts.namespace, opts.key);
    if (fresh !== null && fresh !== undefined) {
      return { value: fresh, source: "fresh", cacheHit: true, stale: false };
    }
  }

  let staleAge: number | undefined;
  const fallback = async (): Promise<T | null> => {
    const stale = await cacheGetStale<T>(
      opts.namespace,
      opts.key,
      opts.maxStaleSeconds ?? 24 * 60 * 60,
    );
    if (!stale) return null;
    staleAge = stale.ageSeconds;
    return stale.value;
  };

  const result = await withCircuitBreaker<T>(opts.breaker, loader, fallback, opts.breakerOptions);

  if (result.live) {
    cacheSet(opts.namespace, opts.key, result.value, opts.ttl);
    return {
      value: result.value,
      source: "live",
      cacheHit: false,
      stale: false,
      circuitState: result.state,
      degradedReason: result.degradedReason,
    };
  }

  return {
    value: result.value,
    source: "stale",
    cacheHit: true,
    stale: true,
    ageSeconds: staleAge,
    circuitState: result.state,
    degradedReason: result.degradedReason,
  };
}

/** Cabeçalhos completos de diagnóstico (cache + disjuntor). */
export function resilientHeaders(r: ResilientResult<unknown>, ttl: number): Record<string, string> {
  return {
    "x-cache": r.cacheHit ? (r.stale ? "STALE" : "HIT") : "MISS",
    "x-data-source": r.source,
    ...(r.circuitState ? { "x-circuit-state": r.circuitState } : {}),
    ...(r.degradedReason ? { "x-degraded-reason": r.degradedReason } : {}),
    ...(r.ageSeconds !== undefined ? { "x-cache-age": String(r.ageSeconds) } : {}),
    "Cache-Control": `private, max-age=${Math.max(30, Math.floor(ttl / 3))}`,
  };
}
