/**
 * Helpers de autenticação compartilhados por todas as Edge Functions.
 *
 * - getUser / requireUser: valida o JWT via Supabase (assinatura + expiração).
 *   NUNCA decodifique o payload manualmente com atob — é forjável.
 * - requireCron: exige `x-cron-secret` (dois slots => rotação sem downtime).
 * - requireTelegramSecret: valida o X-Telegram-Bot-Api-Secret-Token (dois slots).
 * - Toda rejeição gera um evento estruturado em `public.security_events`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logSecurityEvent } from "./security-log.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-telegram-bot-api-secret-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function unauthorized(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deriva o nome da função a partir da URL, para rotular o evento de auditoria. */
export function functionNameOf(req: Request): string {
  try {
    const parts = new URL(req.url).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "unknown";
  } catch {
    return "unknown";
  }
}

export interface AuthedUser {
  id: string;
  email: string | null;
  token: string;
  claims: Record<string, unknown> | null;
}

/**
 * Valida o JWT do header Authorization contra o servidor de auth.
 * Retorna `null` quando não há sessão válida — o chamador deve responder 401.
 */
export async function getUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;

  // O token do usuário nunca é igual à anon key — bloqueia chamadas "anônimas"
  // que só enviam a publishable key no header Authorization.
  if (token === anonKey) return null;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    const claims = (data as { claims?: Record<string, unknown> } | null)?.claims;
    if (!error && claims?.sub) {
      return {
        id: String(claims.sub),
        email: (claims.email as string) ?? null,
        token,
        claims,
      };
    }
  } catch {
    /* cai para getUser abaixo */
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      token,
      claims: { sub: data.user.id, email: data.user.email, role: data.user.role },
    };
  } catch {
    return null;
  }
}

/**
 * Igual a getUser, mas devolve uma Response 401 pronta e audita a rejeição.
 *
 *   const user = await requireUser(req);
 *   if (user instanceof Response) return user;
 */
export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const user = await getUser(req);
  if (!user) {
    const hasHeader = Boolean(req.headers.get("authorization"));
    logSecurityEvent(req, {
      function_name: functionNameOf(req),
      reason: hasHeader ? "invalid_or_expired_jwt" : "missing_authorization_header",
      status_code: 401,
    });
    return unauthorized("Sessão inválida ou ausente.");
  }
  return user;
}

