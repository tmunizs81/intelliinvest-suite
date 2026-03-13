const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 10;

function checkRateLimit(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let userId = "anon";
  try { if (parts[1]) { const p = JSON.parse(atob(parts[1])); userId = p.sub || "anon"; } } catch {}
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter(t => now - t < 60000);
  if (calls.length >= MAX_CALLS_PER_MIN) {
    return new Response(JSON.stringify({ error: "Rate limit: máximo de 10 chamadas/minuto." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  calls.push(now);
  userCalls.set(userId, calls);
  return null;
}

async function callAI(body: any): Promise<Response> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return resp;
    console.warn(`Gemini failed (${resp.status}), trying Groq fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { tickers, assets } = await req.json();
    const assetList = (assets || []).slice(0, 8);

    // Fetch historical data for top assets in parallel
    const historyPromises = assetList.map((a: any) => fetchHistory(a.ticker, req));
    const histories = await Promise.all(historyPromises);

    // Build rich context with historical data
    const assetsInfo = assetList.map((a: any, i: number) => {
      const candles = histories[i] || [];
      const summary = summarizeCandles(candles);
      return `── ${a.ticker} (${a.name}) ──
Preço: R$${a.currentPrice?.toFixed(2)}, Var.24h: ${a.change24h?.toFixed(2)}%
${summary}`;
    }).join('\n\n');

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um analista técnico especializado em padrões gráficos do mercado financeiro.
Analise os dados históricos de preços (OHLCV) fornecidos e identifique padrões gráficos reais.

Padrões a considerar: OCO, OCO Invertido, Triângulo Ascendente/Descendente/Simétrico, Bandeira de Alta/Baixa,
Canal de Alta/Baixa, Cunha Ascendente/Descendente, Retângulo, Topo/Fundo Duplo, Cup and Handle, 
Suporte/Resistência, Engolfo de Alta/Baixa, Martelo, Doji, Estrela Cadente, Harami.

Use os dados de preço reais (OHLCV) para fundamentar sua análise. Compare máximas, mínimas, médias móveis e volume.
SEMPRE identifique pelo menos 3-5 padrões. Use a ferramenta para retornar o resultado.`,
        },
        { role: "user", content: `Analise os padrões gráficos com base nos dados históricos reais:\n\n${assetsInfo}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_patterns",
          description: "Report detected chart patterns based on historical price data",
          parameters: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" },
                    pattern: { type: "string", description: "Nome do padrão gráfico detectado" },
                    type: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                    reliability: { type: "string", enum: ["Alta", "Média", "Baixa"] },
                    description: { type: "string", description: "Explicação baseada nos dados de preço" },
                    target: { type: "string", description: "Preço alvo estimado, ex: R$35.50" },
                  },
                  required: ["ticker", "pattern", "type", "reliability", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["patterns"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_patterns" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();

    // Try tool_calls first
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {}
    }

    // Fallback: parse content
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { patterns: [] };
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("pattern-detector error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
