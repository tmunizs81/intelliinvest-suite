const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 10;

function isRateLimited(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let userId = "anon";
  try { if (parts[1]) { const p = JSON.parse(atob(parts[1])); userId = p.sub || "anon"; } } catch {}
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter(t => now - t < 60000);
  if (calls.length >= MAX_CALLS_PER_MIN) return true;
  calls.push(now);
  userCalls.set(userId, calls);
  return false;
}

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
  });

  return { response: resp, provider: "lovable" };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function summarizeCandles(candles: any[]): string {
  if (!Array.isArray(candles) || candles.length < 8) {
    return "Dados históricos insuficientes para validar padrões.";
  }

  const normalized = candles
    .map((c) => ({
      date: c.date ?? c.timestamp ?? "-",
      open: asNumber(c.open),
      high: asNumber(c.high),
      low: asNumber(c.low),
      close: asNumber(c.close),
      volume: asNumber(c.volume) ?? 0,
    }))
    .filter((c) => c.close !== null);

  if (normalized.length < 8) {
    return "Dados históricos insuficientes para validar padrões.";
  }

  const closes = normalized.map((c) => c.close as number);
  const volumes = normalized.map((c) => c.volume);
  const sma10 = average(closes.slice(-10));
  const sma20 = average(closes.slice(-20));
  const baseClose = closes[Math.max(0, closes.length - 30)] || closes[0];
  const lastClose = closes[closes.length - 1];
  const variation30d = baseClose ? ((lastClose - baseClose) / baseClose) * 100 : 0;
  const avgVolume10 = average(volumes.slice(-10));

  const recent = normalized.slice(-10).map((c) => {
    const o = c.open ?? c.close ?? 0;
    const h = c.high ?? c.close ?? 0;
    const l = c.low ?? c.close ?? 0;
    const cl = c.close ?? 0;
    return `${c.date} O:${o.toFixed(2)} H:${h.toFixed(2)} L:${l.toFixed(2)} C:${cl.toFixed(2)} V:${Math.round(c.volume)}`;
  }).join("\n");

  return `SMA10: ${sma10.toFixed(2)} | SMA20: ${sma20.toFixed(2)} | Var30d: ${variation30d.toFixed(2)}% | Vol10d médio: ${Math.round(avgVolume10)}\nCandles (10 últimos):\n${recent}`;
}

async function fetchHistory(ticker: string, req: Request): Promise<any[]> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return [];

    const response = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: req.headers.get("authorization") || `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ ticker, range: "3mo", interval: "1d" }),
    });

    if (!response.ok) {
      console.warn(`history fetch failed for ${ticker}: ${response.status}`);
      try { await response.text(); } catch {}
      return [];
    }

    const data = await response.json();
    return Array.isArray(data?.candles) ? data.candles : [];
  } catch (error) {
    console.error(`fetchHistory error for ${ticker}:`, error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const emptyFallback = (reason: string) => new Response(
    JSON.stringify({ patterns: [], _provider: "local", _fallback: true, _reason: reason }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );

  if (isRateLimited(req)) {
    console.warn("Rate limited, returning empty patterns");
    return emptyFallback("limite de chamadas");
  }

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

    const { response, provider } = await callAI({
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
      if (response.status === 429 || response.status === 402) {
        console.warn(`AI provider returned ${response.status}, returning empty patterns`);
        return emptyFallback("provedor indisponível");
      }
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
        return new Response(JSON.stringify({ ...parsed, _provider: provider }), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
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

    return new Response(JSON.stringify({ ...parsed, _provider: provider }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("pattern-detector error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
