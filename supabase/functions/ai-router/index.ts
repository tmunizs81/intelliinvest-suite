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

  let body: { task?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const { task, payload } = body;
  if (!task || typeof task !== "string") return errorResponse("Campo 'task' obrigatório", 400);
  if (!payload || typeof payload !== "object") return errorResponse("Campo 'payload' obrigatório", 400);

  const builder = TASKS[task];
  if (!builder) return errorResponse(`Task desconhecida: ${task}. Disponíveis: ${Object.keys(TASKS).join(", ")}`, 400);

  const userId = extractUserId(req);
  if (isRateLimited(userId)) return rateLimitResponse();

  let spec;
  try {
    spec = builder(payload);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Payload inválido", 400);
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
      return errorResponse("Falha ao parsear resposta da IA", 502);
    }

    return jsonResponse(parsed, {
      provider: result.provider,
      cached: result.cached,
      cacheAge: result.cacheAge,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ai-router:${task} error:`, msg);

    // Fallback local se a task fornecer
    if (spec.fallback && (msg.startsWith("AI_RATE_LIMIT") || msg.includes("DeepSeek"))) {
      try {
        const fb = spec.fallback();
        return jsonResponse(fb, { provider: "local" });
      } catch {
        /* cai pra erro genérico */
      }
    }
    return errorResponse(msg, 500);
  }
});
