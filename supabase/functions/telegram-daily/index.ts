
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
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    if (!botToken) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        // Calculate portfolio summary
        let totalValue = 0;
        let totalCost = 0;
        let dailyChange = 0;
        const assetLines: string[] = [];

        for (const h of holdings) {
          const q = quotes[h.ticker];
          const price = q?.currentPrice || 0;
          const value = price * h.quantity;
          const cost = h.avg_price * h.quantity;
          totalValue += value;
          totalCost += cost;

          if (price > 0) {
            const prev = price / (1 + (q?.change24h || 0) / 100);
            dailyChange += (price - prev) * h.quantity;
            const profit = value - cost;
            const profitPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : '0';
            const emoji = q?.change24h >= 0 ? '🟢' : '🔴';
            assetLines.push(`${emoji} *${h.ticker}* R$${price.toFixed(2)} (${q?.change24h >= 0 ? '+' : ''}${q?.change24h?.toFixed(1)}%)`);
          }
        }

        const totalGain = totalValue - totalCost;
        const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(1) : '0';
        const dailyEmoji = dailyChange >= 0 ? '📈' : '📉';

        // Fetch upcoming dividends
        const eligibleHoldings = holdings.filter((h: any) => ['Ação', 'FII', 'ETF'].includes(h.type));
        let dividendLine = '';
        if (eligibleHoldings.length > 0) {
          try {
            const divResp = await fetch(`${supabaseUrl}/functions/v1/dividends`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
              body: JSON.stringify({ holdings: eligibleHoldings.map((h: any) => ({ ...h, currentPrice: quotes[h.ticker]?.currentPrice || 0 })) }),
            });
            const divData = await divResp.json();
            if (divData.upcoming?.length > 0) {
              const next = divData.upcoming[0];
              dividendLine = `\n💰 *Próx. dividendo:* ${next.ticker} - R$${next.totalAmount?.toFixed(2)} em ${new Date(next.paymentDate || next.date).toLocaleDateString('pt-BR')}`;
            }
            if (divData.summary?.monthlyAverage > 0) {
              dividendLine += `\n📊 *Média mensal dividendos:* R$${divData.summary.monthlyAverage.toFixed(2)}`;
            }
          } catch { /* skip dividends if error */ }
        }

        // Check alerts
        const { data: triggeredAlerts } = await adminClient
          .from("alerts")
          .select("*")
          .eq("user_id", tgUser.user_id)
          .eq("status", "triggered")
          .eq("notify_telegram", true);

        let alertsLine = '';
        if (triggeredAlerts && triggeredAlerts.length > 0) {
          alertsLine = '\n\n⚠️ *Alertas disparados:*';
          for (const a of triggeredAlerts.slice(0, 5)) {
            alertsLine += `\n• ${a.name} (${a.ticker})`;
          }
        }

        // Build message
        const now = new Date();
        const message = `🏦 *T2-Simplynvest - Resumo Diário*
📅 ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}

💼 *Patrimônio:* R$${totalValue.toFixed(2)}
${dailyEmoji} *Hoje:* ${dailyChange >= 0 ? '+' : ''}R$${dailyChange.toFixed(2)}
${totalGain >= 0 ? '✅' : '❌'} *Lucro total:* ${totalGain >= 0 ? '+' : ''}R$${totalGain.toFixed(2)} (${totalGainPct}%)

📋 *Seus Ativos:*
${assetLines.join('\n')}${dividendLine}${alertsLine}

_Powered by T2-Simplynvest_ 🤖`;

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
          status: sendResp.status,
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
    console.error("telegram-daily error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
