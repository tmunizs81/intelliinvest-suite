/**
 * Núcleo compartilhado para todas as chamadas de IA.
 * Elimina duplicação de CORS, rate-limit, chamada DeepSeek, parsing e erros.
 *
 * Uso:
 *   import { corsHeaders, handleAI } from "../_ai-core.ts";
 *   Deno.serve((req) => handleAI(req, { task: "insights", payload }));
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider, x-ai-cached, x-ai-cache-age",
};

// ─── Rate limit por usuário (in-memory, por instância) ───
const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 15;

export function extractUserId(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  try {
    if (parts[1]) {
      const p = JSON.parse(atob(parts[1]));
      return p.sub || "anon";
    }
  } catch { /* ignore */ }
  return "anon";
}

export function isRateLimited(userId: string, max = MAX_CALLS_PER_MIN): boolean {
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter((t) => now - t < 60_000);
  if (calls.length >= max) return true;
  calls.push(now);
  userCalls.set(userId, calls);
  return false;
}

// ─── DeepSeek client ───
export interface DeepSeekBody {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: unknown;
}

export interface DeepSeekResult {
  response: Response;
  provider: "deepseek";
}

export async function callDeepSeek(body: DeepSeekBody): Promise<DeepSeekResult> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) throw new Error("DEEPSEEK_API_KEY não configurada");

  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model: "deepseek-chat" }),
  });
  return { response: resp, provider: "deepseek" };
}

/** Extrai texto/tool-call de uma resposta JSON não-streaming do DeepSeek. */
export async function parseDeepSeekJson(response: Response): Promise<{
  text: string;
  tokensUsed: number;
  toolArgs?: string;
}> {
  if (!response.ok) {
    const status = response.status;
    if (status === 429 || status === 402) throw new Error(`AI_RATE_LIMIT:${status}`);
    const txt = await response.text().catch(() => "");
    throw new Error(`DeepSeek error ${status}: ${txt.slice(0, 200)}`);
  }
  const data = await response.json();
  const choice = data.choices?.[0]?.message;
  const toolArgs = choice?.tool_calls?.[0]?.function?.arguments;
  const text = choice?.content ?? "";
  return { text, tokensUsed: data.usage?.total_tokens || 0, toolArgs };
}

// ─── Respostas padronizadas ───
export function jsonResponse(
  body: unknown,
  init: { status?: number; provider?: string; cached?: boolean; cacheAge?: number } = {},
): Response {
  const headers: Record<string, string> = { ...corsHeaders, "Content-Type": "application/json" };
  if (init.provider) headers["x-ai-provider"] = init.provider;
  if (init.cached != null) headers["x-ai-cached"] = String(init.cached);
  if (init.cacheAge != null) headers["x-ai-cache-age"] = String(init.cacheAge);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, { status });
}

export function rateLimitResponse(): Response {
  return jsonResponse(
    { error: "Rate limit: máximo de chamadas/minuto atingido.", retryAfter: 60 },
    { status: 429 },
  );
}

export function corsPreflight(): Response {
  return new Response(null, { headers: corsHeaders });
}
