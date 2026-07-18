import { type Asset } from '@/lib/mockData';

export interface AffectedHolding {
  asset: Asset;
  score: number;      // relative impact 0-100
  reasons: string[];  // why it's affected
}

interface EcoEventLite {
  title: string;
  country: string;
  currency?: string;
  importance: number;
}

const norm = (s: string) => (s || '').toLowerCase();

/**
 * Score how much a given economic event should impact each holding
 * in the user's portfolio. Uses a mix of country/currency and
 * title keyword heuristics (interest rates, inflation, oil, jobs, etc).
 */
export function computeAffectedHoldings(
  event: EcoEventLite,
  assets: Asset[],
  limit = 6
): AffectedHolding[] {
  if (!assets?.length) return [];
  const title = norm(event.title);
  const country = (event.country || '').toUpperCase();

  // Keyword buckets
  const kw = {
    rates:     /(selic|copom|juros|interest rate|fed|fomc|rate decision|taxa)/,
    inflation: /(ipca|cpi|pce|inflaç|inflation|ppi|igp)/,
    jobs:      /(payroll|unemployment|jobless|emprego|desemprego|caged|nfp)/,
    gdp:       /(gdp|pib|growth)/,
    oil:       /(oil|petr[óo]leo|opec|crude|wti|brent)/,
    fx:        /(dollar|dxy|c[âa]mbio|currency|exchange rate)/,
    crypto:    /(bitcoin|crypto|cripto|ethereum)/,
    housing:   /(housing|home sales|real estate|imobili|construction)/,
    china:     /(china|manufacturing pmi|caixin)/,
    retail:    /(retail sales|varejo|consumer)/,
  };

  const hit = (re: RegExp) => re.test(title);

  const scored = assets.map<AffectedHolding>((a) => {
    const reasons: string[] = [];
    let score = 0;
    const alloc = Math.max(0, a.allocation || 0);
    const type = a.type;
    const sector = norm(a.sector || '');
    const cur = (a.currency || 'BRL').toUpperCase();
    const ticker = a.ticker.toUpperCase();

    // --- Country / currency proximity ---
    if (country === 'BR' && (cur === 'BRL' || ['Ação', 'FII', 'BDR', 'Renda Fixa'].includes(type))) {
      score += 15; reasons.push('Ativo brasileiro');
    }
    if (country === 'US' && (cur === 'USD' || ['Stock', 'ETF Internacional', 'REIT'].includes(type))) {
      score += 15; reasons.push('Ativo americano');
    }
    if ((country === 'EU' && cur === 'EUR') ||
        (country === 'GB' && cur === 'GBP') ||
        (country === 'JP' && cur === 'JPY')) {
      score += 20; reasons.push(`Exposição ${cur}`);
    }
    // BDR reflects US underlying
    if (country === 'US' && type === 'BDR') { score += 5; reasons.push('BDR sensível a US'); }

    // --- Keyword rules ---
    if (hit(kw.rates)) {
      if (type === 'Renda Fixa') { score += 35; reasons.push('Sensível a juros'); }
      if (/(banco|financ)/.test(sector)) { score += 20; reasons.push('Setor bancário'); }
      if (type === 'FII') { score += 15; reasons.push('FII (cap rate)'); }
      if (/(utilities|el[ée]tric|energia)/.test(sector)) { score += 10; reasons.push('Utilities'); }
    }
    if (hit(kw.inflation)) {
      if (type === 'Renda Fixa') { score += 20; reasons.push('Título indexado'); }
      if (/(varejo|consumo|retail)/.test(sector)) { score += 15; reasons.push('Consumo/Varejo'); }
      if (type === 'FII') { score += 10; reasons.push('FII (IPCA)'); }
    }
    if (hit(kw.oil)) {
      if (/(petr|oil|g[áa]s|energia)/.test(sector) || /^PETR|^RRRP|^PRIO|^XOM|^CVX/.test(ticker)) {
        score += 30; reasons.push('Óleo & gás');
      }
    }
    if (hit(kw.fx)) {
      if (cur !== 'BRL') { score += 20; reasons.push(`Exposição cambial (${cur})`); }
    }
    if (hit(kw.crypto)) {
      if (type === 'Cripto') { score += 40; reasons.push('Criptoativo'); }
    }
    if (hit(kw.housing)) {
      if (type === 'FII' || type === 'REIT' || type === 'Imóvel') {
        score += 25; reasons.push('Imobiliário');
      }
    }
    if (hit(kw.china)) {
      if (/(minera|siderurg|commod)/.test(sector) || /^VALE|^CSNA|^GGBR|^USIM/.test(ticker)) {
        score += 25; reasons.push('Commodities/China');
      }
    }
    if (hit(kw.retail)) {
      if (/(varejo|consumo|retail)/.test(sector)) { score += 15; reasons.push('Varejo'); }
    }
    if (hit(kw.jobs) || hit(kw.gdp)) {
      // Broad macro — small nudge to equity risk
      if (['Ação', 'Stock', 'ETF', 'ETF Internacional', 'BDR'].includes(type)) {
        score += 8; reasons.push('Macro / risco');
      }
    }

    // Weight by allocation so bigger positions surface first
    const weighted = score * (0.4 + Math.min(1, alloc / 20) * 0.6);
    return { asset: a, score: weighted, reasons: Array.from(new Set(reasons)) };
  });

  const filtered = scored.filter(x => x.score > 0 && x.reasons.length > 0);
  filtered.sort((a, b) => b.score - a.score);

  // Normalize to 0-100 for display
  const max = filtered[0]?.score || 1;
  return filtered.slice(0, limit).map(x => ({
    ...x,
    score: Math.round((x.score / max) * 100),
  }));
}
