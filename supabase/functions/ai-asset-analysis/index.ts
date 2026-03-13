const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body: any): Promise<Response> {

  if (DEEPSEEK_API_KEY) {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "deepseek-chat" }),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`DeepSeek failed (${resp.status}), trying Gemini fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GEMINI_API_KEY) throw new Error("No AI provider available");
  console.log("Using Gemini fallback");
  return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
  });
}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`Lovable AI failed (${resp.status}), trying DeepSeek fallback...`);
    try { await resp.text(); } catch {}
  }
  if (!DEEPSEEK_API_KEY) throw new Error("No AI provider available");
  console.log("Using DeepSeek fallback");
  return fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "deepseek-chat" }),
  });
}

const SYSTEM_PROMPT = `Você é um analista técnico de investimentos especialista no mercado brasileiro. 
Você recebe dados OHLCV reais de um ativo e indicadores técnicos calculados.
Sua função é fazer uma análise técnica profunda e dar recomendações.

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja técnico mas acessível
- Mencione níveis de suporte/resistência
- Analise tendências, padrões e volume
- Dê uma conclusão clara (compra, venda, manter)
- Use os indicadores técnicos fornecidos na análise`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, name, type, indicators, recentCandles, holdingInfo } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = `Analise tecnicamente o ativo ${ticker} (${name || ticker}, tipo: ${type || "Ação"}).

INDICADORES TÉCNICOS ATUAIS:
${JSON.stringify(indicators, null, 2)}

ÚLTIMOS 10 CANDLES (OHLCV):
${JSON.stringify(recentCandles?.slice(-10), null, 2)}

${holdingInfo ? `POSIÇÃO DO INVESTIDOR:
- Quantidade: ${holdingInfo.quantity}
- Preço Médio: R$${holdingInfo.avgPrice}
- Preço Atual: R$${holdingInfo.currentPrice}
- Lucro/Prejuízo: ${holdingInfo.profitPct}%` : ""}

Data atual: ${new Date().toLocaleDateString("pt-BR")}

Faça uma análise técnica completa incluindo:
1. Tendência atual (alta, baixa, lateral)
2. Suportes e resistências
3. Análise dos indicadores (RSI, MACD, médias móveis)
4. Volume e momentum
5. Padrões gráficos identificados
6. Recomendação clara com alvos de preço`;

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "asset_analysis",
            description: "Return structured technical analysis",
            parameters: {
              type: "object",
              properties: {
                trend: { type: "string", enum: ["alta", "baixa", "lateral"] },
                recommendation: { type: "string", enum: ["compra_forte", "compra", "manter", "venda", "venda_forte"] },
                confidence: { type: "number" },
                summary: { type: "string", description: "One-line summary in Portuguese (max 120 chars)" },
                analysis: { type: "string", description: "Full technical analysis text in Portuguese (2-4 paragraphs)" },
                support: { type: "number" },
                resistance: { type: "number" },
                targetPrice: { type: "number" },
                stopLoss: { type: "number" },
              },
              required: ["trend", "recommendation", "confidence", "summary", "analysis"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "asset_analysis" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(
      JSON.stringify({ ...parsed, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-asset-analysis error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
