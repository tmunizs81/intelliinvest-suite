const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

type NewsItem = {
  title: string;
  desc: string;
  link: string;
  source?: string;
};

type MarketOpinion = {
  sentiment: "bullish" | "bearish" | "neutral" | "cautious";
  sentiment_label: string;
  executive_summary: string;
  market_position: string;
  positive_catalysts: string[];
  negative_catalysts: string[];
  relevant_news: Array<{
    title: string;
    impact: "positive" | "negative" | "neutral";
    summary: string;
    source?: string;
  }>;
  conclusion: string;
  confidence: number;
  _provider?: string;
  _fallback?: boolean;
  _fallback_reason?: string;
};

const localCache = new Map<string, { data: MarketOpinion; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3200;

async function safeFetchText(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function cleanText(input?: string): string {
  return (input || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchGoogleNews(query: string, limit = 4): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const xml = await safeFetchText(url, REQUEST_TIMEOUT_MS);
  if (!xml) return [];

  const items: NewsItem[] = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<description>(.*?)<\/description>)?[\s\S]*?<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && items.length < limit) {
    const title = cleanText(match[1]);
    const link = cleanText(match[2]);
    const desc = cleanText(match[3]) || title;
    if (!title || !link) continue;
    items.push({ title, desc, link, source: "Google News" });
  }

  return items;
}

async function fetchRssItems(url: string, source: string, limit = 3): Promise<NewsItem[]> {
  const xml = await safeFetchText(url, REQUEST_TIMEOUT_MS);
  if (!xml) return [];

  const items: NewsItem[] = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<description>(.*?)<\/description>)?[\s\S]*?<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null && items.length < limit) {
    const title = cleanText(match[1]);
    const link = cleanText(match[2]);
    const desc = cleanText(match[3]) || title;
    if (!title || !link) continue;
    items.push({ title, desc, link, source });
  }

  return items;
}

function dedupeNews(items: NewsItem[], max = 12): NewsItem[] {
  const seen = new Set<string>();
  const output: NewsItem[] = [];

  for (const item of items) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9à-ú\s]/gi, "").slice(0, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= max) break;
  }

  return output;
}

function inferImpact(title: string, desc: string): "positive" | "negative" | "neutral" {
  const text = `${title} ${desc}`.toLowerCase();
  const positiveWords = ["alta", "lucro", "cresce", "recorde", "compra", "valoriz", "forte", "supera"];
  const negativeWords = ["queda", "prejuízo", "cai", "risco", "crise", "investig", "downgrade", "rebaix"];

  if (negativeWords.some((w) => text.includes(w))) return "negative";
  if (positiveWords.some((w) => text.includes(w))) return "positive";
  return "neutral";
}

function buildFallbackOpinion(ticker: string, name: string | undefined, type: string | undefined, news: NewsItem[], reason = "degraded_mode"): MarketOpinion {
  const picked = news.slice(0, 6).map((n) => ({
    title: n.title,
    impact: inferImpact(n.title, n.desc),
    summary: n.desc.slice(0, 180),
    source: n.source || n.link,
  }));

  const positiveCount = picked.filter((n) => n.impact === "positive").length;
  const negativeCount = picked.filter((n) => n.impact === "negative").length;

  const sentiment: MarketOpinion["sentiment"] =
    positiveCount > negativeCount ? "bullish" : negativeCount > positiveCount ? "cautious" : "neutral";

  const sentimentLabel = sentiment === "bullish"
    ? "Viés Positivo"
    : sentiment === "cautious"
      ? "Viés Cauteloso"
      : "Neutro";

  return {
    sentiment,
    sentiment_label: sentimentLabel,
    executive_summary: `Resumo rápido com base em ${picked.length} notícias recentes sobre ${ticker}.`,
    market_position: `Ativo ${ticker} (${name || ticker}, ${type || "Ativo"}) monitorado em modo rápido com síntese local quando necessário.`,
    positive_catalysts: picked.filter((n) => n.impact === "positive").slice(0, 3).map((n) => n.title),
    negative_catalysts: picked.filter((n) => n.impact === "negative").slice(0, 3).map((n) => n.title),
    relevant_news: picked,
    conclusion: "Acompanhe a atualização contínua das manchetes para confirmar direção de curto prazo.",
    confidence: 62,
    _fallback: true,
    _fallback_reason: reason,
  };
}

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
        signal: AbortSignal.timeout(12000),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
    } catch {
      // silent fallback
    }
  }

  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
    signal: AbortSignal.timeout(12000),
  });
  return { response: resp, provider: "lovable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, name, type } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = `${ticker}:${type || ""}`;
    const cached = localCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const queries = [
      `${ticker} ${name || ""} mercado financeiro`,
      `${ticker} análise investimento Brasil`,
    ];

    const feedJobs = [
      ...queries.map((q) => fetchGoogleNews(q, 4)),
      fetchRssItems("https://www.infomoney.com.br/feed/", "InfoMoney", 3),
      fetchRssItems("https://valorinveste.globo.com/rss/valor-investe/", "Valor Investe", 3),
    ];

    const settled = await Promise.allSettled(feedJobs);
    const news = settled.flatMap((res) => (res.status === "fulfilled" ? res.value : []));
    const uniqueNews = dedupeNews(news, 12);

    if (uniqueNews.length === 0) {
      const fallback = buildFallbackOpinion(ticker, name, type, [], "no_news_sources");
      localCache.set(cacheKey, { data: fallback, ts: Date.now() });
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newsContext = uniqueNews
      .slice(0, 10)
      .map((n, i) => `[${i + 1}] ${n.title}\n${n.desc}\nFonte: ${n.source || n.link}`)
      .join("\n\n");

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista de mercado financeiro. Seja objetivo e prático." },
        { role: "user", content: `Analise as notícias sobre ${ticker} (${name || ticker}, tipo: ${type || "Ativo"}) e retorne opinião estruturada.\n\nNOTÍCIAS:\n${newsContext}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_market_opinion",
          description: "Generate structured market opinion",
          parameters: {
            type: "object",
            properties: {
              sentiment: { type: "string", enum: ["bullish", "bearish", "neutral", "cautious"] },
              sentiment_label: { type: "string" },
              executive_summary: { type: "string" },
              market_position: { type: "string" },
              positive_catalysts: { type: "array", items: { type: "string" } },
              negative_catalysts: { type: "array", items: { type: "string" } },
              relevant_news: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                    summary: { type: "string" },
                    source: { type: "string" },
                  },
                  required: ["title", "impact", "summary"],
                  additionalProperties: false,
                },
              },
              conclusion: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["sentiment", "sentiment_label", "executive_summary", "market_position", "positive_catalysts", "negative_catalysts", "relevant_news", "conclusion", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_market_opinion" } },
    });

    if (!response.ok) {
      const fallback = buildFallbackOpinion(ticker, name, type, uniqueNews, `ai_http_${response.status}`);
      fallback._provider = provider;
      localCache.set(cacheKey, { data: fallback, ts: Date.now() });
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      const fallback = buildFallbackOpinion(ticker, name, type, uniqueNews, "no_tool_call");
      fallback._provider = provider;
      localCache.set(cacheKey, { data: fallback, ts: Date.now() });
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
      });
    }

    const parsedResult = JSON.parse(toolCall.function.arguments) as MarketOpinion;
    parsedResult._provider = provider;

    localCache.set(cacheKey, { data: parsedResult, ts: Date.now() });

    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
    });
  } catch (err) {
    console.error("ai-market-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
