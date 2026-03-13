const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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

  // Fallback: Lovable AI
  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
  });
  return { response: resp, provider: "lovable" };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, name, type, indicators, recentCandles } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userPrompt = `Analise o gráfico do ativo ${ticker} (${name || ticker}, tipo: ${type || "Ação"}).

INDICADORES TÉCNICOS ATUAIS:
${JSON.stringify(indicators, null, 2)}

ÚLTIMOS 15 CANDLES (OHLCV):
${JSON.stringify(recentCandles, null, 2)}

Data atual: ${new Date().toLocaleDateString("pt-BR")}

Forneça um resumo do que os indicadores do gráfico estão mostrando.`;

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista técnico especializado em leitura de gráficos de ativos do mercado brasileiro. Analise os dados de candles e indicadores técnicos fornecidos e gere um resumo conciso da situação técnica do ativo. Responda em português." },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "chart_summary",
          description: "Return structured chart analysis summary",
          parameters: {
            type: "object",
            properties: {
              overview: { type: "string", description: "Resumo geral do gráfico em 2-3 frases." },
              trend_strength: { type: "string", enum: ["forte", "moderada", "fraca"] },
              momentum: { type: "string", enum: ["positivo", "negativo", "neutro"] },
              volatility: { type: "string", enum: ["alta", "média", "baixa"] },
              key_levels: { type: "string", description: "Níveis de suporte/resistência identificados" },
              action_summary: { type: "string", description: "Conclusão prática em uma frase" },
            },
            required: ["overview", "trend_strength", "momentum", "volatility", "key_levels", "action_summary"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "chart_summary" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    return new Response(JSON.stringify(JSON.parse(toolCall.function.arguments)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-chart-summary error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
