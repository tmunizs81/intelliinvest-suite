/**
 * ai-router — gateway único para tarefas de IA.
 *
 * POST { task: "insights" | "scoring", payload: {...} }
 *
 * Centraliza: CORS, rate-limit, cache SHA-256, chamada DeepSeek,
 * parsing de tool-call, fallback local. Um bug/otimização aqui
 * beneficia todas as tarefas de uma vez.
 */
import {
  corsHeaders, corsPreflight, jsonResponse, errorResponse, rateLimitResponse,
  extractUserId, isRateLimited, callDeepSeek, parseDeepSeekJson,
} from "../_ai-core.ts";
import { withAICache } from "../ai-cache-helper.ts";
import { buildInsightsPrompt, type InsightsPayload } from "../_ai-prompts/insights.ts";
import { buildScoringPrompt, type ScoringPayload } from "../_ai-prompts/scoring.ts";
import { logMetric } from "../_telemetry.ts";

type TaskBuilder = (payload: any) => {
  cacheKey: string;
  ttlMinutes: number;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
  tool_choice?: unknown;
  fallback?: () => unknown;
};

const TASKS: Record<string, TaskBuilder> = {
  insights: (p: InsightsPayload) => buildInsightsPrompt(p),
  scoring: (p: ScoringPayload) => buildScoringPrompt(p),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();

  const started = performance.now();
  let taskName = "unknown";
  let userId: string | null = null;

  const finish = (status: number, extras: { cache_hit?: boolean; tokens_in?: number; tokens_out?: number; error?: string } = {}) => {
    logMetric({
      function_name: `ai-router:${taskName}`,
      duration_ms: performance.now() - started,
      status_code: status,
      user_id: userId,
      cache_hit: extras.cache_hit,
      tokens_in: extras.tokens_in,
      tokens_out: extras.tokens_out,
      error_message: extras.error,
    });
  };

  let body: { task?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    finish(400, { error: "invalid json" });
    return errorResponse("Body JSON inválido", 400);
  }

  const { task, payload } = body;
  if (!task || typeof task !== "string") { finish(400, { error: "missing task" }); return errorResponse("Campo 'task' obrigatório", 400); }
  if (!payload || typeof payload !== "object") { finish(400, { error: "missing payload" }); return errorResponse("Campo 'payload' obrigatório", 400); }
  taskName = task;

  const builder = TASKS[task];
  if (!builder) { finish(400, { error: "unknown task" }); return errorResponse(`Task desconhecida: ${task}`, 400); }

  userId = extractUserId(req);
  if (isRateLimited(userId)) { finish(429, { error: "rate limited" }); return rateLimitResponse(); }

  let spec;
  try {
    spec = builder(payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Payload inválido";
    finish(400, { error: msg });
    return errorResponse(msg, 400);
  }

  try {
    const result = await withAICache({
      functionName: `ai-router:${task}`,
      prompt: spec.cacheKey,
      ttlMinutes: spec.ttlMinutes,
      callAI: async () => {
        const { response, provider } = await callDeepSeek({
          messages: spec.messages,
          tools: spec.tools,
          tool_choice: spec.tool_choice,
        });
        const parsed = await parseDeepSeekJson(response);
        const text = parsed.toolArgs ?? parsed.text;
        if (!text) throw new Error("Resposta vazia da IA");
        return { text, provider, tokensUsed: parsed.tokensUsed };
      },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      finish(502, { cache_hit: result.cached, error: "parse failure" });
      return errorResponse("Falha ao parsear resposta da IA", 502);
    }

    const tokens = (result as any).tokensUsed ?? {};
    finish(200, {
      cache_hit: result.cached,
      tokens_in: tokens.prompt_tokens,
      tokens_out: tokens.completion_tokens,
    });

    return jsonResponse(parsed, {
      provider: result.provider,
      cached: result.cached,
      cacheAge: result.cacheAge,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ai-router:${task} error:`, msg);

    if (spec.fallback && (msg.startsWith("AI_RATE_LIMIT") || msg.includes("DeepSeek"))) {
      try {
        const fb = spec.fallback();
        finish(200, { error: `fallback: ${msg}` });
        return jsonResponse(fb, { provider: "local" });
      } catch { /* cai pra erro genérico */ }
    }
    finish(500, { error: msg });
    return errorResponse(msg, 500);
  }
});
