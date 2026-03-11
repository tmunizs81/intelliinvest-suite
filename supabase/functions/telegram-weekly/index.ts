import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const tgUser of telegramUsers) {
      try {
        if (!tgUser.chat_id) continue;

        // Get snapshots for the last 7 days
        const { data: snapshots } = await adminClient
          .from("portfolio_snapshots")
          .select("*")
          .eq("user_id", tgUser.user_id)
          .gte("snapshot_date", weekAgo.toISOString().split('T')[0])
          .order("snapshot_date", { ascending: true });

        const { data: holdings } = await adminClient
          .from("holdings")
          .select("*")
          .eq("user_id", tgUser.user_id);

        if (!holdings?.length) continue;

        // Get current quotes
        const tickers = holdings.map((h: any) => h.ticker);
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        let currentValue = 0, totalCost = 0;
        const assetPerf: { ticker: string; pct: number }[] = [];

        for (const h of holdings) {
          const q = quotes[h.ticker];
          const price = q?.currentPrice || 0;
          currentValue += price * h.quantity;
          totalCost += h.avg_price * h.quantity;
          assetPerf.push({
            ticker: h.ticker,
            pct: h.avg_price > 0 ? ((price - h.avg_price) / h.avg_price * 100) : 0,
          });
        }

        const startValue = snapshots?.[0]?.total_value || totalCost;
        const weekChange = currentValue - startValue;
        const weekPct = startValue > 0 ? (weekChange / startValue * 100) : 0;
        const totalGain = currentValue - totalCost;
        const totalPct = totalCost > 0 ? (totalGain / totalCost * 100) : 0;

        // Best and worst
        assetPerf.sort((a, b) => b.pct - a.pct);
        const best = assetPerf.slice(0, 3);
        const worst = assetPerf.slice(-3).reverse();

        // Build text chart
        const chartBars: string[] = [];
        if (snapshots && snapshots.length > 1) {
          const maxVal = Math.max(...snapshots.map((s: any) => s.total_value));
          const minVal = Math.min(...snapshots.map((s: any) => s.total_value));
          const range = maxVal - minVal || 1;
          for (const s of snapshots) {
            const pct = (s.total_value - minVal) / range;
            const bars = Math.round(pct * 15);
            const date = new Date(s.snapshot_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            chartBars.push(`${date} ${'█'.repeat(bars)}${'░'.repeat(15 - bars)} R$${s.total_value.toFixed(0)}`);
          }
        }

        // Get transactions count
        const { count: txCount } = await adminClient
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", tgUser.user_id)
          .gte("created_at", weekAgo.toISOString());

        let msg = `📊 *Relatório Semanal T2-Simplynvest*\n`;
        msg += `📅 ${weekAgo.toLocaleDateString('pt-BR')} a ${now.toLocaleDateString('pt-BR')}\n\n`;

        msg += `💼 *Patrimônio:* R$${currentValue.toFixed(2)}\n`;
        msg += `${weekChange >= 0 ? '📈' : '📉'} *Semana:* ${weekChange >= 0 ? '+' : ''}R$${weekChange.toFixed(2)} (${weekPct.toFixed(1)}%)\n`;
        msg += `${totalGain >= 0 ? '✅' : '❌'} *Total:* ${totalGain >= 0 ? '+' : ''}R$${totalGain.toFixed(2)} (${totalPct.toFixed(1)}%)\n`;
        msg += `📋 *Transações:* ${txCount || 0}\n\n`;

        if (chartBars.length > 0) {
          msg += `📈 *Evolução:*\n\`\`\`\n${chartBars.join('\n')}\n\`\`\`\n\n`;
        }

        msg += `🏆 *Melhores:*\n`;
        best.forEach((b, i) => {
          msg += `${['🥇', '🥈', '🥉'][i]} ${b.ticker} ${b.pct >= 0 ? '+' : ''}${b.pct.toFixed(1)}%\n`;
        });

        msg += `\n📉 *Piores:*\n`;
        worst.forEach(w => {
          msg += `🔴 ${w.ticker} ${w.pct >= 0 ? '+' : ''}${w.pct.toFixed(1)}%\n`;
        });

        msg += `\n_Powered by T2-Simplynvest_ 🤖`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgUser.chat_id, text: msg, parse_mode: "Markdown" }),
        });

        results.push({ userId: tgUser.user_id, success: true });
      } catch (err) {
        results.push({ userId: tgUser.user_id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-weekly error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
