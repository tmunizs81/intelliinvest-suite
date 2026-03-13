const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    console.warn(`Lovable AI failed (${resp.status}), trying DeepSeek fallback...`);
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

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA() { return userAgents[Math.floor(Math.random() * userAgents.length)]; }

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": randomUA(), "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().substring(0, 15000);
  } catch { return null; }
}

const CRYPTO_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana",
  ADA: "cardano", XRP: "ripple", DOT: "polkadot", DOGE: "dogecoin",
  AVAX: "avalanche-2", LINK: "chainlink", UNI: "uniswap", LTC: "litecoin",
  NEAR: "near", SUI: "sui", PEPE: "pepe",
};

function isCrypto(ticker: string, type?: string): boolean {
  return type === "Cripto" || type === "Crypto" || ticker.toUpperCase() in CRYPTO_MAP;
}

function getCoinGeckoId(ticker: string): string | null { return CRYPTO_MAP[ticker.toUpperCase()] || null; }

function getAssetCategory(ticker: string, type?: string): string {
  if (isCrypto(ticker, type)) return "crypto";
  if (type === "FII") return "fii";
  if (type === "ETF") return "etf";
  if (type === "BDR") return "bdr";
  const t = ticker.toUpperCase();
  if (/^[A-Z]{4}11$/.test(t)) return "fii";
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return "bdr";
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return "stock";
  return "international";
}

async function fetchCoinGeckoData(coinId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    return [
      `Nome: ${data.name} (${data.symbol?.toUpperCase()})`,
      `Market Cap Rank: #${data.market_cap_rank || "N/A"}`,
      `Preço (BRL): R$${data.market_data?.current_price?.brl || "N/A"}`,
      `Var 24h: ${data.market_data?.price_change_percentage_24h?.toFixed(2) || "N/A"}%`,
      `Var 30d: ${data.market_data?.price_change_percentage_30d?.toFixed(2) || "N/A"}%`,
      `Supply: ${data.market_data?.circulating_supply?.toLocaleString() || "N/A"} / ${data.market_data?.max_supply?.toLocaleString() || "∞"}`,
      `Descrição: ${(data.description?.pt || data.description?.en || "N/A").substring(0, 2000)}`,
    ].join("\n");
  } catch { return null; }
}

function getScrapingUrls(ticker: string, category: string): string[] {
  const t = ticker.toLowerCase();
  if (category === "fii") return [`https://investidor10.com.br/fiis/${t}/`, `https://statusinvest.com.br/fundos-imobiliarios/${t}`];
  if (category === "stock") return [`https://investidor10.com.br/acoes/${t}/`, `https://statusinvest.com.br/acoes/${t}`];
  if (category === "etf") return [`https://investidor10.com.br/etfs/${t}/`];
  if (category === "bdr") return [`https://investidor10.com.br/bdrs/${t}/`];
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, type, name } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const category = getAssetCategory(ticker, type);
    const urls = getScrapingUrls(ticker, category);
    let scrapedContent = "", coinGeckoContent = "";

    if (category === "crypto") {
      const coinId = getCoinGeckoId(ticker);
      if (coinId) coinGeckoContent = await fetchCoinGeckoData(coinId) || "";
    }

    if (urls.length > 0) {
      const pageTexts = await Promise.all(urls.map(fetchPageText));
      scrapedContent = pageTexts.filter(Boolean).map((text, i) => `[Fonte ${i + 1}: ${urls[i]}]\n${text!.substring(0, 7000)}`).join("\n\n---\n\n");
    }

    const dataSection = [coinGeckoContent ? `CoinGecko:\n${coinGeckoContent}` : "", scrapedContent ? `Fontes brasileiras:\n${scrapedContent}` : ""].filter(Boolean).join("\n\n---\n\n");

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista financeiro especializado no mercado brasileiro. Gere resumos completos sobre ativos." },
        { role: "user", content: `Gere resumo sobre ${ticker} (${name || ticker}, tipo: ${type || category}).\n\n${dataSection}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_asset_profile",
          description: "Generate structured asset profile",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string" },
              administrator: { type: "string" }, manager: { type: "string" },
              segment: { type: "string" }, classification: { type: "string" },
              listing_date: { type: "string" }, admin_fee: { type: "string" },
              performance_fee: { type: "string" }, ticker_exchange: { type: "string" },
              sections: {
                type: "array",
                items: { type: "object", properties: { title: { type: "string" }, content: { type: "string" } }, required: ["title", "content"], additionalProperties: false },
              },
              key_assets: {
                type: "array",
                items: { type: "object", properties: { name: { type: "string" }, location: { type: "string" }, type: { type: "string" } }, required: ["name"], additionalProperties: false },
              },
              risks: { type: "array", items: { type: "string" } },
              highlights: { type: "array", items: { type: "string" } },
            },
            required: ["description", "sections"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "generate_asset_profile" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-asset-profile error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
