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
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
  });

  return { response: resp, provider: "lovable" };
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

    const { response, provider } = await callAI({
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

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-asset-profile error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
