const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

type SimpleNews = { title: string; description: string; link: string; source?: string };

async function safeFetchText(url: string, timeoutMs = 8000): Promise<string | null> {
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

async function safeFetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── MarketAux API ──
async function fetchMarketAux(query: string, limit = 5): Promise<SimpleNews[]> {
  const key = Deno.env.get("MARKETAUX_API_KEY");
  if (!key) return [];
  const url = `https://api.marketaux.com/v1/news/all?search=${encodeURIComponent(query)}&filter_entities=true&language=pt&limit=${limit}&api_token=${key}`;
  const json = await safeFetchJson(url);
  if (!json?.data) return [];
  return json.data.map((a: any) => ({
    title: a.title || "",
    description: a.description || a.snippet || a.title || "",
    link: a.url || "",
    source: a.source || "MarketAux",
  })).filter((n: SimpleNews) => n.title && n.link);
}

// ── NewsAPI.org ──
async function fetchNewsApi(query: string, limit = 5): Promise<SimpleNews[]> {
  const key = Deno.env.get("NEWSAPI_API_KEY");
  if (!key) return [];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=pt&sortBy=publishedAt&pageSize=${limit}&apiKey=${key}`;
  const json = await safeFetchJson(url);
  if (!json?.articles) return [];
  return json.articles.map((a: any) => ({
    title: a.title || "",
    description: a.description || a.title || "",
    link: a.url || "",
    source: a.source?.name || "NewsAPI",
  })).filter((n: SimpleNews) => n.title && n.link);
}

// ── RSS Parser ──
function parseRssXml(xml: string, source: string, limit: number): SimpleNews[] {
  const items: SimpleNews[] = [];
  const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<description>(.*?)<\/description>)?[\s\S]*?<\/item>/g;
  let match;
  while ((match = regex.exec(xml)) !== null && items.length < limit) {
    const title = (match[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim();
    const link = match[2].trim();
    const desc = (match[3] || title).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]*>/g, "").trim();
    if (title && link) items.push({ title, description: desc, link, source });
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

// ── AI: DeepSeek first, then Lovable ──
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
        signal: AbortSignal.timeout(25000),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
      console.log("DeepSeek failed:", resp.status);
    } catch (e) {
      console.log("DeepSeek error:", e);
    }
  }

  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: "google/gemini-2.5-flash" }),
    signal: AbortSignal.timeout(25000),
  });
  return { response: resp, provider: "lovable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tickers } = await req.json();
    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: "tickers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tickerList: string[] = tickers.slice(0, 10);
    const mainQuery = `mercado financeiro Brasil investimentos ${new Date().getFullYear()}`;
    const tickerQueries = tickerList.slice(0, 3).map((t: string) => `${t} ações bolsa brasil`);

    // Fetch all sources in parallel with generous timeouts
    const settled = await Promise.allSettled([
      fetchMarketAux(tickerList.slice(0, 3).join(" "), 5),
      fetchNewsApi(`${tickerList.slice(0, 3).join(" ")} Brasil mercado`, 5),
      fetchGoogleNews(mainQuery),
      ...tickerQueries.map(q => fetchGoogleNews(q)),
      fetchRss("https://www.infomoney.com.br/feed/", "InfoMoney", 5),
      fetchRss("https://valorinveste.globo.com/rss/valor-investe/", "Valor Investe", 5),
    ]);

    const allNews = settled.flatMap(res => (res.status === "fulfilled" ? res.value : []));

    // Dedupe by title prefix
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(n => {
      const key = n.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 25);

    // If no news at all, return empty
    if (uniqueNews.length === 0) {
      return new Response(JSON.stringify({ news: [], _provider: "none" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newsContext = uniqueNews.map((n, i) =>
      `[${i + 1}] ${n.title}\n${n.description}\nFonte: ${n.source || ""}|URL: ${n.link}`
    ).join("\n\n");

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "Você classifica notícias financeiras reais para investidores brasileiros. Mantenha os URLs originais das fontes.",
        },
        {
          role: "user",
          content: `Analise estas notícias e selecione as 6-8 mais relevantes para quem possui: ${tickers.join(", ")}.\n\nNOTÍCIAS:\n${newsContext}`,
        },
      ],
      tools: [{
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
                    category: { type: "string", enum: ["macro", "setorial", "empresa", "global", "regulatório"] },
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
      }],
      tool_choice: { type: "function", function: { name: "generate_news" } },
    });

    if (!response.ok) {
      // On rate limit or credits, return raw news as fallback
      if (response.status === 429 || response.status === 402) {
        const fallbackNews = uniqueNews.slice(0, 8).map(item => ({
          title: item.title,
          summary: item.description?.slice(0, 220) || item.title,
          impact: "neutral",
          related_tickers: tickers.slice(0, 3),
          category: "macro",
          source_url: item.link,
        }));
        return new Response(JSON.stringify({ news: fallbackNews, _provider: provider, _fallback: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
        });
      }
      const errText = await response.text().catch(() => "");
      throw new Error(`AI error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
    });
  } catch (err) {
    console.error("ai-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
