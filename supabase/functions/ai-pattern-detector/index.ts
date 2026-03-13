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
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`Gemini failed (${resp.status}), trying DeepSeek fallback...`);
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

async function fetchHistory(ticker: string, req: Request): Promise<any[]> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return [];

    const resp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": req.headers.get("authorization") || `Bearer ${anonKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify({ ticker, range: "3mo", interval: "1d" }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) { await resp.text(); return []; }
    const data = await resp.json();
    return data.candles || [];
  } catch (err) {
    console.warn(`Failed to fetch history for ${ticker}:`, err);
    return [];
  }
}

function summarizeCandles(candles: any[]): string {
  if (!candles.length) return "Sem dados históricos disponíveis.";

  const last30 = candles.slice(-30);
  const last10 = candles.slice(-10);
  const first = last30[0];
  const last = last30[last30.length - 1];

  const highs = last30.map((c: any) => c.high);
  const lows = last30.map((c: any) => c.low);
  const closes = last30.map((c: any) => c.close);
  const volumes = last30.map((c: any) => c.volume);

  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const avgVolume = Math.round(volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length);

  // Simple moving averages
  const sma10 = closes.slice(-10).reduce((a: number, b: number) => a + b, 0) / Math.min(10, closes.length);
  const sma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / Math.min(20, closes.length);

  // Trend
  const change30d = first.close > 0 ? ((last.close - first.close) / first.close * 100).toFixed(2) : "N/A";
  const change10d = last10.length > 1 && last10[0].close > 0
    ? ((last10[last10.length - 1].close - last10[0].close) / last10[0].close * 100).toFixed(2) : "N/A";

  // Recent price action (last 10 candles)
  const recentPrices = last10.map((c: any) =>
    `${c.date}: O=${c.open?.toFixed(2)} H=${c.high?.toFixed(2)} L=${c.low?.toFixed(2)} C=${c.close?.toFixed(2)} V=${c.volume}`
  ).join('\n');

  return `Últimos 30 dias: Máxima=${maxHigh.toFixed(2)}, Mínima=${minLow.toFixed(2)}, Var30d=${change30d}%, Var10d=${change10d}%
SMA10=${sma10.toFixed(2)}, SMA20=${sma20.toFixed(2)}, Vol.Médio=${avgVolume}
Preço atual: ${last.close?.toFixed(2)}
Últimos 10 candles:
${recentPrices}`;
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
