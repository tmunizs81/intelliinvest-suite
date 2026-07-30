/**
 * Helpers de autenticação compartilhados por todas as Edge Functions.
 *
 * - requireUser(req): valida o JWT via Supabase (assinatura + expiração) e
 *   devolve o user id real. NUNCA decodifique o payload manualmente.
 * - requireCron(req): exige o header `x-cron-secret` para rotas de cron/admin.
 * - requireTelegramSecret(req): valida o header do webhook do Telegram.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

export interface AuthedUser {
  id: string;
  email: string | null;
  token: string;
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
      };
    }
  } catch {
    /* cai para getUser abaixo */
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null, token };
  } catch {
    return null;
  }
}

/**
 * Igual a getUser, mas lança uma Response 401 pronta para retorno.
 *
 *   const user = await requireUser(req);
 *   if (user instanceof Response) return user;
 */
export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const user = await getUser(req);
  if (!user) return unauthorized("Sessão inválida ou ausente.");
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

/**
 * Rotas de cron/manutenção: exigem o header `x-cron-secret`.
 * Aceita também o service role key no Authorization (invocação servidor→servidor).
 * Retorna uma Response 401 quando a chamada não é confiável.
 */
export function requireCron(req: Request): Response | null {
  // Aceita qualquer um dos segredos de cron configurados (permite rotação sem downtime).
  const candidates = [
    Deno.env.get("CRON_SECRET"),
    Deno.env.get("CRON_SHARED_SECRET"),
  ].filter((v): v is string => Boolean(v));

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ error: "CRON_SECRET não configurado no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const provided = req.headers.get("x-cron-secret") || "";
  if (provided && candidates.some((c) => constantTimeEqual(provided, c))) return null;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && bearer && constantTimeEqual(bearer, serviceKey)) return null;

  return unauthorized("Rota restrita: header x-cron-secret ausente ou inválido.");
}


/** Webhook do Telegram: valida o X-Telegram-Bot-Api-Secret-Token. */
export function requireTelegramSecret(req: Request): Response | null {
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expected) {
    return new Response(
      JSON.stringify({ error: "TELEGRAM_WEBHOOK_SECRET não configurado." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const provided = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (provided && constantTimeEqual(provided, expected)) return null;
  return unauthorized("Update do Telegram rejeitado: secret token inválido.");
}

/**
 * Gate genérico para funções que podem ser chamadas:
 *  - pelo frontend com um JWT de usuário válido, OU
 *  - internamente (função → função / cron) com x-cron-secret ou service role.
 *
 * Retorna Response 401 quando nenhuma das duas condições é satisfeita.
 */
export async function requireCaller(req: Request): Promise<Response | null> {
  if (requireCron(req) === null) return null;
  const user = await getUser(req);
  if (user) return null;
  return unauthorized("Endpoint restrito: autentique-se para usar este recurso.");
}
