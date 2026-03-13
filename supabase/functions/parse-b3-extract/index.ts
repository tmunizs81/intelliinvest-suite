

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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
    const { csvContent } = await req.json();
    if (!csvContent) {
      return new Response(JSON.stringify({ error: "csvContent required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit content size
    const content = csvContent.substring(0, 15000);

    const prompt = `Extraia as operações de compra e venda do seguinte extrato/nota de corretagem da B3/CEI:

${content}

Identifique: ticker, nome do ativo, tipo (Ação, FII, ETF), operação (buy/sell), quantidade, preço unitário, data, taxas e se é daytrade.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um parser especializado em extratos de corretagem da B3 e CEI. Extraia operações de forma precisa." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "parse_b3_extract",
            description: "Return parsed B3/CEI operations",
            parameters: {
              type: "object",
              properties: {
                broker: { type: "string", description: "Broker name if identified" },
                operations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string", enum: ["Ação", "FII", "ETF", "ETF Internacional", "Cripto", "Renda Fixa"] },
                      operation: { type: "string", enum: ["buy", "sell"] },
                      quantity: { type: "number" },
                      price: { type: "number" },
                      total: { type: "number" },
                      fees: { type: "number" },
                      date: { type: "string", description: "YYYY-MM-DD format" },
                      is_daytrade: { type: "boolean" },
                    },
                    required: ["ticker", "name", "type", "operation", "quantity", "price", "total", "fees", "date", "is_daytrade"],
                    additionalProperties: false,
                  },
                },
                summary: { type: "string", description: "Brief summary in Portuguese" },
              },
              required: ["broker", "operations", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "parse_b3_extract" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-b3-extract error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
