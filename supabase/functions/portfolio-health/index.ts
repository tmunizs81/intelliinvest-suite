

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { portfolio } = await req.json();
    if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "portfolio array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const alloc = totalValue > 0 ? (value / totalValue * 100) : 0;
      return `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): Alocação ${alloc.toFixed(1)}%, Var24h: ${a.change24h?.toFixed(2)}%`;
    }).join("\n");

    const prompt = `Analise esta carteira e gere um Health Score de 0-100:

Patrimônio: R$${totalValue.toFixed(2)} | Retorno: ${totalReturn.toFixed(2)}% | ${portfolio.length} ativos
${portfolioText}

Avalie: diversificação, concentração, exposição cambial, volatilidade, correlação entre ativos.
Use a ferramenta generate_health_score para retornar o resultado estruturado.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de risco especializado em carteiras de investimento brasileiras. Avalie a saúde da carteira de forma objetiva." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_health_score",
            description: "Return portfolio health score and breakdown",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number", description: "Overall health score 0-100" },
                grade: { type: "string", enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F"] },
                summary: { type: "string", description: "One-line assessment in Portuguese (max 80 chars)" },
                dimensions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Dimension name in Portuguese" },
                      score: { type: "number", description: "Score 0-100 for this dimension" },
                      description: { type: "string", description: "Brief assessment (max 60 chars)" },
                    },
                    required: ["name", "score", "description"],
                    additionalProperties: false,
                  },
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 actionable recommendations in Portuguese",
                },
              },
              required: ["score", "grade", "summary", "dimensions", "recommendations"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_health_score" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("portfolio-health error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
