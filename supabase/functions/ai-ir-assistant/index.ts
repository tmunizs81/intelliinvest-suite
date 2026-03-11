

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const { assets, year } = await req.json();

    const assetsInfo = (assets || []).map((a: any) =>
      `${a.ticker} (${a.name}): Tipo=${a.type}, Qtd=${a.quantity}, PM=R$${a.avgPrice?.toFixed(2)}, Atual=R$${a.currentPrice?.toFixed(2)}`
    ).join('\n');

    const aiResp = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
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
            content: `Você é um contador especializado em imposto de renda de investimentos no Brasil. Gere um guia passo-a-passo personalizado para declarar os investimentos abaixo no IRPF ${year}.

Inclua:
1. Quais fichas do programa IRPF usar (Bens e Direitos, Renda Variável, etc.)
2. Códigos de bens corretos para cada tipo de ativo
3. Como declarar cada ativo específico com valores
4. Informações sobre isenções (vendas até R$20k/mês para ações)
5. Day trade vs swing trade
6. Compensação de prejuízos
7. FIIs (rendimentos isentos vs ganho de capital)
8. Cripto (código 89 ou equivalente)
9. Renda Fixa (informes de rendimento)
10. ETFs internacionais (código correto, câmbio)

Responda em Markdown formatado e organizado.`,
          },
          { role: "user", content: `Gere o guia de declaração IRPF ${year} para esta carteira:\n${assetsInfo}` },
        ],
        max_tokens: 2000,
      }),
    });

    const aiData = await aiResp.json();
    const guide = aiData.choices?.[0]?.message?.content || "Erro ao gerar guia.";

    return new Response(JSON.stringify({ guide }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
