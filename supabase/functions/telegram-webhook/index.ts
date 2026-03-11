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
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const message = body.message;
    if (!message?.text || !message?.chat?.id) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = String(message.chat.id);
    const rawText = message.text.trim();
    const text = rawText.toLowerCase();

    const sendMsg = async (msg: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
      });
    };

    // Handle /start with link code: /start ABCD1234
    if (text.startsWith("/start ")) {
      const code = rawText.split(" ")[1]?.trim();
      if (code) {
        // Find telegram_settings with this link_code
        const { data: tgRow } = await adminClient
          .from("telegram_settings")
          .select("*")
          .eq("link_code", code)
          .maybeSingle();

        if (tgRow) {
          // Update with the chat_id and enable
          await adminClient
            .from("telegram_settings")
            .update({ chat_id: chatId, enabled: true, link_code: null })
            .eq("id", tgRow.id);

          await sendMsg(
            `✅ *Conta vinculada com sucesso!*\n\n` +
            `Seu Telegram foi conectado ao T2-Simplynvest.\n` +
            `Você receberá resumos diários sobre seus investimentos.\n\n` +
            `Comandos:\n` +
            `🔐 /senha - Alterar sua senha\n` +
            `❓ /ajuda - Ver comandos`
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          await sendMsg("❌ Código inválido ou expirado. Gere um novo código nas configurações do T2-Simplynvest.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Find user by chat_id (already linked)
    const { data: tgSetting } = await adminClient
      .from("telegram_settings")
      .select("*")
      .eq("chat_id", chatId)
      .eq("enabled", true)
      .maybeSingle();

    if (text === "/start" || text === "/ajuda" || text === "/help") {
      if (tgSetting) {
        await sendMsg(
          `🤖 *T2-Simplynvest Bot*\n\n` +
          `✅ Sua conta está vinculada.\n\n` +
          `Comandos disponíveis:\n` +
          `🔐 /senha - Receber link para alterar sua senha\n` +
          `❓ /ajuda - Exibir esta mensagem\n\n` +
          `_Você recebe resumos diários automáticos._`
        );
      } else {
        await sendMsg(
          `🤖 *InvestAI Bot*\n\n` +
          `Para vincular sua conta, acesse *Configurações > Telegram* no InvestAI e clique em *"Vincular Telegram"*.\n\n` +
          `Você receberá um link para enviar aqui.`
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tgSetting) {
      await sendMsg("⚠️ Conta não vinculada. Acesse Configurações > Telegram no InvestAI para vincular.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text === "/resetsenha" || text === "/alterarsenha" || text === "/senha") {
      const { data: userData } = await adminClient.auth.admin.getUserById(tgSetting.user_id);
      if (!userData?.user?.email) {
        await sendMsg("❌ Não foi possível encontrar seu email cadastrado.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: userData.user.email,
      });

      if (linkError || !linkData) {
        await sendMsg("❌ Erro ao gerar link. Tente novamente mais tarde.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await sendMsg(
        `🔐 *Redefinição de Senha*\n\n` +
        `📧 Email: ${userData.user.email}\n\n` +
        `🔗 [Clique aqui para redefinir](${linkData.properties?.action_link})\n\n` +
        `⏰ Expira em 1 hora.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sendMsg("Comando não reconhecido. Envie /ajuda para ver os comandos.");

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
