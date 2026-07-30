import { requireCaller } from "../_shared/auth.ts";
// AI IR Declaration - gera discriminação da Ficha "Bens e Direitos" + guia consolidado
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const userCalls = new Map<string, number[]>();
function checkRateLimit(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let uid = "anon";
  try { if (parts[1]) uid = JSON.parse(atob(parts[1])).sub || "anon"; } catch {}
  const now = Date.now();
  const calls = (userCalls.get(uid) || []).filter(t => now - t < 60000);
  if (calls.length >= 10) {
    return new Response(JSON.stringify({ error: "Rate limit: 10/min" }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  calls.push(now); userCalls.set(uid, calls);
  return null;
}

// Códigos oficiais da Receita para Bens e Direitos
const CODIGO_BEM: Record<string, string> = {
  'Ação':       '31 - Ações (inclusive listadas em bolsa)',
  'FII':        '73 - Fundo de Investimento Imobiliário',
  'ETF':        '74 - Fundos de Índice de Mercado (ETF) — exceto imobiliário',
  'Cripto':     '81 - Criptoativo Bitcoin (BTC) / 82 - Outras criptomoedas / 89 - Demais criptoativos',
  'Renda Fixa': '45 - Aplicação de renda fixa (CDB, RDB, LCI, LCA e outros)',
};

const GRUPO_BEM: Record<string, string> = {
  'Ação': '03', 'FII': '07', 'ETF': '07', 'Cripto': '08', 'Renda Fixa': '04',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Somente sessão válida (ou chamada interna cron/service): evita uso do endpoint
  // como proxy gratuito de LLM e vazamento de dados entre contas.
  const denied = await requireCaller(req);
  if (denied) return denied;
  const rl = checkRateLimit(req); if (rl) return rl;

  try {
    const { year, positions, previousPositions, monthlyTaxes, cnpjMap } = await req.json();
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY não configurada");

    // Enrichment determinístico dos "bens" (não gasta token)
    const bens = (positions || []).map((p: any) => {
      const prev = (previousPositions || []).find((pp: any) => pp.ticker === p.ticker && pp.broker === p.broker);
      return {
        ticker: p.ticker,
        name: p.name,
        type: p.type,
        broker: p.broker || 'N/A',
        quantity: p.quantity,
        custoTotal: p.custoTotal,
        situacaoAnterior: prev?.custoTotal || 0,
        situacaoAtual: p.custoTotal,
        grupo: GRUPO_BEM[p.type] || '99',
        codigo: CODIGO_BEM[p.type] || '99 - Outros bens e direitos',
        cnpj: cnpjMap?.[p.ticker] || '',
      };
    });

    // Resumo compacto p/ o prompt IA
    const resumoBens = bens.slice(0, 40).map((b: any) =>
      `• ${b.ticker} (${b.type}) — ${b.quantity} un — Custo Total: R$${b.custoTotal.toFixed(2)} — Corretora: ${b.broker}`
    ).join('\n');

    const resumoRV = (monthlyTaxes || []).filter((m: any) => m.totalTax > 0 || m.salesTotal > 0)
      .map((m: any) => `• ${m.label}: vendas R$${m.salesTotal.toFixed(2)}, imposto R$${m.totalTax.toFixed(2)}`)
      .join('\n') || 'Nenhuma operação tributável';

    const systemPrompt = `Você é contador CRC especializado em IRPF de investimentos no Brasil. Gere o guia de declaração IRPF ${year} para esta carteira, em formato passo-a-passo, usando LINGUAGEM DIRETA e OPERACIONAL (o usuário vai copiar e colar no programa da Receita).

Retorne EXATAMENTE nesta estrutura em Markdown:

## 1. Ficha "Bens e Direitos"
Para CADA ativo listado, mostre:
- **Grupo/Código**: (use o código correto)
- **Localização**: 105 - Brasil (ou 249 se internacional)
- **Discriminação sugerida** (texto pronto para colar, contendo: quantidade, nome do papel, CNPJ do administrador quando FII/ETF, custódia na corretora, custo médio de aquisição)
- **Situação em 31/12/${year - 1}**: R$ X
- **Situação em 31/12/${year}**: R$ Y

## 2. Ficha "Renda Variável - Operações Comuns/Day-Trade"
Preencha mês a mês baseado no resumo mensal fornecido, indicando:
- Mercado à Vista - Ações / FII / ETF
- Resultado líquido do mês
- IR devido e código DARF (6015 para ações/ETF/FII, 4600 cripto)

## 3. Ficha "Rendimentos Isentos e Não Tributáveis"
- Linha 09 (Rendimentos de FII): oriente a somar dividendos recebidos
- Linha 20 (Ganho isento em venda de ações ≤ R$20k/mês): identifique os meses e o valor
- Linha 12 (Transferências patrimoniais)

## 4. Ficha "Rendimentos Sujeitos à Tributação Exclusiva/Definitiva"
- Linha 06 (Rendimentos de aplicações financeiras): CDBs, LCIs (LCI/LCA são isentos)
- Linha 10 (Juros sobre Capital Próprio): 15% já retido na fonte

## 5. DARFs pendentes / Prejuízos a compensar
Liste vencimentos e valores.

## 6. Checklist final
Lista curta de documentos que o usuário deve reunir (informes das corretoras, comprovantes DARF, extrato de proventos).

Seja PRECISO, PROFISSIONAL, sem preâmbulos.`;

    const userPrompt = `**Posições em 31/12/${year} (${bens.length} ativos):**
${resumoBens}
${bens.length > 40 ? `\n(+${bens.length - 40} demais ativos - aplicar mesma regra)` : ''}

**Renda Variável ${year}:**
${resumoRV}

Gere o guia completo agora.`;

    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit DeepSeek" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos DeepSeek insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error ${resp.status}`);
    }

    const data = await resp.json();
    const guide = data.choices?.[0]?.message?.content || "Erro ao gerar guia";

    return new Response(JSON.stringify({ guide, bens, year }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
