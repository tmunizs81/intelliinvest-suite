
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!botToken) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get all users with telegram enabled
    const { data: telegramUsers } = await adminClient
      .from("telegram_settings")
      .select("*")
      .eq("enabled", true);

    if (!telegramUsers || telegramUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No users with Telegram enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const tgUser of telegramUsers) {
      try {
        if (!tgUser.chat_id) continue;

        // Fetch user holdings
        const { data: holdings } = await adminClient
          .from("holdings")
          .select("*")
          .eq("user_id", tgUser.user_id);

        if (!holdings || holdings.length === 0) continue;

        // Fetch current prices
        const tickers = holdings.map((h: any) => h.ticker);
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        // For each asset, get AI signal
        const signals: { ticker: string; recommendation: string; confidence: number; summary: string }[] = [];

        for (const h of holdings) {
          try {
            const q = quotes[h.ticker];
            if (!q?.currentPrice) continue;

            // Get history for indicators
            const histResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance-history`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
              body: JSON.stringify({ ticker: h.ticker, range: "6mo", interval: "1d" }),
            });
            const histData = await histResp.json();
            if (!histData.candles || histData.candles.length < 20) continue;

            // Get AI analysis
            const aiResp = await fetch(`${supabaseUrl}/functions/v1/ai-asset-analysis`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
              body: JSON.stringify({
                ticker: h.ticker,
                name: h.name,
                type: h.type,
                indicators: {}, // AI will use candles
                recentCandles: histData.candles.slice(-10),
                holdingInfo: {
                  quantity: h.quantity,
                  avgPrice: h.avg_price,
                  currentPrice: q.currentPrice,
                  profitPct: h.avg_price > 0 ? ((q.currentPrice - h.avg_price) / h.avg_price * 100) : 0,
                },
              }),
            });
            const aiData = await aiResp.json();

            if (aiData.recommendation) {
              signals.push({
                ticker: h.ticker,
                recommendation: aiData.recommendation,
                confidence: aiData.confidence || 0,
                summary: aiData.summary || '',
              });
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 1500));
          } catch (err) {
            console.error(`Signal error for ${h.ticker}:`, err);
          }
        }

        if (signals.length === 0) continue;

        // Build signal message
        const recLabels: Record<string, string> = {
          compra_forte: '🟢🟢 COMPRA FORTE',
          compra: '🟢 COMPRA',
          manter: '🟡 MANTER',
          venda: '🔴 VENDA',
          venda_forte: '🔴🔴 VENDA FORTE',
        };

        const strongSignals = signals.filter(s =>
          s.recommendation === 'compra_forte' || s.recommendation === 'venda_forte' || s.recommendation === 'compra' || s.recommendation === 'venda'
        );

        if (strongSignals.length === 0) continue;

        let message = `🤖 *T2-Simplynvest - Sinais IA*\n📅 ${new Date().toLocaleDateString('pt-BR')}\n\n`;

        for (const sig of strongSignals) {
          const label = recLabels[sig.recommendation] || sig.recommendation;
          message += `${label} *${sig.ticker}*\n`;
          message += `   Confiança: ${sig.confidence}%\n`;
          message += `   ${sig.summary}\n\n`;
        }

        message += `_Total de ${signals.length} ativos analisados_\n_Powered by T2-Simplynvest_ 🤖`;

        // Send to Telegram
        const sendResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgUser.chat_id,
            text: message,
            parse_mode: "Markdown",
          }),
        });

        results.push({
          userId: tgUser.user_id,
          success: sendResp.ok,
          signalsCount: strongSignals.length,
        });
      } catch (err) {
        results.push({
          userId: tgUser.user_id,
          success: false,
          error: String(err),
        });
      }
    }

    return new Response(
      JSON.stringify({ results, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("telegram-signal-alerts error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
