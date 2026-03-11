

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { portfolio, goal_amount, goal_years, monthly_contribution } = await req.json();

    const totalValue = portfolio?.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0) || 0;

    const prompt = `O investidor tem R$${totalValue.toFixed(2)} em patrimônio e quer atingir R$${goal_amount} em ${goal_years} anos.
${monthly_contribution ? `Ele pode investir R$${monthly_contribution}/mês.` : 'Calcule quanto ele precisa investir por mês.'}

Calcule: aporte mensal necessário, taxa de retorno necessária, probabilidade de sucesso e sugira alocação ideal.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um planejador financeiro especialista brasileiro. Calcule metas de investimento com precisão e sugira alocações realistas." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "calculate_goal",
            description: "Return investment goal calculation",
            parameters: {
              type: "object",
              properties: {
                monthly_needed: { type: "number" },
                required_return_pct: { type: "number" },
                probability_pct: { type: "number" },
                years_to_goal: { type: "number" },
                projected_total: { type: "number" },
                summary: { type: "string" },
                suggested_allocation: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      pct: { type: "number" },
                      reason: { type: "string" },
                    },
                    required: ["category", "pct", "reason"],
                    additionalProperties: false,
                  },
                },
                milestones: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      year: { type: "number" },
                      projected_value: { type: "number" },
                    },
                    required: ["year", "projected_value"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["monthly_needed", "required_return_pct", "probability_pct", "years_to_goal", "projected_total", "summary", "suggested_allocation", "milestones"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "calculate_goal" } },
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

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("investment-goals error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
