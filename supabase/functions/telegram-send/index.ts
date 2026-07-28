import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchAlert, sendTelegramRaw } from "../_shared/telegram.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData } = await supa.auth.getUser();
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const { text, test } = body as { text?: string; test?: boolean };

    if (test) {
      // Fetch chat_id and send a "connected" message directly
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: tg } = await admin.from("telegram_settings").select("chat_id").eq("user_id", user.id).maybeSingle();
      if (!tg?.chat_id) return new Response(JSON.stringify({ error: "chat_id não configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await sendTelegramRaw(tg.chat_id, "✅ <b>SimplyNvest conectado</b>\nAlertas do Telegram estão ativos.");
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!text) return new Response(JSON.stringify({ error: "text required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const status = await dispatchAlert({ userId: user.id, kind: "manual", html: text, cooldownMinutes: 0 });
    return new Response(JSON.stringify({ status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
