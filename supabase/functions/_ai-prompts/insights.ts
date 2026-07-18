/** Prompt module: portfolio insights. */
import { normalizePortfolioForCache } from "../ai-cache-helper.ts";

export interface InsightsPayload {
  portfolio: Array<{
    ticker: string;
    type: string;
    sector?: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    change24h?: number;
    allocation?: number;
  }>;
}

export function buildInsightsPrompt(payload: InsightsPayload) {
  const { portfolio } = payload;
  const totalValue = portfolio.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const totalCost = portfolio.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  const lines = portfolio.map((a) => {
    const value = a.currentPrice * a.quantity;
    const cost = a.avgPrice * a.quantity;
    const profit = value - cost;
    const profitPct = cost > 0 ? (profit / cost) * 100 : 0;
    return `- ${a.ticker} (${a.type}${a.sector ? ", " + a.sector : ""}): ${a.quantity}un, PM R$${a.avgPrice.toFixed(2)}, Atual R$${a.currentPrice.toFixed(2)}, 24h ${(a.change24h ?? 0).toFixed(2)}%, P/L ${profitPct.toFixed(1)}%, Alocação ${(a.allocation ?? 0).toFixed(1)}%`;
  }).join("\n");

  const user = `Analise esta carteira (cotações reais):

RESUMO:
- Patrimônio: R$${totalValue.toFixed(2)}
- Custo: R$${totalCost.toFixed(2)}
- Retorno: ${totalReturn.toFixed(2)}%
- Ativos: ${portfolio.length}

ATIVOS:
${lines}

Data: ${new Date().toLocaleDateString("pt-BR")}

Gere insights acionáveis, alertas de risco e recomendações práticas.`;

  return {
    cacheKey: `insights:${normalizePortfolioForCache(portfolio)}`,
    ttlMinutes: 30,
    messages: [
      { role: "system", content: "Você é um analista de investimentos sênior do mercado brasileiro. Responda em português." },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "generate_insights",
        description: "Insights estruturados da carteira",
        parameters: {
          type: "object",
          properties: {
            insights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["recommendation", "alert", "analysis"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  severity: { type: "string", enum: ["info", "warning", "critical"] },
                  ticker: { type: "string" },
                },
                required: ["type", "title", "description", "severity"],
              },
            },
            summary: { type: "string" },
          },
          required: ["insights", "summary"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "generate_insights" } },
    /** Fallback local caso a IA falhe. */
    fallback: () => {
      const top = portfolio.reduce((a, b) => ((b.allocation ?? 0) > (a.allocation ?? 0) ? b : a), portfolio[0]);
      const neg = portfolio.filter((a) => (a.change24h ?? 0) < -3);
      const insights: unknown[] = [
        { type: "analysis", title: "Resumo da carteira", description: `R$${totalValue.toFixed(0)} em ${portfolio.length} ativos. Retorno: ${totalReturn.toFixed(1)}%.`, severity: "info" },
        { type: "alert", title: `Maior posição: ${top.ticker}`, description: `${(top.allocation ?? 0).toFixed(1)}% da carteira.`, severity: (top.allocation ?? 0) > 20 ? "warning" : "info", ticker: top.ticker },
      ];
      if (neg.length > 0) {
        insights.push({ type: "alert", title: `${neg.length} ativo(s) em queda forte`, description: neg.map((a) => `${a.ticker} (${(a.change24h ?? 0).toFixed(1)}%)`).join(", "), severity: "warning", ticker: neg[0].ticker });
      }
      return { insights, summary: `Carteira com ${portfolio.length} ativos, retorno ${totalReturn.toFixed(1)}% (análise local)` };
    },
  };
}