/** Cliente Supabase que roda com a identidade (e RLS) do usuário autenticado. */
export function userClient(user: AuthedUser) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${user.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Comparação de strings sem early-exit por caractere. */
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

interface KeySlot {
  id: string;
  value: string;
}

/**
 * Monta a lista de segredos aceitos a partir de slots nomeados.
 * Permite rotacionar o valor no provedor sem downtime: mantenha o valor antigo
 * no slot `*_PREVIOUS` até confirmar (via `key_id` nos logs) que ninguém mais o usa.
 */
function keySlots(names: Array<[string, string]>): KeySlot[] {
  return names
    .map(([id, envName]) => ({ id, value: Deno.env.get(envName) || "" }))
    .filter((s) => s.value.length > 0);
}

/** Confere o valor recebido contra os slots e devolve qual deles bateu. */
function matchSlot(provided: string, slots: KeySlot[]): KeySlot | null {
  if (!provided) return null;
  let hit: KeySlot | null = null;
  // Percorre todos os slots (sem short-circuit) para não vazar por tempo.
  for (const slot of slots) {
    if (constantTimeEqual(provided, slot.value)) hit = slot;
  }
  return hit;
}

function misconfigured(name: string): Response {
  return new Response(
    JSON.stringify({ error: `${name} não configurado no servidor.` }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Rotas de cron/manutenção: exigem o header `x-cron-secret`.
 * Slots aceitos (nesta ordem de preferência): CRON_SECRET (atual),
 * CRON_SECRET_PREVIOUS (em rotação) e CRON_SHARED_SECRET (legado).
 * Aceita também o service role key no Authorization (invocação servidor→servidor).
 */
export function requireCron(req: Request, opts: { audit?: boolean } = {}): Response | null {
  const slots = keySlots([
    ["cron_current", "CRON_SECRET"],
    ["cron_previous", "CRON_SECRET_PREVIOUS"],
    ["cron_legacy", "CRON_SHARED_SECRET"],
  ]);

  if (slots.length === 0) return misconfigured("CRON_SECRET");

  const provided = req.headers.get("x-cron-secret") || "";
  const hit = matchSlot(provided, slots);
  if (hit) {
    if (hit.id !== "cron_current") {
      // Sinaliza que ainda há chamadores no segredo antigo: não aposente ainda.
      console.warn(`[security] cron secret depreciado em uso (key_id=${hit.id})`);
    }
    return null;
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && bearer && constantTimeEqual(bearer, serviceKey)) return null;

  if (opts.audit !== false) {
    logSecurityEvent(req, {
      function_name: functionNameOf(req),
      reason: provided ? "invalid_cron_secret" : "missing_cron_secret",
      status_code: 401,
      key_id: "none",
    });
  }
  return unauthorized("Rota restrita: header x-cron-secret ausente ou inválido.");
}

export interface TelegramAuth {
  keyId: string;
}

/**
 * Webhook do Telegram: valida o X-Telegram-Bot-Api-Secret-Token com dois slots.
 * Enquanto o `setWebhook` novo não propaga, o valor anterior continua aceito —
 * o `key_id` registrado no log diz quando é seguro remover o antigo.
 */
export function verifyTelegramSecret(req: Request): TelegramAuth | Response {
  const slots = keySlots([
    ["telegram_current", "TELEGRAM_WEBHOOK_SECRET"],
    ["telegram_previous", "TELEGRAM_WEBHOOK_SECRET_PREVIOUS"],
  ]);

  if (slots.length === 0) return misconfigured("TELEGRAM_WEBHOOK_SECRET");

  const provided = req.headers.get("x-telegram-bot-api-secret-token") || "";
  const hit = matchSlot(provided, slots);
  if (hit) {
    if (hit.id !== "telegram_current") {
      console.warn(`[security] telegram secret depreciado em uso (key_id=${hit.id})`);
    }
    return { keyId: hit.id };
  }

  logSecurityEvent(req, {
    function_name: functionNameOf(req),
    reason: provided ? "invalid_telegram_secret_token" : "missing_telegram_secret_token",
    status_code: 401,
    key_id: "none",
  });
  return unauthorized("Update do Telegram rejeitado: secret token inválido.");
}

/** Compat: mantém a assinatura antiga (Response | null). */
export function requireTelegramSecret(req: Request): Response | null {
  const result = verifyTelegramSecret(req);
  return result instanceof Response ? result : null;
}

export interface CallerIdentity {
  /** Chave estável para rate limit: user id real ou "internal:<key_id>". */
  subjectId: string;
  user: AuthedUser | null;
  isInternal: boolean;
}

/**
 * Gate genérico para funções que podem ser chamadas:
 *  - pelo frontend com um JWT de usuário válido, OU
 *  - internamente (função → função / cron) com x-cron-secret ou service role.
 *
 * Diferente da versão antiga, devolve a identidade VERIFICADA para que o
 * rate limit e a auditoria usem um `subjectId` que não pode ser forjado.
 */
export async function resolveCaller(req: Request): Promise<CallerIdentity | Response> {
  if (requireCron(req, { audit: false }) === null) {
    return { subjectId: "internal:cron", user: null, isInternal: true };
  }
  const user = await getUser(req);
  if (user) return { subjectId: user.id, user, isInternal: false };

  logSecurityEvent(req, {
    function_name: functionNameOf(req),
    reason: req.headers.get("authorization")
      ? "invalid_or_expired_jwt"
      : "missing_credentials",
    status_code: 401,
  });
  return unauthorized("Endpoint restrito: autentique-se para usar este recurso.");
}

/** Compat: mantém a assinatura antiga (Response | null). */
export async function requireCaller(req: Request): Promise<Response | null> {
  const caller = await resolveCaller(req);
  return caller instanceof Response ? caller : null;
}
