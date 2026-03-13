const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (OPENROUTER_API_KEY) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: body.model || "google/gemini-2.5-flash-preview-09-2025" }),
    });
    if (resp.ok) return { response: resp, provider: "openrouter" };
    console.warn(`OpenRouter failed (${resp.status}), trying Gemini...`);
    try { await resp.text(); } catch {}
  }

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return { response: resp, provider: "gemini" };
    console.warn(`Gemini failed (${resp.status}), trying Groq...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
  return { response: groqResp, provider: "groq" };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, name, type } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const queries = [`${ticker} ${name || ""} ações mercado financeiro`, `${ticker} análise recomendação investimento`, `${ticker} stock analysis market`];
    const rssFeeds = ["https://www.infomoney.com.br/feed/", "https://valorinveste.globo.com/rss/valor-investe/", "https://braziljournal.com/feed/"];

    const [googleResults, ...rssResults] = await Promise.all([
      Promise.all(queries.map(q => fetchGoogleNews(q, 6))),
      ...rssFeeds.map(url => fetchRssItems(url, 4)),
    ]);

    const allNews = [...googleResults.flat(), ...rssResults.flat()];
    const seen = new Set<string>();
    const unique = allNews.filter(n => { const k = n.title.toLowerCase().substring(0, 35); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 25);

    const newsContext = unique.map((n, i) => `[${i + 1}] ${n.title}\n${n.desc}\nFonte: ${n.source || n.link}`).join("\n\n");

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista de mercado financeiro sênior especializado em Brasil e mercados globais." },
        { role: "user", content: `Analise notícias sobre ${ticker} (${name || ticker}, tipo: ${type || "Ação"}) e formule opinião de mercado.\n\nNOTÍCIAS:\n${newsContext}` },
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
                    title: { type: "string" }, impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                    summary: { type: "string" }, source: { type: "string" },
                  },
                  required: ["title", "impact", "summary"], additionalProperties: false,
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
      const fallback = buildFallbackOpinion(ticker, name, type, unique);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      const fallback = buildFallbackOpinion(ticker, name, type, unique);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
    }

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-market-news error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
