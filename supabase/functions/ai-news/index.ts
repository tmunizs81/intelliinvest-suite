const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

type SimpleNews = { title: string; description: string; link: string; source?: string };
type ClassifiedNews = {
  title: string;
  summary: string;
  impact: "positive" | "negative" | "neutral";
  related_tickers: string[];
  category: "macro" | "setorial" | "empresa" | "global" | "regulatório";
  source_url?: string;
};

const SOURCE_TIMEOUT_MS = 4500;
const AI_TIMEOUT_MS = 7000;

function jsonResponse(body: unknown, provider?: string) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(provider ? { "x-ai-provider": provider } : {}),
    },
  });
}

async function safeFetchText(url: string, timeoutMs = SOURCE_TIMEOUT_MS): Promise<string | null> {
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

async function safeFetchJson(url: string, timeoutMs = SOURCE_TIMEOUT_MS): Promise<any | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function parseRssXml(xml: string, source: string, limit: number): SimpleNews[] {
  const items: SimpleNews[] = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<description>(.*?)<\/description>)?[\s\S]*?<\/item>/g;
  let match;

  while ((match = regex.exec(xml)) !== null && items.length < limit) {
    const title = (match[1] || "")
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    const link = (match[2] || "").trim();
    const description = (match[3] || title)
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();

    if (title && link) items.push({ title, description, link, source });
  }

  return items;
}

async function fetchRss(url: string, source: string, limit = 5): Promise<SimpleNews[]> {
  const xml = await safeFetchText(url);
  if (!xml) return [];
  return parseRssXml(xml, source, limit);
}

async function fetchGoogleNews(query: string): Promise<SimpleNews[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const xml = await safeFetchText(url);
  if (!xml) return [];
  return parseRssXml(xml, "Google News", 5);
}

async function fetchMarketAux(query: string, limit = 5): Promise<SimpleNews[]> {
  const key = Deno.env.get("MARKETAUX_API_KEY");
  if (!key) return [];

  const url = `https://api.marketaux.com/v1/news/all?search=${encodeURIComponent(query)}&filter_entities=true&language=pt&limit=${limit}&api_token=${key}`;
  const json = await safeFetchJson(url);
  if (!json?.data) return [];

  return json.data
    .map((a: any) => ({
      title: a.title || "",
      description: a.description || a.snippet || a.title || "",
      link: a.url || "",
      source: a.source || "MarketAux",
    }))
    .filter((n: SimpleNews) => n.title && n.link);
}

async function fetchNewsApi(query: string, limit = 5): Promise<SimpleNews[]> {
  const key = Deno.env.get("NEWSAPI_API_KEY");
  if (!key) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=pt&sortBy=publishedAt&pageSize=${limit}&apiKey=${key}`;
  const json = await safeFetchJson(url);
  if (!json?.articles) return [];

  return json.articles
    .map((a: any) => ({
      title: a.title || "",
      description: a.description || a.title || "",
      link: a.url || "",
      source: a.source?.name || "NewsAPI",
    }))
    .filter((n: SimpleNews) => n.title && n.link);
}

function dedupeNews(items: SimpleNews[], max = 20): SimpleNews[] {
  const seen = new Set<string>();
  const output: SimpleNews[] = [];

  for (const item of items) {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 90);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= max) break;
  }

  return output;
}

function toRawFallback(news: SimpleNews[], tickers: string[], provider: string, reason = "ai_unavailable") {
  const normalized: ClassifiedNews[] = news.slice(0, 8).map((item) => ({
    title: item.title,
    summary: item.description?.slice(0, 260) || item.title,
    impact: "neutral",
    related_tickers: tickers.slice(0, 3),
    category: "macro",
    source_url: item.link,
  }));

  return {
    news: normalized,
    _provider: provider,
    _fallback: true,
    _fallback_reason: reason,
  };
}

async function callDeepSeek(body: any): Promise<Response | null> {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) return null;

  try {
    const { model, ...rest } = body;
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    return resp.ok ? resp : null;
  } catch {
    return null;
  }
}

async function callLovable(body: any): Promise<Response | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;

  try {
    const { model, ...rest } = body;
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...rest, model: "google/gemini-2.5-flash" }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    return resp.ok ? resp : null;
  } catch {
    return null;
  }
}

async function classifyWithAI(rawNews: SimpleNews[], tickers: string[]) {
  const newsContext = rawNews
    .map((n, i) => `[${i + 1}] ${n.title}\n${n.description}\nFonte: ${n.source || ""}|URL:${n.link}`)
    .join("\n\n");

  const payload = {
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "Você classifica notícias financeiras reais para investidores brasileiros. Sempre preserve o URL original em source_url.",
      },
      {
        role: "user",
        content: `Analise estas notícias e selecione as 6-8 mais relevantes para quem possui: ${tickers.join(", ")}.\n\nNOTÍCIAS:\n${newsContext}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "generate_news",
          description: "Return classified real financial news",
          parameters: {
            type: "object",
            properties: {
              news: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    summary: { type: "string" },
                    impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                    related_tickers: { type: "array", items: { type: "string" } },
                    category: {
                      type: "string",
                      enum: ["macro", "setorial", "empresa", "global", "regulatório"],
                    },
                    source_url: { type: "string" },
                  },
                  required: ["title", "summary", "impact", "related_tickers", "category"],
                  additionalProperties: false,
                },
              },
            },
            required: ["news"],
            additionalProperties: false,
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "generate_news" } },
  };

  const deepseekResponse = await callDeepSeek(payload);
  if (deepseekResponse) {
    const deepseekJson = await deepseekResponse.json();
    const args = deepseekJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (args) return { parsed: JSON.parse(args), provider: "deepseek" };
  }

  const lovableResponse = await callLovable(payload);
  if (lovableResponse) {
    const lovableJson = await lovableResponse.json();
    const args = lovableJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (args) return { parsed: JSON.parse(args), provider: "lovable" };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tickers } = await req.json();
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return jsonResponse({
        news: [],
        _provider: "fallback",
        _fallback: true,
        _fallback_reason: "invalid_tickers",
      }, "fallback");
    }

    const tickerList: string[] = tickers.slice(0, 8);
    const queryTickers = tickerList.slice(0, 3).join(" ");

    const settled = await Promise.allSettled([
      fetchMarketAux(queryTickers, 5),
      fetchNewsApi(`${queryTickers} Brasil mercado`, 5),
      fetchGoogleNews(`mercado financeiro Brasil ${new Date().getFullYear()}`),
      fetchRss("https://www.infomoney.com.br/feed/", "InfoMoney", 5),
      fetchRss("https://valorinveste.globo.com/rss/valor-investe/", "Valor Investe", 5),
    ]);

    const gathered = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const uniqueNews = dedupeNews(gathered, 20);

    if (uniqueNews.length === 0) {
      return jsonResponse({ news: [], _provider: "none", _fallback: true, _fallback_reason: "no_sources" });
    }

    const aiResult = await classifyWithAI(uniqueNews, tickerList);
    if (aiResult?.parsed?.news?.length) {
      aiResult.parsed._provider = aiResult.provider;
      return jsonResponse(aiResult.parsed, aiResult.provider);
    }

    return jsonResponse(toRawFallback(uniqueNews, tickerList, "fallback", "ai_timeout_or_parse"), "fallback");
  } catch (err) {
    console.error("ai-news error:", err);
    // graceful degradation to avoid non-2xx breaking UI
    return jsonResponse({
      news: [],
      _provider: "fallback",
      _fallback: true,
      _fallback_reason: "runtime_error",
    }, "fallback");
  }
});
