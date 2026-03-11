import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface QuoteResult {
  ticker: string;
  currentPrice: number;
  change24h: number;
  previousClose: number;
}

async function fetchYahooQuote(ticker: string): Promise<QuoteResult> {
  const yahooTicker = /^[A-Z]{4}\d{1,2}$/.test(ticker) ? `${ticker}.SA` : 
    ticker === 'BTC' ? 'BTC-BRL' : ticker === 'ETH' ? 'ETH-BRL' : ticker;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=2d`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) return { ticker, currentPrice: 0, change24h: 0, previousClose: 0 };
    const data = await resp.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return { ticker, currentPrice: 0, change24h: 0, previousClose: 0 };
    const currentPrice = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
    const change24h = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
    return { ticker, currentPrice, change24h: Math.round(change24h * 100) / 100, previousClose };
  } catch {
    return { ticker, currentPrice: 0, change24h: 0, previousClose: 0 };
  }
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.error("Telegram error:", data);
    }
    return data.ok;
  } catch (err) {
    console.error("Telegram send error:", err);
    return false;
  }
}

function formatAlertMessage(alert: any, currentPrice: number): string {
  const typeLabels: Record<string, string> = {
    price_above: "📈 Preço Acima",
    price_below: "📉 Preço Abaixo",
    variation_up: "🚀 Alta",
    variation_down: "⚠️ Queda",
    stop_loss: "🛑 Stop Loss",
    take_profit: "🎯 Take Profit",
  };

  const label = typeLabels[alert.alert_type] || alert.alert_type;

  return `<b>${label} - ${alert.ticker}</b>\n` +
    `📋 ${alert.name}\n` +
    `💰 Preço atual: R$ ${currentPrice.toFixed(2)}\n` +
    `🎯 Target: R$ ${alert.target_value.toFixed(2)}\n` +
    `⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
    `\n<i>InvestAI - Alerta automático</i>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("alerts")
      .select("*")
      .eq("status", "active");

    if (alertsError) throw alertsError;
    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active alerts", checked: 0, triggered: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get unique tickers
    const tickers = [...new Set(alerts.map((a: any) => a.ticker))];
    const quotes = await Promise.all(tickers.map(fetchYahooQuote));
    const quoteMap: Record<string, QuoteResult> = {};
    for (const q of quotes) quoteMap[q.ticker] = q;

    // Get telegram settings for users with telegram alerts
    const userIds = [...new Set(alerts.filter((a: any) => a.notify_telegram).map((a: any) => a.user_id))];
    const { data: telegramSettings } = await supabase
      .from("telegram_settings")
      .select("*")
      .in("user_id", userIds)
      .eq("enabled", true);

    const telegramMap: Record<string, { bot_token: string; chat_id: string }> = {};
    if (telegramSettings) {
      for (const ts of telegramSettings) {
        if (ts.bot_token && ts.chat_id) {
          telegramMap[ts.user_id] = { bot_token: ts.bot_token, chat_id: ts.chat_id };
        }
      }
    }

    let triggeredCount = 0;

    for (const alert of alerts) {
      const quote = quoteMap[alert.ticker];
      if (!quote || quote.currentPrice === 0) continue;

      let triggered = false;
      const price = quote.currentPrice;
      const target = alert.target_value;

      switch (alert.alert_type) {
        case "price_above":
          triggered = price >= target;
          break;
        case "price_below":
          triggered = price <= target;
          break;
        case "variation_up":
          triggered = quote.change24h >= target;
          break;
        case "variation_down":
          triggered = quote.change24h <= -target;
          break;
        case "stop_loss":
          triggered = price <= target;
          break;
        case "take_profit":
          triggered = price >= target;
          break;
      }

      // Update current value
      await supabase
        .from("alerts")
        .update({ current_value: price })
        .eq("id", alert.id);

      if (triggered) {
        // Mark as triggered
        await supabase
          .from("alerts")
          .update({ status: "triggered", triggered_at: new Date().toISOString(), current_value: price })
          .eq("id", alert.id);

        // Send Telegram notification
        if (alert.notify_telegram && telegramMap[alert.user_id]) {
          const { bot_token, chat_id } = telegramMap[alert.user_id];
          const message = formatAlertMessage(alert, price);
          await sendTelegramMessage(bot_token, chat_id, message);
        }

        triggeredCount++;
      }
    }

    return new Response(
      JSON.stringify({
        checked: alerts.length,
        triggered: triggeredCount,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-alerts error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
