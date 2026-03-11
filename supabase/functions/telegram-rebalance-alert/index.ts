
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

    const { data: telegramUsers } = await adminClient
      .from("telegram_settings")
      .select("*")
      .eq("enabled", true);

    if (!telegramUsers?.length) {
      return new Response(JSON.stringify({ message: "No telegram users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const tgUser of telegramUsers) {
      try {
        if (!tgUser.chat_id) continue;

        const { data: holdings } = await adminClient
          .from("holdings")
          .select("*")
          .eq("user_id", tgUser.user_id);

        if (!holdings?.length || holdings.length < 2) continue;

        const tickers = holdings.map((h: any) => h.ticker);
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        // Calculate allocation by type
        let totalValue = 0;
        const typeAlloc: Record<string, number> = {};

        for (const h of holdings) {
          const q = quotes[h.ticker];
          const value = (q?.currentPrice || h.avg_price) * h.quantity;
          totalValue += value;
          typeAlloc[h.type] = (typeAlloc[h.type] || 0) + value;
        }

        if (totalValue === 0) continue;

        // Check concentration: any single asset > 30% or any type > 60%
        const alerts: string[] = [];

        for (const h of holdings) {
          const q = quotes[h.ticker];
          const value = (q?.currentPrice || h.avg_price) * h.quantity;
          const pct = (value / totalValue) * 100;
          if (pct > 30) {
            alerts.push(`⚠️ *${h.ticker}* concentra *${pct.toFixed(1)}%* da carteira (máx recomendado: 30%)`);
          }
        }

        for (const [type, value] of Object.entries(typeAlloc)) {
          const pct = (value / totalValue) * 100;
          if (pct > 60) {
            alerts.push(`⚠️ *${type}* concentra *${pct.toFixed(1)}%* da carteira (máx recomendado: 60%)`);
          }
        }

        if (alerts.length === 0) continue;

        // Get AI rebalance suggestion
        const assets = holdings.map((h: any) => {
          const q = quotes[h.ticker];
          return {
            ticker: h.ticker, name: h.name, type: h.type,
            quantity: h.quantity, avgPrice: h.avg_price,
            currentPrice: q?.currentPrice || h.avg_price,
            change24h: q?.change24h || 0, sector: h.sector,
          };
        });

        let rebalanceSuggestion = '';
        try {
          const rebalResp = await fetch(`${supabaseUrl}/functions/v1/portfolio-rebalance`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ assets }),
          });
          const rebalData = await rebalResp.json();
          if (rebalData.suggestions?.length > 0) {
            rebalanceSuggestion = '\n\n💡 *Sugestões de rebalanceamento:*\n';
            for (const s of rebalData.suggestions.slice(0, 5)) {
              rebalanceSuggestion += `• ${s}\n`;
            }
          }
        } catch { /* skip */ }

        let msg = `⚖️ *Alerta de Rebalanceamento*\n\n`;
        msg += alerts.join('\n') + '\n';

        // Current allocation
        msg += `\n📊 *Alocação Atual:*\n`;
        for (const [type, value] of Object.entries(typeAlloc)) {
          const pct = (value / totalValue * 100).toFixed(1);
          msg += `• ${type}: ${pct}% (R$${value.toFixed(0)})\n`;
        }

        msg += rebalanceSuggestion;
        msg += `\n_Acesse o T2-Simplynvest para rebalancear_ ⚡`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgUser.chat_id, text: msg, parse_mode: "Markdown" }),
        });

        results.push({ userId: tgUser.user_id, alerts: alerts.length });
      } catch (err) {
        results.push({ userId: tgUser.user_id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-rebalance-alert error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
