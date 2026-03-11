

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

async function fetchRssItems(url: string, maxItems = 5): Promise<Array<{ title: string; link: string; description: string }>> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": userAgents[0] },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    
    const items: Array<{ title: string; link: string; description: string }> = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const itemXml = match[1];
      const title = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
      const link = itemXml.match(/<link[^>]*>(.*?)<\/link>/i)?.[1]?.trim() || "";
      const desc = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1]?.trim() || "";
      const cleanDesc = desc.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").substring(0, 300);
      if (title) items.push({ title, link, description: cleanDesc });
    }
    return items;
  } catch (err) {
    console.warn(`RSS fetch failed for ${url}:`, err);
    return [];
  }
}

async function fetchGoogleNews(query: string): Promise<Array<{ title: string; link: string; description: string }>> {
  const encoded = encodeURIComponent(query);
  return fetchRssItems(`https://news.google.com/rss/search?q=${encoded}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, 5);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { tickers } = await req.json();
    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: "tickers required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch real news from multiple sources in parallel
    const tickerList = tickers.slice(0, 10);
    const queries = [
      `mercado financeiro Brasil investimentos ${new Date().getFullYear()}`,
      ...tickerList.slice(0, 4).map((t: string) => `${t} ações bolsa brasil`),
    ];

    const rssFeeds = [
      "https://www.infomoney.com.br/feed/",
      "https://valorinveste.globo.com/rss/valor-investe/",
    ];

    const [googleResults, ...rssResults] = await Promise.all([
      Promise.all(queries.map(q => fetchGoogleNews(q))),
      ...rssFeeds.map(url => fetchRssItems(url, 5)),
    ]);

    const allGoogleNews = googleResults.flat();
    const allRssNews = rssResults.flat();
    const allNews = [...allGoogleNews, ...allRssNews];

    // Deduplicate by title similarity
    const seen = new Set<string>();
    const uniqueNews = allNews.filter(n => {
      const key = n.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 20);

    const newsContext = uniqueNews.map((n, i) => `[${i + 1}] ${n.title}\n${n.description}\nFonte: ${n.link}`).join("\n\n");

    // Use AI to categorize and filter relevant news
    const prompt = `Analise estas notícias reais e selecione as 6-8 mais relevantes para um investidor que possui: ${tickers.join(', ')}.

Para cada notícia selecionada, classifique o impacto e categoria. Se a notícia for sobre um ativo da carteira, inclua o ticker.

NOTÍCIAS REAIS:
${newsContext}

Use a ferramenta para retornar as notícias classificadas. Mantenha os títulos originais das notícias.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você classifica notícias financeiras reais para investidores brasileiros. Mantenha os títulos das notícias originais. Avalie o impacto real nos ativos do investidor." },
          { role: "user", content: prompt },
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
                      summary: { type: "string", description: "Brief summary (max 120 chars)" },
                      impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                      related_tickers: { type: "array", items: { type: "string" } },
                      category: { type: "string", enum: ["macro", "setorial", "empresa", "global", "regulatório"] },
                      source_url: { type: "string", description: "URL da fonte original" },
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
    console.error("ai-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
