import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { portfolio } = await req.json();
    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "Portfolio vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um analista quantitativo de investimentos brasileiro. Você recebe uma carteira de ativos e deve classificar CADA ativo em 4 dimensões com nota de 1 a 10, além de uma nota final composta.

DIMENSÕES:
1. **Valuation** (1-10): O ativo está barato ou caro em relação ao seu valor justo? Considere P/L, P/VP, preço médio vs preço atual.
2. **Momento** (1-10): O ativo tem momentum positivo? Considere variação recente, tendência, change24h.
3. **Dividendos** (1-10): O ativo é bom pagador de dividendos? Considere setor, tipo (FII paga mais), histórico implícito.
4. **Risco** (1-10): Quanto menor o risco, maior a nota. Considere volatilidade implícita, concentração, tipo de ativo.

NOTA FINAL: Média ponderada (Valuation 30%, Momento 25%, Dividendos 25%, Risco 20%).

REGRAS:
- Responda SEMPRE em português brasileiro
- FIIs tendem a ter nota alta em dividendos
- Ações com preço atual abaixo do preço médio = valuation mais alto
- Variação positiva = momento mais alto
- ETFs e FIIs geralmente têm risco menor que ações individuais
- Cripto tem risco mais alto`;

    const userPrompt = `Analise e classifique cada ativo desta carteira:

${JSON.stringify(portfolio.map((a: any) => ({
  ticker: a.ticker,
  name: a.name,
  type: a.type,
  quantity: a.quantity,
  avgPrice: a.avgPrice,
  currentPrice: a.currentPrice,
  change24h: a.change24h,
  allocation: a.allocation,
  sector: a.sector,
})), null, 2)}

Classifique cada ativo nas 4 dimensões e dê a nota final.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
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
                        valuation: { type: "number", description: "1-10 score" },
                        momentum: { type: "number", description: "1-10 score" },
                        dividends: { type: "number", description: "1-10 score" },
                        risk: { type: "number", description: "1-10 risk-adjusted score (higher=safer)" },
                        overall: { type: "number", description: "Weighted average 1-10" },
                        summary: { type: "string", description: "One-line summary in Portuguese (max 80 chars)" },
                      },
                      required: ["ticker", "valuation", "momentum", "dividends", "risk", "overall", "summary"],
                      additionalProperties: false,
                    },
                  },
                  topPick: { type: "string", description: "Ticker of the best asset to buy now" },
                  worstPick: { type: "string", description: "Ticker of the worst-scoring asset" },
                  insight: { type: "string", description: "General portfolio insight in Portuguese (1-2 sentences)" },
                },
                required: ["scores", "topPick", "worstPick", "insight"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "asset_scoring" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-scoring error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
