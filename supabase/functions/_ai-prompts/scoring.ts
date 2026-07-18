/** Prompt module: scoring quantitativo por ativo. */
import { normalizePortfolioForCache } from "../ai-cache-helper.ts";

export interface ScoringPayload {
  portfolio: Array<{
    ticker: string;
    name?: string;
    type: string;
    sector?: string;
    quantity: number;
    avgPrice: number;
    currentPrice: number;
    change24h?: number;
    allocation?: number;
  }>;
}

export function buildScoringPrompt(payload: ScoringPayload) {
  const { portfolio } = payload;
  const system = `Você é analista quantitativo brasileiro. Classifique CADA ativo em 4 dimensões (1-10):
1. Valuation (30%): barato/caro
2. Momento (25%): momentum
3. Dividendos (25%): pagador
4. Risco (20%): menor risco = maior nota
Nota final = média ponderada.`;

  const user = `Classifique cada ativo:\n\n${JSON.stringify(
    portfolio.map((a) => ({
      ticker: a.ticker, name: a.name, type: a.type, quantity: a.quantity,
      avgPrice: a.avgPrice, currentPrice: a.currentPrice, change24h: a.change24h,
      allocation: a.allocation, sector: a.sector,
    })),
    null, 2,
  )}`;

  return {
    cacheKey: `scoring:${normalizePortfolioForCache(portfolio)}`,
    ttlMinutes: 60,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "asset_scoring",
        description: "Notas por ativo",
        parameters: {
          type: "object",
          properties: {
            scores: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ticker: { type: "string" },
                  valuation: { type: "number" },
                  momentum: { type: "number" },
                  dividends: { type: "number" },
                  risk: { type: "number" },
                  overall: { type: "number" },
                  summary: { type: "string" },
                },
                required: ["ticker", "valuation", "momentum", "dividends", "risk", "overall", "summary"],
              },
            },
            topPick: { type: "string" },
            worstPick: { type: "string" },
            insight: { type: "string" },
          },
          required: ["scores", "topPick", "worstPick", "insight"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "asset_scoring" } },
    fallback: () => ({
      scores: portfolio.map((a) => ({
        ticker: a.ticker,
        valuation: 5, momentum: 5, dividends: 5, risk: 5, overall: 5,
        summary: "Análise local — IA indisponível",
      })),
      topPick: portfolio[0]?.ticker ?? "",
      worstPick: portfolio[portfolio.length - 1]?.ticker ?? "",
      insight: "Scoring detalhado indisponível no momento.",
    }),
  };
}
