/**
 * Trilha de auditoria de segurança.
 *
 * Grava em `public.security_events` toda tentativa rejeitada (e opcionalmente
 * acessos sensíveis bem-sucedidos) com IP, user-agent, claims e o motivo exato
 * da recusa. Fire-and-forget: nunca bloqueia nem derruba a resposta.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

export type SecurityOutcome = "denied" | "allowed" | "rate_limited" | "error";

export interface SecurityEvent {
  function_name: string;
  reason: string;
  outcome?: SecurityOutcome;
  status_code?: number;
  subject_id?: string | null;
  claims?: Record<string, unknown> | null;
  key_id?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Extrai o IP real do cliente respeitando os proxies do Nginx/Supabase. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    null;
}

/**
 * Registra um evento de segurança. Sempre chame com `req` para capturar
 * IP/user-agent/rota automaticamente.
 */
export function logSecurityEvent(req: Request, ev: SecurityEvent): void {
  const record = {
    function_name: ev.function_name,
    outcome: ev.outcome ?? "denied",
    reason: ev.reason,
    status_code: ev.status_code ?? (ev.outcome === "allowed" ? 200 : 401),
    subject_id: ev.subject_id ?? null,
    claims: ev.claims ?? null,
    ip: clientIp(req),
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    key_id: ev.key_id ?? null,
    meta: {
      method: req.method,
      path: new URL(req.url).pathname,
      ...(ev.meta ?? {}),
    },
  };

  // Log estruturado no stdout da função (visível nos logs mesmo se o insert falhar)
  console.warn(`[security] ${JSON.stringify(record)}`);

  try {
    admin()
      .from("security_events")
      .insert(record)
      .then(({ error }) => {
        if (error) console.error("[security-log] insert falhou:", error.message);
      });
  } catch (e) {
    console.error("[security-log] client indisponível:", (e as Error).message);
  }
}
