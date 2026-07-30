// Shared telemetry helper for Edge Functions (Fase 5)
// Fire-and-forget insert into public.function_metrics using the service role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

export interface MetricRecord {
  function_name: string;
  duration_ms: number;
  status_code: number;
  user_id?: string | null;
  cache_hit?: boolean;
  tokens_in?: number;
  tokens_out?: number;
  error_message?: string | null;
  meta?: Record<string, unknown>;
  /** Correlação com o trace OpenTelemetry (W3C trace id / span id). */
  trace_id?: string | null;
  span_id?: string | null;
}

export function logMetric(rec: MetricRecord): void {
  // fire-and-forget; never block the response
  admin
    .from("function_metrics")
    .insert({
      function_name: rec.function_name,
      user_id: rec.user_id ?? null,
      duration_ms: Math.max(0, Math.round(rec.duration_ms)),
      status_code: rec.status_code,
      cache_hit: !!rec.cache_hit,
      tokens_in: rec.tokens_in ?? null,
      tokens_out: rec.tokens_out ?? null,
      error_message: rec.error_message ?? null,
      meta: rec.meta ?? null,
      trace_id: rec.trace_id ?? null,
      span_id: rec.span_id ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[telemetry]", error.message);
    });
}

/** Wraps an async handler with automatic timing + status capture. */
export async function withMetrics<T>(
  functionName: string,
  ctx: { user_id?: string | null; cache_hit?: boolean; meta?: Record<string, unknown> },
  fn: () => Promise<{ status: number; body: T; tokens_in?: number; tokens_out?: number }>,
): Promise<{ status: number; body: T }> {
  const started = performance.now();
  try {
    const res = await fn();
    logMetric({
      function_name: functionName,
      duration_ms: performance.now() - started,
      status_code: res.status,
      user_id: ctx.user_id,
      cache_hit: ctx.cache_hit,
      tokens_in: res.tokens_in,
      tokens_out: res.tokens_out,
      meta: ctx.meta,
    });
    return { status: res.status, body: res.body };
  } catch (e) {
    logMetric({
      function_name: functionName,
      duration_ms: performance.now() - started,
      status_code: 500,
      user_id: ctx.user_id,
      error_message: (e as Error).message,
      meta: ctx.meta,
    });
    throw e;
  }
}
