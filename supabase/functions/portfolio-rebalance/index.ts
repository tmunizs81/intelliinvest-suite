const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (OPENROUTER_API_KEY) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: body.model || "google/gemini-2.5-flash-preview-09-2025" }),
    });
    if (resp.ok) return { response: resp, provider: "openrouter" };
    console.warn(`OpenRouter failed (${resp.status}), trying Gemini...`);
    try { await resp.text(); } catch {}
  }

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return { response: resp, provider: "gemini" };
    console.warn(`Gemini failed (${resp.status}), trying Groq...`);
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
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "portfolio required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const alloc = totalValue > 0 ? (value / totalValue * 100) : 0;
      return `${a.ticker} (${a.type}, ${a.sector || "N/A"}): R$${value.toFixed(2)} (${alloc.toFixed(1)}%)`;
    }).join("\n");

    const prompt = `Analise esta carteira e sugira rebalanceamento:\n\nPatrimônio: R$${totalValue.toFixed(2)} | ${portfolio.length} ativos\n${portfolioText}\n\nConsidere: diversificação ideal por tipo (Ações, FIIs, ETFs, Cripto, Renda Fixa), concentração setorial, e mercado atual.`;

    const { response, provider } = await callAI({
      messages: [
        { role: "system", content: "Você é um consultor financeiro especialista em alocação de ativos no mercado brasileiro. Sugira rebalanceamento prático e acionável." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_rebalance",
          description: "Return rebalancing suggestions",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Overall assessment (max 100 chars)" },
              current_allocation: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    current_pct: { type: "number" },
                    ideal_pct: { type: "number" },
                    diff_pct: { type: "number" },
                  },
                  required: ["category", "current_pct", "ideal_pct", "diff_pct"],
                  additionalProperties: false,
                },
              },
              suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["buy", "sell", "hold"] },
                    ticker: { type: "string" },
                    reason: { type: "string", description: "Brief reason (max 80 chars)" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                  },
                  required: ["action", "ticker", "reason", "priority"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "current_allocation", "suggestions"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_rebalance" } },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
    });
  } catch (err) {
    console.error("portfolio-rebalance error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
