

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

    const { text_content } = await req.json();
    if (!text_content) {
      return new Response(JSON.stringify({ error: "text_content required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Extraia todas as operações de compra e venda desta nota de corretagem da B3:

${text_content}

Para cada operação identifique: ticker, nome, tipo (Ação/FII/ETF/BDR), operação (buy/sell), quantidade, preço unitário, total, taxas.
Identifique também a data da nota e a corretora.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um especialista em extrair dados de notas de corretagem da B3 (bolsa brasileira). Extraia com precisão todos os dados de operações. Tickers brasileiros terminam em números (ex: PETR4, VALE3). FIIs terminam em 11 (ex: HGLG11)." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_trades",
            description: "Extract trades from brokerage note",
            parameters: {
              type: "object",
              properties: {
                broker: { type: "string", description: "Corretora name" },
                date: { type: "string", description: "Note date YYYY-MM-DD" },
                trades: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      name: { type: "string" },
                      type: { type: "string", enum: ["Ação", "FII", "ETF", "BDR", "ETF Internacional"] },
                      operation: { type: "string", enum: ["buy", "sell"] },
                      quantity: { type: "number" },
                      price: { type: "number" },
                      total: { type: "number" },
                      fees: { type: "number" },
                    },
                    required: ["ticker", "name", "type", "operation", "quantity", "price", "total"],
                    additionalProperties: false,
                  },
                },
                total_fees: { type: "number" },
                total_bought: { type: "number" },
                total_sold: { type: "number" },
                net_total: { type: "number" },
                confidence: { type: "number", description: "Extraction confidence 0-100" },
                notes: { type: "string", description: "Any parsing notes or warnings" },
              },
              required: ["broker", "date", "trades", "total_fees", "total_bought", "total_sold", "net_total", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_trades" } },
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
    console.error("parse-brokerage-note error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
