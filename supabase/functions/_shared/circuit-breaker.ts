/**
 * Circuit breaker compartilhado para origens externas (Yahoo, Brapi, DeepSeek...).
 *
 * Estados (padrão Nygard):
 *   closed    → chamadas passam normalmente
 *   open      → origem considerada instável; nada é chamado até o cooldown
 *   half_open → uma chamada de sondagem é liberada; se falhar volta a `open`
 *
 * O estado vive em `public.circuit_breakers` (RPCs atômicos), então TODOS os
 * isolates enxergam o mesmo disjuntor — uma instância que descobre que o Yahoo
 * caiu protege as demais imediatamente. Um cache em memória de 5s evita ida ao
 * banco em rajadas.
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

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerOptions {
  /** Falhas consecutivas para abrir o disjuntor. */
  failureThreshold?: number;
  /** Tempo (s) antes de liberar uma sondagem. */
  cooldownSeconds?: number;
  /** Acima disso a chamada é considerada lenta e conta como falha. */
  slowCallMs?: number;
  /** Timeout duro da chamada. */
  timeoutMs?: number;
}

const DEFAULTS: Required<BreakerOptions> = {
  failureThreshold: 5,
  cooldownSeconds: 30,
  slowCallMs: 4000,
  timeoutMs: 8000,
};

const localState = new Map<string, { state: BreakerState; at: number }>();
const LOCAL_TTL_MS = 5000;

export class CircuitOpenError extends Error {
  constructor(public readonly breaker: string) {
    super(`circuito aberto para ${breaker}`);
    this.name = "CircuitOpenError";
  }
}

export async function circuitState(
  name: string,
  cooldownSeconds = DEFAULTS.cooldownSeconds,
): Promise<BreakerState> {
  const cached = localState.get(name);
  if (cached && Date.now() - cached.at < LOCAL_TTL_MS) return cached.state;

  try {
    const { data, error } = await admin().rpc("circuit_check", {
      _name: name,
      _cooldown_seconds: cooldownSeconds,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const state = ((row as { state?: BreakerState } | null)?.state ?? "closed") as BreakerState;
    localState.set(name, { state, at: Date.now() });
    return state;
  } catch (e) {
    console.warn("[breaker] check falhou, assumindo closed:", (e as Error).message);
    return "closed";
  }
}

export function recordResult(
  name: string,
  success: boolean,
  latencyMs: number,
  error?: string,
  opts: BreakerOptions = {},
): void {
  const o = { ...DEFAULTS, ...opts };
  // Atualização otimista local para reagir sem esperar o banco.
  if (!success) localState.delete(name);
  else localState.set(name, { state: "closed", at: Date.now() });

  admin()
    .rpc("circuit_record", {
      _name: name,
      _success: success,
      _latency_ms: Math.round(latencyMs),
      _error: error ?? null,
      _failure_threshold: o.failureThreshold,
      _cooldown_seconds: o.cooldownSeconds,
    })
    .then(({ error: err }) => { if (err) console.warn("[breaker] record:", err.message); });
}

export interface BreakerResult<T> {
  value: T;
  /** true quando a origem foi realmente chamada. */
  live: boolean;
  state: BreakerState;
  latencyMs: number;
  degradedReason?: "circuit_open" | "error" | "timeout" | "slow";
}

/**
 * Executa `call` protegido pelo disjuntor.
 *
 * - Se o circuito estiver aberto, `fallback` é usado sem tocar na origem.
 * - Chamadas acima de `slowCallMs` contam como falha (protege contra origem
 *   lenta, que é pior que origem fora do ar).
 * - Qualquer erro cai no `fallback` quando ele existir; sem fallback, propaga.
 */
export async function withCircuitBreaker<T>(
  name: string,
  call: (signal: AbortSignal) => Promise<T>,
  fallback: (() => Promise<T | null>) | null = null,
  options: BreakerOptions = {},
): Promise<BreakerResult<T>> {
  const o = { ...DEFAULTS, ...options };
  const state = await circuitState(name, o.cooldownSeconds);

  if (state === "open") {
    const fb = fallback ? await fallback() : null;
    if (fb !== null && fb !== undefined) {
      return { value: fb, live: false, state, latencyMs: 0, degradedReason: "circuit_open" };
    }
    throw new CircuitOpenError(name);
  }

  const started = performance.now();
  try {
    const value = await call(AbortSignal.timeout(o.timeoutMs));
    const latency = performance.now() - started;
    const slow = latency > o.slowCallMs;
    recordResult(name, !slow, latency, slow ? `lenta (${Math.round(latency)}ms)` : undefined, o);
    return { value, live: true, state, latencyMs: latency, degradedReason: slow ? "slow" : undefined };
  } catch (e) {
    const latency = performance.now() - started;
    const message = (e as Error).message ?? "erro";
    const timedOut = (e as Error).name === "TimeoutError" || /abort|timeout/i.test(message);
    recordResult(name, false, latency, message, o);

    const fb = fallback ? await fallback() : null;
    if (fb !== null && fb !== undefined) {
      return {
        value: fb, live: false, state, latencyMs: latency,
        degradedReason: timedOut ? "timeout" : "error",
      };
    }
    throw e;
  }
}

/** Cabeçalhos de diagnóstico para o cliente saber que recebeu dado degradado. */
export function breakerHeaders(r: { live: boolean; state: BreakerState; degradedReason?: string }) {
  return {
    "x-origin": r.live ? "live" : "fallback",
    "x-circuit-state": r.state,
    ...(r.degradedReason ? { "x-degraded-reason": r.degradedReason } : {}),
  };
}
