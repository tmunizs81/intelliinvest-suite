
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
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

    const sendMsg = async (msg: string, parseMode = "Markdown") => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: parseMode }),
      });
    };

    const sendTyping = async () => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action: "typing" }),
      });
    };

    // Handle /start with link code
    if (text.startsWith("/start ")) {
      const code = rawText.split(" ")[1]?.trim();
      if (code) {
        const { data: tgRow } = await adminClient
          .from("telegram_settings")
          .select("*")
          .eq("link_code", code)
          .maybeSingle();

        if (tgRow) {
          await adminClient
            .from("telegram_settings")
            .update({ chat_id: chatId, enabled: true, link_code: null })
            .eq("id", tgRow.id);

          await sendMsg(
            `✅ *Conta vinculada com sucesso!*\n\n` +
            `Seu Telegram foi conectado ao T2-Simplynvest.\n\n` +
            `📋 *Comandos disponíveis:*\n` +
            `/carteira - Resumo da carteira\n` +
            `/cotacao PETR4 - Cotação de um ativo\n` +
            `/ranking - Top performers\n` +
            `/saude - Health score da carteira\n` +
            `/dividendos - Próximos dividendos\n` +
            `/metas - Suas metas de investimento\n` +
            `/perguntar [pergunta] - Consultar IA\n` +
            `/senha - Alterar sua senha\n` +
            `/ajuda - Ver todos os comandos`
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

    // Find user by chat_id
    const { data: tgSetting } = await adminClient
      .from("telegram_settings")
      .select("*")
      .eq("chat_id", chatId)
      .eq("enabled", true)
      .maybeSingle();

    // /start or /ajuda
    if (text === "/start" || text === "/ajuda" || text === "/help") {
      if (tgSetting) {
        await sendMsg(
          `🤖 *T2-Simplynvest Bot*\n\n` +
          `✅ Conta vinculada.\n\n` +
          `📋 *Comandos:*\n` +
          `💼 /carteira - Resumo da carteira\n` +
          `📊 /cotacao PETR4 - Cotação de um ativo\n` +
          `🏆 /ranking - Top performers\n` +
          `❤️ /saude - Health score\n` +
          `💰 /dividendos - Próximos dividendos\n` +
          `🎯 /metas - Metas de investimento\n` +
          `🤖 /perguntar [pergunta] - Consultar IA\n` +
          `🔐 /senha - Alterar senha\n\n` +
          `_Notificações automáticas ativas_ ✅`
        );
      } else {
        await sendMsg(
          `🤖 *T2-Simplynvest Bot*\n\n` +
          `Para vincular sua conta, acesse *Configurações > Telegram* no T2-Simplynvest e clique em *"Vincular Telegram"*.`
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tgSetting) {
      await sendMsg("⚠️ Conta não vinculada. Acesse Configurações > Telegram no T2-Simplynvest para vincular.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = tgSetting.user_id;

    // Helper: get holdings and quotes
    const getPortfolioData = async () => {
      const { data: holdings } = await adminClient
        .from("holdings")
        .select("*")
        .eq("user_id", userId);
      if (!holdings || holdings.length === 0) return { holdings: [], quotes: {} };

      const tickers = holdings.map((h: any) => h.ticker);
      const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
        body: JSON.stringify({ tickers }),
      });
      const quotesData = await quotesResp.json();
      return { holdings, quotes: quotesData.quotes || {} };
    };

    // ===== /carteira =====
    if (text === "/carteira" || text === "/portfolio") {
      await sendTyping();
      const { holdings, quotes } = await getPortfolioData();
      if (holdings.length === 0) {
        await sendMsg("📭 Sua carteira está vazia. Adicione ativos pelo T2-Simplynvest.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let totalValue = 0, totalCost = 0, dailyChange = 0;
      const lines: string[] = [];

      for (const h of holdings) {
        const q = quotes[h.ticker];
        const price = q?.currentPrice || 0;
        const value = price * h.quantity;
        const cost = h.avg_price * h.quantity;
        totalValue += value;
        totalCost += cost;
        const profit = cost > 0 ? ((value - cost) / cost * 100).toFixed(1) : '0';
        const emoji = (value - cost) >= 0 ? '🟢' : '🔴';
        if (price > 0) {
          const prev = price / (1 + (q?.change24h || 0) / 100);
          dailyChange += (price - prev) * h.quantity;
          lines.push(`${emoji} *${h.ticker}* R$${price.toFixed(2)} (${profit}%)`);
        }
      }

      const totalGain = totalValue - totalCost;
      const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(1) : '0';

      await sendMsg(
        `💼 *Resumo da Carteira*\n\n` +
        `💰 Patrimônio: R$${totalValue.toFixed(2)}\n` +
        `${dailyChange >= 0 ? '📈' : '📉'} Hoje: ${dailyChange >= 0 ? '+' : ''}R$${dailyChange.toFixed(2)}\n` +
        `${totalGain >= 0 ? '✅' : '❌'} Lucro: ${totalGain >= 0 ? '+' : ''}R$${totalGain.toFixed(2)} (${totalGainPct}%)\n` +
        `📋 ${holdings.length} ativos\n\n` +
        lines.join('\n')
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /cotacao TICKER =====
    if (text.startsWith("/cotacao ") || text.startsWith("/cotação ") || text.startsWith("/quote ")) {
      await sendTyping();
      const ticker = rawText.split(" ").slice(1).join(" ").trim().toUpperCase();
      if (!ticker) {
        await sendMsg("Uso: /cotacao PETR4");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const searchTicker = ticker.includes(".SA") ? ticker : `${ticker}.SA`;
      const quotesResp = await fetch(`${supabaseUrl}/functions/v1/yahoo-finance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
        body: JSON.stringify({ tickers: [searchTicker] }),
      });
      const quotesData = await quotesResp.json();
      const q = quotesData.quotes?.[searchTicker];

      if (!q?.currentPrice) {
        await sendMsg(`❌ Ativo *${ticker}* não encontrado.`);
      } else {
        const emoji = (q.change24h || 0) >= 0 ? '📈' : '📉';
        await sendMsg(
          `${emoji} *${ticker}*\n\n` +
          `💲 Preço: R$${q.currentPrice.toFixed(2)}\n` +
          `📊 Variação: ${(q.change24h || 0) >= 0 ? '+' : ''}${(q.change24h || 0).toFixed(2)}%\n` +
          `📈 Máx dia: R$${(q.dayHigh || 0).toFixed(2)}\n` +
          `📉 Mín dia: R$${(q.dayLow || 0).toFixed(2)}\n` +
          `📦 Volume: ${(q.volume || 0).toLocaleString('pt-BR')}`
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /ranking =====
    if (text === "/ranking" || text === "/top") {
      await sendTyping();
      const { holdings, quotes } = await getPortfolioData();
      if (holdings.length === 0) {
        await sendMsg("📭 Carteira vazia.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ranked = holdings
        .map((h: any) => {
          const q = quotes[h.ticker];
          const price = q?.currentPrice || 0;
          const profitPct = h.avg_price > 0 ? ((price - h.avg_price) / h.avg_price * 100) : 0;
          return { ticker: h.ticker, profitPct, change24h: q?.change24h || 0 };
        })
        .sort((a: any, b: any) => b.profitPct - a.profitPct);

      const top3 = ranked.slice(0, 3);
      const bottom3 = ranked.slice(-3).reverse();

      let msg = `🏆 *Top Performers*\n\n`;
      msg += `📈 *Melhores:*\n`;
      top3.forEach((r: any, i: number) => {
        msg += `${['🥇', '🥈', '🥉'][i]} *${r.ticker}* ${r.profitPct >= 0 ? '+' : ''}${r.profitPct.toFixed(1)}% (hoje: ${r.change24h >= 0 ? '+' : ''}${r.change24h.toFixed(1)}%)\n`;
      });
      msg += `\n📉 *Piores:*\n`;
      bottom3.forEach((r: any) => {
        msg += `🔴 *${r.ticker}* ${r.profitPct >= 0 ? '+' : ''}${r.profitPct.toFixed(1)}%\n`;
      });

      await sendMsg(msg);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /saude =====
    if (text === "/saude" || text === "/saúde" || text === "/health") {
      await sendTyping();
      const { holdings, quotes } = await getPortfolioData();
      if (holdings.length === 0) {
        await sendMsg("📭 Carteira vazia.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const assets = holdings.map((h: any) => {
        const q = quotes[h.ticker];
        return {
          ticker: h.ticker, name: h.name, type: h.type, sector: h.sector,
          quantity: h.quantity, avgPrice: h.avg_price,
          currentPrice: q?.currentPrice || h.avg_price,
          change24h: q?.change24h || 0,
        };
      });

      try {
        const healthResp = await fetch(`${supabaseUrl}/functions/v1/portfolio-health`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ assets }),
        });
        const healthData = await healthResp.json();

        const scoreEmoji = healthData.score >= 80 ? '🟢' : healthData.score >= 60 ? '🟡' : '🔴';
        let msg = `❤️ *Saúde da Carteira*\n\n`;
        msg += `${scoreEmoji} Score: *${healthData.score}/100* (${healthData.grade})\n\n`;
        msg += `📝 ${healthData.summary}\n\n`;

        if (healthData.dimensions) {
          msg += `📊 *Dimensões:*\n`;
          for (const d of healthData.dimensions) {
            const dEmoji = d.score >= 80 ? '🟢' : d.score >= 60 ? '🟡' : '🔴';
            msg += `${dEmoji} ${d.name}: ${d.score}/100\n`;
          }
        }

        if (healthData.recommendations?.length > 0) {
          msg += `\n💡 *Recomendações:*\n`;
          for (const r of healthData.recommendations.slice(0, 3)) {
            msg += `• ${r}\n`;
          }
        }

        await sendMsg(msg);
      } catch {
        await sendMsg("❌ Erro ao calcular saúde da carteira.");
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /dividendos =====
    if (text === "/dividendos" || text === "/dividends") {
      await sendTyping();
      const { holdings, quotes } = await getPortfolioData();
      const eligible = holdings.filter((h: any) => ['Ação', 'FII', 'ETF'].includes(h.type));
      if (eligible.length === 0) {
        await sendMsg("📭 Nenhum ativo elegível a dividendos.");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
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

        let msg = `💰 *Dividendos*\n\n`;
        if (divData.summary) {
          msg += `📊 Média mensal: R$${(divData.summary.monthlyAverage || 0).toFixed(2)}\n`;
          msg += `📅 Total (12m): R$${(divData.summary.totalLast12Months || 0).toFixed(2)}\n`;
          msg += `📈 Yield médio: ${(divData.summary.averageYield || 0).toFixed(1)}%\n\n`;
        }
        if (divData.upcoming?.length > 0) {
          msg += `📅 *Próximos:*\n`;
          for (const d of divData.upcoming.slice(0, 5)) {
            msg += `• *${d.ticker}* R$${(d.totalAmount || 0).toFixed(2)} - ${new Date(d.paymentDate || d.date).toLocaleDateString('pt-BR')}\n`;
          }
        }
        await sendMsg(msg);
      } catch {
        await sendMsg("❌ Erro ao buscar dividendos.");
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /metas =====
    if (text === "/metas" || text === "/goals") {
      await sendTyping();
      const { holdings, quotes } = await getPortfolioData();
      let totalValue = 0;
      for (const h of holdings) {
        const q = quotes[h.ticker];
        totalValue += (q?.currentPrice || 0) * h.quantity;
      }

      try {
        const goalsResp = await fetch(`${supabaseUrl}/functions/v1/investment-goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
          body: JSON.stringify({ action: "list", userId }),
        });
        const goalsData = await goalsResp.json();

        if (!goalsData.goals || goalsData.goals.length === 0) {
          await sendMsg("🎯 Nenhuma meta cadastrada. Crie metas no T2-Simplynvest.");
        } else {
          let msg = `🎯 *Suas Metas*\n\n`;
          for (const g of goalsData.goals) {
            const pct = g.target > 0 ? Math.min(100, (g.current / g.target * 100)) : 0;
            const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
            const emoji = pct >= 100 ? '✅' : pct >= 75 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
            msg += `${emoji} *${g.name}*\n`;
            msg += `   ${bar} ${pct.toFixed(0)}%\n`;
            msg += `   R$${(g.current || 0).toFixed(0)} / R$${(g.target || 0).toFixed(0)}\n\n`;
          }
          await sendMsg(msg);
        }
      } catch {
        await sendMsg("❌ Erro ao buscar metas.");
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /perguntar [pergunta] - AI Chat =====
    if (text.startsWith("/perguntar ") || text.startsWith("/ask ") || text.startsWith("/ia ")) {
      await sendTyping();
      const question = rawText.split(" ").slice(1).join(" ").trim();
      if (!question) {
        await sendMsg("Uso: /perguntar Vale a pena comprar PETR4?");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get portfolio context
      const { holdings, quotes } = await getPortfolioData();
      const portfolioContext = holdings.map((h: any) => {
        const q = quotes[h.ticker];
        const price = q?.currentPrice || 0;
        const profitPct = h.avg_price > 0 ? ((price - h.avg_price) / h.avg_price * 100).toFixed(1) : '0';
        return `${h.ticker} (${h.type}): ${h.quantity} un @ R$${h.avg_price.toFixed(2)}, atual R$${price.toFixed(2)}, lucro: ${profitPct}%`;
      }).join('\n');

      const totalValue = holdings.reduce((s: number, h: any) => {
        const q = quotes[h.ticker];
        return s + (q?.currentPrice || 0) * h.quantity;
      }, 0);

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Você é o consultor financeiro IA do T2-Simplynvest. Responda de forma concisa e objetiva (max 500 palavras). Use emojis. Contexto da carteira do usuário:\n\nPatrimônio: R$${totalValue.toFixed(2)}\n${portfolioContext}\n\nResponda em português brasileiro.`,
              },
              { role: "user", content: question },
            ],
            max_tokens: 800,
          }),
        });
        const aiData = await aiResp.json();
        const reply = aiData.choices?.[0]?.message?.content || "Não consegui processar sua pergunta.";
        await sendMsg(reply);
      } catch {
        await sendMsg("❌ Erro ao consultar IA. Tente novamente.");
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== /senha =====
    if (text === "/resetsenha" || text === "/alterarsenha" || text === "/senha") {
      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
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

    // Unknown command
    await sendMsg(
      "❓ Comando não reconhecido.\n\nEnvie /ajuda para ver os comandos disponíveis."
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
