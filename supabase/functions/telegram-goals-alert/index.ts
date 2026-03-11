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
    const milestones = [25, 50, 75, 100];

    for (const tgUser of telegramUsers) {
      try {
        if (!tgUser.chat_id) continue;

        // Get holdings value
        const { data: holdings } = await adminClient
          .from("holdings")
          .select("*")
          .eq("user_id", tgUser.user_id);

        if (!holdings?.length) continue;

        const tickers = holdings.map((h: any) => h.ticker);
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        let totalValue = 0;
        for (const h of holdings) {
          totalValue += (quotes[h.ticker]?.currentPrice || h.avg_price) * h.quantity;
        }

        // Get goals
        try {
          const goalsResp = await fetch(`${supabaseUrl}/functions/v1/investment-goals`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
            body: JSON.stringify({ action: "list", userId: tgUser.user_id }),
          });
          const goalsData = await goalsResp.json();

          if (!goalsData.goals?.length) continue;

          const notifications: string[] = [];

          for (const goal of goalsData.goals) {
            if (!goal.target || goal.target <= 0) continue;
            const current = goal.current || totalValue;
            const pct = (current / goal.target) * 100;

            for (const m of milestones) {
              // Notify if within 2% of milestone
              if (Math.abs(pct - m) <= 2) {
                const emoji = m === 100 ? '🎉' : m >= 75 ? '🟢' : m >= 50 ? '🟡' : '🔵';
                notifications.push(
                  `${emoji} *${goal.name}*: ${pct.toFixed(0)}% concluída!\n` +
                  `   R$${current.toFixed(0)} / R$${goal.target.toFixed(0)}`
                );
                break;
              }
            }
          }

          if (notifications.length === 0) continue;

          let msg = `🎯 *Progresso das Metas*\n\n`;
          msg += notifications.join('\n\n');
          msg += `\n\n_Acesse o T2-Simplynvest para ver detalhes_ ⚡`;

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: tgUser.chat_id, text: msg, parse_mode: "Markdown" }),
          });

          results.push({ userId: tgUser.user_id, notifications: notifications.length });
        } catch {
          continue;
        }
      } catch (err) {
        results.push({ userId: tgUser.user_id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-goals-alert error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
