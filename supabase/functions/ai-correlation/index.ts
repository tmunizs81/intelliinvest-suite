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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio } = await req.json();
    if (!portfolio?.length || portfolio.length < 2) return new Response(JSON.stringify({ error: "Mínimo 2 ativos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const portfolioText = portfolio.map((a: any) =>
      `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): ${a.quantity}un, R$${a.currentPrice?.toFixed(2)}, Aloc: ${a.allocation?.toFixed(1)}%`
    ).join("\n");

    const response = await callAI({
      model: "gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Você é um analista quantitativo especialista em correlações e risco de carteira." },
        { role: "user", content: `Analise correlações e riscos ocultos nesta carteira:\n\n${portfolioText}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "correlation_analysis",
          description: "Return correlation analysis",
          parameters: {
            type: "object",
            properties: {
              risk_score: { type: "number" },
              high_correlation_pairs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pair: { type: "string" }, estimated_correlation: { type: "number" }, reason: { type: "string" },
                  },
                  required: ["pair", "estimated_correlation", "reason"], additionalProperties: false,
                },
              },
              hidden_risks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    risk: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] },
                    affected_tickers: { type: "array", items: { type: "string" } },
                  },
                  required: ["risk", "severity", "affected_tickers"], additionalProperties: false,
                },
              },
              diversification_suggestions: { type: "array", items: { type: "string" } },
              summary: { type: "string" },
            },
            required: ["risk_score", "high_correlation_pairs", "hidden_risks", "diversification_suggestions", "summary"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "correlation_analysis" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-correlation error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
