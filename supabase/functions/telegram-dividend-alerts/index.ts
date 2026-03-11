
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
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

        const eligible = (holdings || []).filter((h: any) => ['Ação', 'FII', 'ETF'].includes(h.type));
        if (eligible.length === 0) continue;

        const tickers = eligible.map((h: any) => h.ticker);
        const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ tickers }),
        });
        const quotesData = await quotesResp.json();
        const quotes = quotesData.quotes || {};

        const divResp = await fetch(`${supabaseUrl}/functions/v1/dividends`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({
            holdings: eligible.map((h: any) => ({
              ...h, currentPrice: quotes[h.ticker]?.currentPrice || 0,
            })),
          }),
        });
        const divData = await divResp.json();

        if (!divData.upcoming?.length) continue;

        // Filter upcoming dividends in the next 7 days
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcoming = divData.upcoming.filter((d: any) => {
          const date = new Date(d.paymentDate || d.date);
          return date >= now && date <= weekFromNow;
        });

        if (upcoming.length === 0) continue;

        let msg = `💰 *Dividendos Próximos (7 dias)*\n\n`;
        let totalExpected = 0;

        for (const d of upcoming) {
          const date = new Date(d.paymentDate || d.date).toLocaleDateString('pt-BR');
          msg += `📅 *${d.ticker}*\n`;
          msg += `   Valor: R$${(d.totalAmount || 0).toFixed(2)}\n`;
          msg += `   Data: ${date}\n`;
          msg += `   Tipo: ${d.type || 'Dividendo'}\n\n`;
          totalExpected += d.totalAmount || 0;
        }

        msg += `💵 *Total esperado:* R$${totalExpected.toFixed(2)}\n`;
        msg += `_Powered by T2-Simplynvest_ 🤖`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgUser.chat_id, text: msg, parse_mode: "Markdown" }),
        });

        results.push({ userId: tgUser.user_id, dividends: upcoming.length });
      } catch (err) {
        results.push({ userId: tgUser.user_id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-dividend-alerts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
