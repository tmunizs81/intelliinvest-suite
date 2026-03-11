

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um analista técnico de investimentos especialista no mercado brasileiro.
Receba dados OHLCV e indicadores técnicos calculados de um ativo.
Sua tarefa é produzir um RESUMO VISUAL do que o gráfico está mostrando, como se estivesse descrevendo o gráfico para alguém.

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja conciso mas informativo
- Foque no que os indicadores estão dizendo AGORA
- Mencione BB, RSI, MACD, médias móveis e volume
- Identifique confluências entre indicadores`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { ticker, name, type, indicators, recentCandles } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = `Analise o gráfico do ativo ${ticker} (${name || ticker}, tipo: ${type || "Ação"}).

INDICADORES TÉCNICOS ATUAIS:
${JSON.stringify(indicators, null, 2)}

ÚLTIMOS 15 CANDLES (OHLCV):
${JSON.stringify(recentCandles, null, 2)}

Data atual: ${new Date().toLocaleDateString("pt-BR")}

Forneça um resumo do que os indicadores do gráfico estão mostrando.`;

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
              name: "chart_summary",
              description: "Return structured chart analysis summary",
              parameters: {
                type: "object",
                properties: {
                  overview: {
                    type: "string",
                    description: "Resumo geral do gráfico em 2-3 frases. Descreva o que as Bandas de Bollinger, RSI, MACD e médias móveis mostram.",
                  },
                  trend_strength: {
                    type: "string",
                    enum: ["forte", "moderada", "fraca"],
                    description: "Força da tendência atual",
                  },
                  momentum: {
                    type: "string",
                    enum: ["positivo", "negativo", "neutro"],
                    description: "Direção do momentum baseado em MACD e RSI",
                  },
                  volatility: {
                    type: "string",
                    enum: ["alta", "média", "baixa"],
                    description: "Nível de volatilidade baseado nas Bandas de Bollinger",
                  },
                  key_levels: {
                    type: "string",
                    description: "Níveis de suporte/resistência identificados no gráfico, em uma frase",
                  },
                  action_summary: {
                    type: "string",
                    description: "Conclusão prática em uma frase: o que os indicadores sugerem fazer agora",
                  },
                },
                required: ["overview", "trend_strength", "momentum", "volatility", "key_levels", "action_summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "chart_summary" } },
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
          JSON.stringify({ error: "Créditos insuficientes." }),
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
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-chart-summary error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
