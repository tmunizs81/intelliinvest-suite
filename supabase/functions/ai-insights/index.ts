const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

// ─── Per-user rate limiting ───
const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 10;

function isRateLimited(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let userId = "anon";
  try { if (parts[1]) { const p = JSON.parse(atob(parts[1])); userId = p.sub || "anon"; } } catch {}
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter(t => now - t < 60000);
  if (calls.length >= MAX_CALLS_PER_MIN) return true;
  calls.push(now);
  userCalls.set(userId, calls);
  return false;
}

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return { response: resp, provider: "gemini" };
    console.warn(`Gemini failed (${resp.status}), trying Groq fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
  return { response: groqResp, provider: "groq" };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio } = await req.json();
    if (!portfolio || !Array.isArray(portfolio)) return new Response(JSON.stringify({ error: "portfolio array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

    // Helper to build local fallback insights
    const buildFallback = (reason: string) => {
      const topAsset = portfolio.reduce((a: any, b: any) => ((b.allocation || 0) > (a.allocation || 0) ? b : a), portfolio[0]);
      const negativeAssets = portfolio.filter((a: any) => (a.change24h || 0) < -3);
      const fallbackInsights: any[] = [
        { type: "analysis", title: "Resumo da carteira", description: `Patrimônio de R$${totalValue.toFixed(0)} com ${portfolio.length} ativos. Retorno total: ${totalReturn.toFixed(1)}%.`, severity: "info" },
        { type: "alert", title: `Maior posição: ${topAsset.ticker}`, description: `${topAsset.ticker} representa ${(topAsset.allocation || 0).toFixed(1)}% da carteira. Avalie concentração.`, severity: (topAsset.allocation || 0) > 20 ? "warning" : "info", ticker: topAsset.ticker },
      ];
      if (negativeAssets.length > 0) {
        fallbackInsights.push({ type: "alert", title: `${negativeAssets.length} ativo(s) em queda forte`, description: negativeAssets.map((a: any) => `${a.ticker} (${(a.change24h || 0).toFixed(1)}%)`).join(", "), severity: "warning", ticker: negativeAssets[0].ticker });
      }
      return new Response(JSON.stringify({
        insights: fallbackInsights,
        summary: `Carteira com ${portfolio.length} ativos e retorno de ${totalReturn.toFixed(1)}% (${reason})`,
        _provider: "local", _fallback: true, timestamp: new Date().toISOString(),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // Rate limit → return local fallback instead of 429
    if (isRateLimited(req)) {
      console.warn("Rate limited, returning local fallback");
      return buildFallback("limite de chamadas");
    }

    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const cost = a.avgPrice * a.quantity;
      const profit = value - cost;
      const profitPct = cost > 0 ? (profit / cost * 100) : 0;
      return `- ${a.ticker} (${a.type}, ${a.sector}): ${a.quantity} unidades, PM R$${a.avgPrice.toFixed(2)}, Atual R$${a.currentPrice.toFixed(2)}, Variação 24h: ${a.change24h.toFixed(2)}%, Lucro: R$${profit.toFixed(2)} (${profitPct.toFixed(1)}%), Alocação: ${a.allocation.toFixed(1)}%`;
    }).join("\n");

    const userPrompt = `Analise esta carteira de investimentos com cotações reais do Yahoo Finance:

RESUMO:
- Patrimônio Total: R$${totalValue.toFixed(2)}
- Custo Total: R$${totalCost.toFixed(2)}
- Retorno Total: ${totalReturn.toFixed(2)}%
- Número de Ativos: ${portfolio.length}

ATIVOS:
${portfolioText}

Data atual: ${new Date().toLocaleDateString('pt-BR')}

Gere insights inteligentes, alertas e recomendações baseados nestes dados reais.`;

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista de investimentos sênior especializado no mercado brasileiro. Analise a carteira e gere insights acionáveis, alertas de risco e recomendações práticas. Responda sempre em português." },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_insights",
          description: "Return structured investment insights for the portfolio",
          parameters: {
            type: "object",
            properties: {
              insights: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["recommendation", "alert", "analysis"] },
                    title: { type: "string", description: "Short title (max 60 chars)" },
                    description: { type: "string", description: "Detailed explanation (max 200 chars)" },
                    severity: { type: "string", enum: ["info", "warning", "critical"] },
                    ticker: { type: "string" },
                  },
                  required: ["type", "title", "description", "severity"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string", description: "One-line assessment (max 100 chars)" },
            },
            required: ["insights", "summary"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_insights" } },
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        return buildFallback("análise local");
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ insights: parsed.insights, summary: parsed.summary, _provider: provider, timestamp: new Date().toISOString() }), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-insights error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
