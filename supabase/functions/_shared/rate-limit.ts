/**
 * Rate limiting persistido (multi-isolate) via `public.consume_rate_limit`.
 *
 * O contador vive no Postgres com INSERT ... ON CONFLICT DO UPDATE, portanto é
 * atômico e vale para TODAS as instâncias da Edge Function — ao contrário do
 * Map em memória, que só limitava um isolate por vez.
 *
 * A chave (`subjectId`) DEVE vir de uma identidade verificada (requireUser /
 * getClaims). Nunca use `sub` decodificado com atob: é forjável e transforma
 * qualquer limite em ilimitado.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "./auth.ts";
import { logSecurityEvent } from "./security-log.ts";

let adminClient: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!adminClient) {
    adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

export interface RateLimitRule {
  /** Nome lógico do recurso: "ai-trader", "ai-insights", "telegram-webhook". */
  resource: string;
  /** Máximo de chamadas dentro da janela. */
  max: number;
  /** Tamanho da janela em segundos (default 60). */
  windowSeconds?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfter: number;
}

/** Consome uma unidade da cota. Em caso de falha do banco, faz fail-open (não derruba o produto). */
export async function consumeRateLimit(
  subjectId: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const windowSeconds = rule.windowSeconds ?? 60;
  try {
    const { data, error } = await admin().rpc("consume_rate_limit", {
      _subject_id: subjectId,
      _resource: rule.resource,
      _max_requests: rule.max,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc falhou:", error.message);
      return { allowed: true, count: 0, retryAfter: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed !== false,
      count: row?.current_count ?? 0,
      retryAfter: row?.retry_after_seconds ?? windowSeconds,
    };
  } catch (e) {
    console.error("[rate-limit] indisponível:", (e as Error).message);
    return { allowed: true, count: 0, retryAfter: 0 };
  }
}

export function rateLimitResponse(retryAfter: number, resource: string): Response {
  return new Response(
    JSON.stringify({
      error: "Limite de chamadas atingido. Aguarde alguns instantes.",
      resource,
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/**
 * Aplica a regra e já devolve a Response 429 + evento de auditoria quando estoura.
 *
 *   const limited = await enforceRateLimit(req, user.id, { resource: "ai-trader", max: 12 });
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  req: Request,
  subjectId: string,
  rule: RateLimitRule,
): Promise<Response | null> {
  const result = await consumeRateLimit(subjectId, rule);
  if (result.allowed) return null;

  logSecurityEvent(req, {
    function_name: rule.resource,
    outcome: "rate_limited",
    reason: "rate_limit_exceeded",
    status_code: 429,
    subject_id: subjectId,
    meta: {
      count: result.count,
      max: rule.max,
      window_seconds: rule.windowSeconds ?? 60,
    },
  });

  return rateLimitResponse(result.retryAfter, rule.resource);
}
