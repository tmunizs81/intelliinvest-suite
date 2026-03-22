import { withAICache, normalizePortfolioForCache } from "../ai-cache-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

// ─── Per-user rate limiting ───
const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 10;

function checkRateLimit(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let userId = "anon";
  try { if (parts[1]) { const p = JSON.parse(atob(parts[1])); userId = p.sub || "anon"; } } catch {}
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter(t => now - t < 60000);
  if (calls.length >= MAX_CALLS_PER_MIN) {
    return new Response(JSON.stringify({ error: "Rate limit: máximo de 10 chamadas/minuto." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  calls.push(now);
  userCalls.set(userId, calls);
  return null;
}

async function callAI(body) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");

  // Primary: DeepSeek
  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
      console.warn("DeepSeek failed:", resp.status, "falling back to Lovable AI");
    } catch (e) { console.warn("DeepSeek error, falling back:", e); }
  }
  throw new Error("DeepSeek API unavailable");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { portfolio } = await req.json();
    if (!portfolio || portfolio.length === 0) return new Response(JSON.stringify({ error: "Portfolio vazio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const systemPrompt = `Você é um analista quantitativo de investimentos brasileiro. Classifique CADA ativo em 4 dimensões com nota de 1 a 10.

DIMENSÕES:
1. **Valuation** (1-10): Barato ou caro vs valor justo?
2. **Momento** (1-10): Momentum positivo?
3. **Dividendos** (1-10): Bom pagador?
4. **Risco** (1-10): Menor risco = maior nota.

NOTA FINAL: Média ponderada (Valuation 30%, Momento 25%, Dividendos 25%, Risco 20%).`;

    const userPrompt = `Analise e classifique cada ativo:\n\n${JSON.stringify(portfolio.map((a: any) => ({
      ticker: a.ticker, name: a.name, type: a.type, quantity: a.quantity,
      avgPrice: a.avgPrice, currentPrice: a.currentPrice, change24h: a.change24h,
      allocation: a.allocation, sector: a.sector,
    })), null, 2)}`;

    const cachePrompt = `scoring:${normalizePortfolioForCache(portfolio)}`;

    const cacheResult = await withAICache({
      functionName: "ai-scoring",
      prompt: cachePrompt,
      ttlMinutes: 60, // Scoring valid for 1 hour
      callAI: async () => {
        const { response, provider } = await callAI({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "asset_scoring",
              description: "Return scoring for each asset",
              parameters: {
                type: "object",
                properties: {
                  scores: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        ticker: { type: "string" },
                        valuation: { type: "number" }, momentum: { type: "number" },
                        dividends: { type: "number" }, risk: { type: "number" },
                        overall: { type: "number" },
                        summary: { type: "string", description: "One-line summary (max 80 chars)" },
                      },
                      required: ["ticker", "valuation", "momentum", "dividends", "risk", "overall", "summary"],
                      additionalProperties: false,
                    },
                  },
                  topPick: { type: "string" }, worstPick: { type: "string" },
                  insight: { type: "string" },
                },
                required: ["scores", "topPick", "worstPick", "insight"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "asset_scoring" } },
        });

        if (!response.ok) {
          if (response.status === 429 || response.status === 402) throw new Error(`AI_RATE_LIMIT:${response.status}`);
          const text = await response.text();
          throw new Error(`AI gateway error: ${response.status}`);
        }

        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall?.function?.arguments) throw new Error("No structured response");

        return { text: toolCall.function.arguments, provider, tokensUsed: data.usage?.total_tokens || 0 };
      },
    });

    const parsed = JSON.parse(cacheResult.text);
    return new Response(JSON.stringify({ ...parsed, _cached: cacheResult.cached, _cacheAge: cacheResult.cacheAge }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": cacheResult.provider },
    });
  } catch (err) {
    console.error("ai-scoring error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
