import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const message = body.message;
    if (!message?.text || !message?.chat?.id) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim().toLowerCase();

    // Find user by chat_id
    const { data: tgSetting } = await adminClient
      .from("telegram_settings")
      .select("*")
      .eq("chat_id", chatId)
      .eq("enabled", true)
      .maybeSingle();

    if (!tgSetting || !tgSetting.bot_token) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendTelegramMessage = async (text: string) => {
      await fetch(`https://api.telegram.org/bot${tgSetting.bot_token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      });
    };

    if (text === "/resetsenha" || text === "/alterarsenha" || text === "/senha") {
      // Get user email
      const { data: userData } = await adminClient.auth.admin.getUserById(tgSetting.user_id);
      
      if (!userData?.user?.email) {
        await sendTelegramMessage("❌ Não foi possível encontrar seu email cadastrado.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = userData.user.email;

      // Generate password reset link
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (linkError || !linkData) {
        await sendTelegramMessage("❌ Erro ao gerar link de redefinição. Tente novamente mais tarde.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build the redirect URL with the token
      const resetUrl = `${supabaseUrl}/auth/v1/verify?token=${linkData.properties?.hashed_token}&type=recovery&redirect_to=${supabaseUrl.replace('.supabase.co', '.lovable.app')}/reset-password`;

      await sendTelegramMessage(
        `🔐 *InvestAI - Redefinição de Senha*\n\n` +
        `Olá! Você solicitou a alteração de senha.\n\n` +
        `📧 Email: ${email}\n\n` +
        `🔗 [Clique aqui para redefinir sua senha](${linkData.properties?.action_link})\n\n` +
        `⏰ Este link expira em 1 hora.\n\n` +
        `_Se você não solicitou, ignore esta mensagem._`
      );

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text === "/ajuda" || text === "/help" || text === "/start") {
      await sendTelegramMessage(
        `🤖 *InvestAI Bot*\n\n` +
        `Comandos disponíveis:\n\n` +
        `🔐 /senha - Receber link para alterar sua senha\n` +
        `❓ /ajuda - Exibir esta mensagem de ajuda\n\n` +
        `_Você também recebe resumos diários automáticos com informações sobre seus investimentos._`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown command
    await sendTelegramMessage(
      `Comando não reconhecido. Envie /ajuda para ver os comandos disponíveis.`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
