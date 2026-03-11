
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get active alerts with telegram notification
    const { data: alerts } = await adminClient
      .from("alerts")
      .select("*")
      .eq("status", "active")
      .eq("notify_telegram", true);

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ message: "No active alerts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by user
    const userAlerts: Record<string, any[]> = {};
    for (const a of alerts) {
      if (!userAlerts[a.user_id]) userAlerts[a.user_id] = [];
      userAlerts[a.user_id].push(a);
    }

    const results = [];

    for (const [userId, userAlertsList] of Object.entries(userAlerts)) {
      try {
        // Check telegram
        const { data: tgSetting } = await adminClient
          .from("telegram_settings")
          .select("chat_id")
          .eq("user_id", userId)
          .eq("enabled", true)
          .maybeSingle();
        if (!tgSetting?.chat_id) continue;

        // Get quotes
        const tickers = [...new Set(userAlertsList.map((a: any) => a.ticker))];
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        const triggered: any[] = [];

        for (const alert of userAlertsList) {
          const q = quotes[alert.ticker];
          if (!q?.currentPrice) continue;

          const price = q.currentPrice;
          let shouldTrigger = false;

          switch (alert.alert_type) {
            case 'price_above': shouldTrigger = price >= alert.target_value; break;
            case 'price_below': shouldTrigger = price <= alert.target_value; break;
            case 'stop_loss': shouldTrigger = price <= alert.target_value; break;
            case 'take_profit': shouldTrigger = price >= alert.target_value; break;
            case 'variation_up': shouldTrigger = (q.change24h || 0) >= alert.target_value; break;
            case 'variation_down': shouldTrigger = (q.change24h || 0) <= -alert.target_value; break;
          }

          if (shouldTrigger) {
            triggered.push({ ...alert, currentPrice: price, change: q.change24h });

            // Update alert status
            await adminClient
              .from("alerts")
              .update({ status: "triggered", current_value: price, triggered_at: new Date().toISOString() })
              .eq("id", alert.id);
          }
        }

        if (triggered.length === 0) continue;

        const typeLabels: Record<string, string> = {
          price_above: '📈 Preço acima',
          price_below: '📉 Preço abaixo',
          stop_loss: '🛑 STOP LOSS',
          take_profit: '🎯 TAKE PROFIT',
          variation_up: '🟢 Alta',
          variation_down: '🔴 Queda',
        };

        let msg = `🚨 *ALERTAS DISPARADOS*\n\n`;
        for (const t of triggered) {
          const label = typeLabels[t.alert_type] || t.alert_type;
          msg += `${label}: *${t.ticker}*\n`;
          msg += `   ${t.name}\n`;
          msg += `   Preço atual: R$${t.currentPrice.toFixed(2)}\n`;
          msg += `   Alvo: R$${t.target_value.toFixed(2)}\n\n`;
        }
        msg += `_Acesse o T2-Simplynvest para tomar ação_ ⚡`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgSetting.chat_id, text: msg, parse_mode: "Markdown" }),
        });

        results.push({ userId, triggered: triggered.length });
      } catch (err) {
        results.push({ userId, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-stoploss-alerts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
