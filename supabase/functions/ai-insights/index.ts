import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um consultor de investimentos AI de elite, especialista no mercado brasileiro (B3), criptomoedas, renda fixa e fundos imobiliários.

Você recebe dados da carteira do usuário com cotações reais do Yahoo Finance. Sua função é analisar e gerar insights acionáveis.

REGRAS:
- Responda SEMPRE em português brasileiro
- Use linguagem profissional mas acessível
- Seja direto e objetivo
- Forneça números e percentuais quando possível
- Use tool calling para retornar insights estruturados
- Gere entre 3 e 6 insights relevantes
- Cada insight deve ter ação clara

TIPOS DE ANÁLISE:
1. Concentração de risco (setorial, por ativo)
2. Ativos em destaque (maiores altas/quedas do dia)
3. Oportunidades de rebalanceamento
4. Análise de custo médio vs preço atual
5. Alertas de risco (queda acentuada, volatilidade)
6. Dividendos e eventos corporativos potenciais
7. Comparação com benchmarks (CDI, Ibovespa)`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { portfolio } = await req.json();

    if (!portfolio || !Array.isArray(portfolio)) {
      return new Response(
        JSON.stringify({ error: "portfolio array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build portfolio summary for the AI
    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
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
                        type: {
                          type: "string",
                          enum: ["recommendation", "alert", "analysis"],
                          description: "Type of insight",
                        },
                        title: {
                          type: "string",
                          description: "Short title for the insight (max 60 chars)",
                        },
                        description: {
                          type: "string",
                          description: "Detailed explanation with numbers and actionable advice (max 200 chars)",
                        },
                        severity: {
                          type: "string",
                          enum: ["info", "warning", "critical"],
                          description: "Severity level",
                        },
                        ticker: {
                          type: "string",
                          description: "Related ticker symbol, if applicable",
                        },
                      },
                      required: ["type", "title", "description", "severity"],
                      additionalProperties: false,
                    },
                  },
                  summary: {
                    type: "string",
                    description: "One-line overall portfolio assessment in Portuguese (max 100 chars)",
                  },
                },
                required: ["insights", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error("No structured response from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        insights: parsed.insights,
        summary: parsed.summary,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-insights error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
