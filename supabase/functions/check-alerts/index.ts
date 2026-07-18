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
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
    const data = await resp.json();
    if (!data.ok) console.error("Telegram error:", data);
    return data.ok;
  } catch (err) {
    console.error("Telegram send error:", err);
    return false;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", to);
    return false;
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_FROM_EMAIL") || "alerts@simplynvest.com",
        to: [to],
        subject,
        html,
      }),
    });
    if (!resp.ok) {
      console.error("Resend error:", resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

const TYPE_LABELS: Record<string, string> = {
  price_above: "📈 Preço Acima",
  price_below: "📉 Preço Abaixo",
  variation_up: "🚀 Alta",
  variation_down: "⚠️ Queda",
  stop_loss: "🛑 Stop Loss",
  take_profit: "🎯 Take Profit",
};

/** Map an alert_type to its event_prefs category. */
function eventCategory(alertType: string): string {
  if (alertType === "stop_loss") return "stop_loss";
  if (alertType === "take_profit") return "take_profit";
  if (alertType === "variation_up" || alertType === "variation_down") return "variation";
  return "price";
}

function evaluateCondition(type: string, target: number, quote: QuoteResult): boolean {
  const price = quote.currentPrice;
  switch (type) {
    case "price_above": return price >= target;
    case "price_below": return price <= target;
    case "variation_up": return quote.change24h >= target;
    case "variation_down": return quote.change24h <= -target;
    case "stop_loss": return price <= target;
    case "take_profit": return price >= target;
    default: return false;
  }
}

function formatAlertMessage(alert: any, quote: QuoteResult): string {
  const label = TYPE_LABELS[alert.alert_type] || alert.alert_type;
  const combined = alert.secondary_type
    ? `\n🔗 Condição combinada (${alert.condition_logic || "OR"}): ${TYPE_LABELS[alert.secondary_type] || alert.secondary_type} @ ${alert.secondary_value}`
    : "";
  const notes = alert.notes ? `\n📝 ${alert.notes}` : "";
  return `<b>${label} - ${alert.ticker}</b>\n` +
    `📋 ${alert.name}\n` +
    `💰 Preço atual: R$ ${quote.currentPrice.toFixed(2)}\n` +
    `🎯 Target: R$ ${Number(alert.target_value).toFixed(2)}${combined}${notes}\n` +
    `⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
    `\n<i>T2-Simplynvest - Alerta automático</i>`;
}

function formatEmailHtml(alert: any, quote: QuoteResult): string {
  const label = TYPE_LABELS[alert.alert_type] || alert.alert_type;
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="margin:0 0 8px">${label} — ${alert.ticker}</h2>
      <p style="color:#555;margin:0 0 16px">${alert.name}</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666">Preço atual</td><td style="text-align:right"><b>R$ ${quote.currentPrice.toFixed(2)}</b></td></tr>
        <tr><td style="padding:6px 0;color:#666">Target</td><td style="text-align:right">R$ ${Number(alert.target_value).toFixed(2)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Variação 24h</td><td style="text-align:right">${quote.change24h.toFixed(2)}%</td></tr>
        ${alert.secondary_type ? `<tr><td style="padding:6px 0;color:#666">Condição combinada (${alert.condition_logic || "OR"})</td><td style="text-align:right">${TYPE_LABELS[alert.secondary_type] || alert.secondary_type} @ ${alert.secondary_value}</td></tr>` : ""}
        ${alert.valid_until ? `<tr><td style="padding:6px 0;color:#666">Válido até</td><td style="text-align:right">${new Date(alert.valid_until).toLocaleString("pt-BR")}</td></tr>` : ""}
      </table>
      ${alert.notes ? `<p style="margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-size:13px">${alert.notes}</p>` : ""}
      <p style="color:#9ca3af;font-size:12px;margin-top:24px">T2-Simplynvest — Alerta automático</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: alerts, error: alertsError } = await supabase
      .from("alerts").select("*").eq("status", "active");
    if (alertsError) throw alertsError;
    if (!alerts || alerts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active alerts", checked: 0, triggered: 0, expired: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = Date.now();
    const activeAlerts: any[] = [];
    let expiredCount = 0;

    // Expire alerts past valid_until
    for (const a of alerts) {
      if (a.valid_until && new Date(a.valid_until).getTime() < now) {
        await supabase.from("alerts")
          .update({ status: "expired" })
          .eq("id", a.id);
        expiredCount++;
      } else {
        activeAlerts.push(a);
      }
    }

    if (activeAlerts.length === 0) {
      return new Response(
        JSON.stringify({ checked: alerts.length, triggered: 0, expired: expiredCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch quotes for all tickers referenced (primary + secondary share ticker)
    const tickers = [...new Set(activeAlerts.map((a: any) => a.ticker))];
    const quotes = await Promise.all(tickers.map(fetchYahooQuote));
    const quoteMap: Record<string, QuoteResult> = {};
    for (const q of quotes) quoteMap[q.ticker] = q;

    // Load telegram settings (also carries event_prefs + email_address)
    const userIds = [...new Set(activeAlerts.map((a: any) => a.user_id))];
    const { data: settings } = await supabase
      .from("telegram_settings").select("*").in("user_id", userIds);

    const settingsMap: Record<string, any> = {};
    for (const s of settings || []) settingsMap[s.user_id] = s;

    let triggeredCount = 0;

    for (const alert of activeAlerts) {
      const quote = quoteMap[alert.ticker];
      if (!quote || quote.currentPrice === 0) continue;

      const primary = evaluateCondition(alert.alert_type, Number(alert.target_value), quote);
      let triggered = primary;

      if (alert.secondary_type && alert.secondary_value != null) {
        const secondary = evaluateCondition(
          alert.secondary_type,
          Number(alert.secondary_value),
          quote,
        );
        triggered = (alert.condition_logic || "OR").toUpperCase() === "AND"
          ? (primary && secondary)
          : (primary || secondary);
      }

      await supabase.from("alerts").update({ current_value: quote.currentPrice }).eq("id", alert.id);

      if (!triggered) continue;

      await supabase.from("alerts")
        .update({
          status: "triggered",
          triggered_at: new Date().toISOString(),
          current_value: quote.currentPrice,
        })
        .eq("id", alert.id);

      const userSettings = settingsMap[alert.user_id] || {};
      const eventPrefs = userSettings.event_prefs || {};
      const category = eventCategory(alert.alert_type);
      const prefForCategory = eventPrefs[category] || {};

      // Telegram — respect event_prefs matrix (default true when not set)
      const telegramAllowed = prefForCategory.telegram !== false;
      if (alert.notify_telegram && telegramAllowed &&
          userSettings.enabled && userSettings.bot_token && userSettings.chat_id) {
        await sendTelegramMessage(
          userSettings.bot_token,
          userSettings.chat_id,
          formatAlertMessage(alert, quote),
        );
      }

      // Email — respect event_prefs matrix + notify_email flag on both alert and settings
      const emailAllowed = prefForCategory.email !== false;
      const emailAddress = userSettings.email_address;
      if (alert.notify_email && emailAllowed && userSettings.notify_email && emailAddress) {
        await sendEmail(
          emailAddress,
          `[${alert.ticker}] ${TYPE_LABELS[alert.alert_type] || "Alerta"} disparado`,
          formatEmailHtml(alert, quote),
        );
      }

      triggeredCount++;
    }

    return new Response(
      JSON.stringify({
        checked: alerts.length,
        triggered: triggeredCount,
        expired: expiredCount,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-alerts error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
