const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

function getAssetCategory(ticker: string, type?: string): string {
  if (type === "FII") return "fii";
  if (type === "ETF") return "etf";
  if (type === "BDR") return "bdr";
  if (type === "Crypto") return "crypto";
  const t = ticker.toUpperCase();
  if (/^[A-Z]{4}11$/.test(t)) return "fii";
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return "bdr";
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return "stock";
  return "other";
}

function isBrazilian(ticker: string): boolean {
  return /^[A-Z]{4}\d{1,2}$/i.test(ticker);
}

async function fetchBrapiData(ticker: string): Promise<any | null> {
  const token = Deno.env.get("BRAPI_TOKEN");
  if (!token) return null;
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?modules=summaryProfile,financialData&fundamental=true&token=${token}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.results?.[0] || null;
  } catch (e) {
    console.warn("Brapi fetch error:", e);
    return null;
  }
}

async function callAI(body: any) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
      console.warn("DeepSeek failed:", resp.status, "falling back to Lovable AI");
    } catch (e) { console.warn("DeepSeek error, falling back:", e); }
  }

  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
  });
  return { response: resp, provider: "lovable" };
}

function formatBrapiContext(brapi: any, ticker: string): string {
  if (!brapi) return "";
  const parts: string[] = [`[Brapi - ${ticker}]`];

  if (brapi.longName) parts.push(`Nome: ${brapi.longName}`);
  if (brapi.regularMarketPrice) parts.push(`Preço: R$ ${brapi.regularMarketPrice}`);
  if (brapi.regularMarketChangePercent != null) parts.push(`Variação dia: ${brapi.regularMarketChangePercent?.toFixed(2)}%`);
  if (brapi.marketCap) parts.push(`Market Cap: R$ ${(brapi.marketCap / 1e9).toFixed(2)}B`);
  if (brapi.earningsPerShare) parts.push(`LPA: R$ ${brapi.earningsPerShare}`);
  if (brapi.priceEarnings) parts.push(`P/L: ${brapi.priceEarnings}`);
  if (brapi.dividendYield) parts.push(`Dividend Yield: ${(brapi.dividendYield * 100).toFixed(2)}%`);
  if (brapi.fiftyTwoWeekHigh) parts.push(`Máxima 52 sem: R$ ${brapi.fiftyTwoWeekHigh}`);
  if (brapi.fiftyTwoWeekLow) parts.push(`Mínima 52 sem: R$ ${brapi.fiftyTwoWeekLow}`);
  if (brapi.averageDailyVolume10Day) parts.push(`Volume médio 10d: ${brapi.averageDailyVolume10Day}`);

  // summaryProfile module
  const profile = brapi.summaryProfile;
  if (profile) {
    if (profile.sector) parts.push(`Setor: ${profile.sector}`);
    if (profile.industry) parts.push(`Indústria: ${profile.industry}`);
    if (profile.longBusinessSummary) parts.push(`Descrição: ${profile.longBusinessSummary.substring(0, 2000)}`);
    if (profile.website) parts.push(`Website: ${profile.website}`);
    if (profile.fullTimeEmployees) parts.push(`Funcionários: ${profile.fullTimeEmployees}`);
    if (profile.city) parts.push(`Cidade: ${profile.city}`);
    if (profile.state) parts.push(`Estado: ${profile.state}`);
  }

  // financialData module
  const fin = brapi.financialData;
  if (fin) {
    if (fin.totalRevenue?.raw) parts.push(`Receita Total: R$ ${(fin.totalRevenue.raw / 1e9).toFixed(2)}B`);
    if (fin.grossProfits?.raw) parts.push(`Lucro Bruto: R$ ${(fin.grossProfits.raw / 1e9).toFixed(2)}B`);
    if (fin.ebitda?.raw) parts.push(`EBITDA: R$ ${(fin.ebitda.raw / 1e9).toFixed(2)}B`);
    if (fin.totalDebt?.raw) parts.push(`Dívida Total: R$ ${(fin.totalDebt.raw / 1e9).toFixed(2)}B`);
    if (fin.freeCashflow?.raw) parts.push(`Free Cash Flow: R$ ${(fin.freeCashflow.raw / 1e9).toFixed(2)}B`);
    if (fin.returnOnEquity?.raw) parts.push(`ROE: ${(fin.returnOnEquity.raw * 100).toFixed(2)}%`);
    if (fin.grossMargins?.raw) parts.push(`Margem Bruta: ${(fin.grossMargins.raw * 100).toFixed(2)}%`);
    if (fin.operatingMargins?.raw) parts.push(`Margem Operacional: ${(fin.operatingMargins.raw * 100).toFixed(2)}%`);
    if (fin.profitMargins?.raw) parts.push(`Margem Líquida: ${(fin.profitMargins.raw * 100).toFixed(2)}%`);
    if (fin.currentRatio?.raw) parts.push(`Liquidez Corrente: ${fin.currentRatio.raw}`);
    if (fin.debtToEquity?.raw) parts.push(`Dívida/PL: ${fin.debtToEquity.raw}`);
  }

  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, type, name } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const category = getAssetCategory(ticker, type);
    const isBR = isBrazilian(ticker);

    let dataContext = "";

    // For Brazilian assets, use Brapi as primary source (fast API, no scraping)
    if (isBR) {
      const brapiData = await fetchBrapiData(ticker);
      dataContext = formatBrapiContext(brapiData, ticker);
      if (!dataContext) {
        dataContext = `Ativo brasileiro: ${ticker} (${name || ticker}), tipo: ${type || category}. Dados da Brapi indisponíveis, use seu conhecimento.`;
      }
    } else {
      dataContext = `Ativo internacional: ${ticker} (${name || ticker}), tipo: ${type || category}. Use seu conhecimento para gerar o perfil.`;
    }

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista financeiro especializado no mercado brasileiro e internacional. Gere resumos completos sobre ativos financeiros com base nos dados fornecidos. Seja preciso e detalhado." },
        { role: "user", content: `Gere um resumo completo e perfil detalhado sobre o ativo ${ticker} (${name || ticker}, tipo: ${type || category}).\n\nDADOS DISPONÍVEIS:\n${dataContext}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "generate_asset_profile",
          description: "Generate structured asset profile",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descrição completa do ativo em 2-4 parágrafos" },
              administrator: { type: "string", description: "Administrador (para FIIs)" },
              manager: { type: "string", description: "Gestor (para FIIs)" },
              segment: { type: "string", description: "Segmento ou setor do ativo" },
              classification: { type: "string", description: "Classificação do ativo" },
              listing_date: { type: "string", description: "Data de listagem" },
              admin_fee: { type: "string", description: "Taxa de administração" },
              performance_fee: { type: "string", description: "Taxa de performance" },
              ticker_exchange: { type: "string", description: "Bolsa onde é negociado" },
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

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-asset-profile error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
