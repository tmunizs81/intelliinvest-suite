const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

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
    body: JSON.stringify({ ...rest, model: model || "google/gemini-2.5-flash" }),
  });

  return { response: resp, provider: "lovable" };
}

async function fetchGoogleNews(query: string): Promise<{title: string; description: string; link: string}[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) { try { await resp.text(); } catch {} return []; }
    const xml = await resp.text();
    const items: {title: string; description: string; link: string}[] = [];
    const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && items.length < 5) {
      items.push({ title: match[1], description: match[1], link: match[2] });
    }
    // Fallback: simpler regex
    if (items.length === 0) {
      const regex2 = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
      while ((match = regex2.exec(xml)) !== null && items.length < 5) {
        const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, '');
        items.push({ title, description: title, link: match[2] });
      }
    }
    return items;
  } catch (e) {
    console.warn("fetchGoogleNews error:", e);
    return [];
  }
}

async function fetchRssItems(url: string, limit: number): Promise<{title: string; description: string; link: string}[]> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) { try { await resp.text(); } catch {} return []; }
    const xml = await resp.text();
    const items: {title: string; description: string; link: string}[] = [];
    const regex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?(?:<description>(.*?)<\/description>)?[\s\S]*?<\/item>/g;
    let match;
    while ((match = regex.exec(xml)) !== null && items.length < limit) {
      const title = match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const link = match[2].trim();
      const desc = (match[3] || title).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();
      items.push({ title, description: desc, link });
    }
    return items;
  } catch (e) {
    console.warn("fetchRssItems error:", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tickers } = await req.json();
    if (!tickers?.length) return new Response(JSON.stringify({ error: "tickers required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tickerList = tickers.slice(0, 10);
    const queries = [`mercado financeiro Brasil investimentos ${new Date().getFullYear()}`, ...tickerList.slice(0, 4).map((t: string) => `${t} ações bolsa brasil`)];
    const rssFeeds = ["https://www.infomoney.com.br/feed/", "https://valorinveste.globo.com/rss/valor-investe/"];

    const [googleResults, ...rssResults] = await Promise.all([
      Promise.all(queries.map(q => fetchGoogleNews(q))),
      ...rssFeeds.map(url => fetchRssItems(url, 5)),
    ]);

    const allNews = [...googleResults.flat(), ...rssResults.flat()];
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(n => {
      const key = n.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);

    const newsContext = uniqueNews.map((n, i) => `[${i + 1}] ${n.title}\n${n.description}\nFonte: ${n.link}`).join("\n\n");

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você classifica notícias financeiras reais para investidores brasileiros." },
        { role: "user", content: `Analise estas notícias e selecione as 6-8 mais relevantes para quem possui: ${tickers.join(', ')}.\n\nNOTÍCIAS:\n${newsContext}` },
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
      if (response.status === 429 || response.status === 402) {
        const fallbackNews = uniqueNews.slice(0, 8).map((item) => ({
          title: item.title,
          summary: item.description?.slice(0, 220) || item.title,
          impact: "neutral",
          related_tickers: tickers.slice(0, 3),
          category: "macro",
          source_url: item.link,
        }));

        return new Response(JSON.stringify({
          news: fallbackNews,
          _provider: provider,
          _fallback: true,
          _fallback_reason: response.status === 429 ? "rate_limit" : "credits",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider },
        });
      }

      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
