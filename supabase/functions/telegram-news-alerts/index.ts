
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
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
          .select("ticker, name, type")
          .eq("user_id", tgUser.user_id);

        if (!holdings?.length) continue;

        const tickers = holdings.map((h: any) => h.ticker).slice(0, 10);

        // Use AI to generate relevant news summary
        const aiResp = await fetch(DEEPSEEK_API_KEY ? "https://api.deepseek.com/v1/chat/completions" : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify({
            model: DEEPSEEK_API_KEY ? "deepseek-chat" : "gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Você é um analista financeiro. Gere um resumo de 3-5 notícias fictícias mas realistas e relevantes para os seguintes ativos brasileiros: ${tickers.join(', ')}. Para cada notícia inclua: emoji de impacto (🟢 positivo, 🔴 negativo, 🟡 neutro), ticker relacionado, título curto, e uma frase de impacto. Responda em formato de lista com markdown.`,
              },
              { role: "user", content: `Gere notícias relevantes para hoje ${new Date().toLocaleDateString('pt-BR')} sobre os ativos: ${tickers.join(', ')}` },
            ],
            max_tokens: 600,
          }),
        });
        const aiData = await aiResp.json();
        const newsContent = aiData.choices?.[0]?.message?.content;

        if (!newsContent) continue;

        const msg = `📰 *Breaking News - Seus Ativos*\n📅 ${new Date().toLocaleDateString('pt-BR')}\n\n${newsContent}\n\n_Powered by T2-Simplynvest IA_ 🤖`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: tgUser.chat_id, text: msg, parse_mode: "Markdown" }),
        });

        results.push({ userId: tgUser.user_id, success: true });

        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        results.push({ userId: tgUser.user_id, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-news-alerts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
