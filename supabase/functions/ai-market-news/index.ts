import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchRssItems(url: string, max = 5): Promise<Array<{ title: string; link: string; desc: string; source: string }>> {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const xml = await resp.text();
    const items: Array<{ title: string; link: string; desc: string; source: string }> = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < max) {
      const x = m[1];
      const title = x.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || "";
      const link = x.match(/<link[^>]*>(.*?)<\/link>/i)?.[1]?.trim() || "";
      const desc = (x.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || "")
        .replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").substring(0, 300).trim();
      const src = x.match(/<source[^>]*>(.*?)<\/source>/i)?.[1]?.trim() || "";
      if (title) items.push({ title, link, desc, source: src });
    }
    return items;
  } catch { return []; }
}

async function fetchGoogleNews(query: string, max = 6) {
  return fetchRssItems(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, max);
}

function buildFallbackOpinion(ticker: string, name: string | undefined, type: string | undefined, uniqueNews: Array<{ title: string; link: string; desc: string; source: string }>) {
  const fallbackNews = uniqueNews.slice(0, 5).map((n) => ({
    title: n.title,
    impact: "neutral" as const,
    summary: n.desc || "Notícia coletada sem resumo detalhado.",
    source: n.source || n.link,
  }));

  return {
    sentiment: "neutral",
    sentiment_label: "Neutro",
    executive_summary: `No momento há limitação temporária de análise avançada para ${ticker}. Exibindo leitura neutra baseada nas notícias coletadas em tempo real.`,
    market_position: `Para ${ticker} (${name || ticker}, tipo ${type || "Ação"}), a leitura atual é neutra por indisponibilidade momentânea da camada de IA. Considere os títulos de notícias abaixo e tente atualizar em instantes para uma análise aprofundada.`,
    positive_catalysts: ["Monitoramento contínuo de notícias habilitado", "Dados de manchetes ainda disponíveis"],
    negative_catalysts: ["Limite temporário de requisições de IA", "Análise qualitativa avançada indisponível neste momento"],
    relevant_news: fallbackNews,
    conclusion: "Recomendação neutra temporária: aguarde alguns instantes e atualize para obter a opinião completa com IA.",
    confidence: 35,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { ticker, name, type } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch news from multiple queries in parallel
    const queries = [
      `${ticker} ${name || ""} ações mercado financeiro`,
      `${ticker} análise recomendação investimento`,
      `${ticker} stock analysis market`,
    ];

    const rssFeeds = [
      "https://www.infomoney.com.br/feed/",
      "https://valorinveste.globo.com/rss/valor-investe/",
    ];

    const [googleResults, ...rssResults] = await Promise.all([
      Promise.all(queries.map(q => fetchGoogleNews(q, 6))),
      ...rssFeeds.map(url => fetchRssItems(url, 4)),
    ]);

    const allNews = [...googleResults.flat(), ...rssResults.flat()];
    const seen = new Set<string>();
    const unique = allNews.filter(n => {
      const k = n.title.toLowerCase().substring(0, 35);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 25);

    const newsContext = unique.map((n, i) =>
      `[${i + 1}] ${n.title}\n${n.desc}\nFonte: ${n.source || n.link}`
    ).join("\n\n");

    const prompt = `Você é um analista de mercado sênior. Analise as notícias recentes sobre o ativo ${ticker} (${name || ticker}, tipo: ${type || "Ação"}) e formule uma opinião de mercado fundamentada.

NOTÍCIAS COLETADAS DE PORTAIS FINANCEIROS:
${newsContext}

Com base nessas notícias reais e no seu conhecimento do mercado, use a ferramenta para gerar:
1. Um resumo executivo do sentimento de mercado
2. A posição/opinião consolidada (compra, venda, neutro, cautela)
3. Principais catalisadores positivos e negativos
4. Notícias mais relevantes classificadas
5. Uma conclusão com recomendação fundamentada`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de mercado financeiro sênior especializado em Brasil e mercados globais. Analise notícias reais para formular opiniões fundamentadas sobre ativos. Seja objetivo e profissional." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_market_opinion",
            description: "Generate structured market opinion based on real news",
            parameters: {
              type: "object",
              properties: {
                sentiment: { type: "string", enum: ["bullish", "bearish", "neutral", "cautious"], description: "Sentimento geral do mercado" },
                sentiment_label: { type: "string", description: "Label curto em português (ex: Compra, Venda, Neutro, Cautela)" },
                executive_summary: { type: "string", description: "Resumo executivo do sentimento de mercado (3-5 frases)" },
                market_position: { type: "string", description: "Opinião consolidada detalhada sobre o ativo (parágrafo)" },
                positive_catalysts: { type: "array", items: { type: "string" }, description: "Catalisadores positivos" },
                negative_catalysts: { type: "array", items: { type: "string" }, description: "Catalisadores negativos / riscos" },
                relevant_news: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                      summary: { type: "string", description: "Impacto no ativo (1-2 frases)" },
                      source: { type: "string" },
                    },
                    required: ["title", "impact", "summary"],
                    additionalProperties: false,
                  },
                },
                conclusion: { type: "string", description: "Conclusão final com recomendação fundamentada" },
                confidence: { type: "number", description: "Nível de confiança da análise (0-100)" },
              },
              required: ["sentiment", "sentiment_label", "executive_summary", "market_position", "positive_catalysts", "negative_catalysts", "relevant_news", "conclusion", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_market_opinion" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        const fallback = buildFallbackOpinion(ticker, name, type, unique);
        return new Response(JSON.stringify(fallback), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fallback = buildFallbackOpinion(ticker, name, type, unique);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      const fallback = buildFallbackOpinion(ticker, name, type, unique);
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-market-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
