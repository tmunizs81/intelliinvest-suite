/**
 * Detecção de ETFs irlandeses UCITS (acumulação x distribuição).
 * Heurística: sufixo .L / .DE / .AS + palavras-chave "UCITS", "Acc", "Dist"
 * no nome, ou lista curada de tickers conhecidos.
 */

const KNOWN_ACC = new Set([
  'CSPX.L', 'VUAA.L', 'VWRA.L', 'VUAG.L', 'IWDA.AS', 'EIMI.L', 'SWDA.L',
  'IUSA.L', 'SGLN.L', 'IB01.L', 'EQQQ.L', 'CNDX.L', 'MEUD.PA',
]);
const KNOWN_DIST = new Set([
  'VWRL.L', 'VUKE.L', 'ISF.L', 'VHYL.L', 'IUSA.AS',
]);

export type UCITSKind = 'acc' | 'dist' | 'unknown';

export interface UCITSHint {
  isUcits: boolean;
  kind: UCITSKind;
  reason: string;
}

const IRISH_SUFFIXES = ['.L', '.DE', '.AS', '.MI', '.PA', '.SW'];

export function detectUCITS(ticker: string, name?: string): UCITSHint {
  const t = (ticker || '').toUpperCase().trim();
  const n = (name || '').toUpperCase();

  if (KNOWN_ACC.has(t)) return { isUcits: true, kind: 'acc', reason: 'Ticker conhecido UCITS acumulação' };
  if (KNOWN_DIST.has(t)) return { isUcits: true, kind: 'dist', reason: 'Ticker conhecido UCITS distribuição' };

  const hasSuffix = IRISH_SUFFIXES.some((s) => t.endsWith(s));
  const nameHasUcits = /UCITS/.test(n);
  const nameHasAcc = /\bACC\b|ACCUMULAT/.test(n);
  const nameHasDist = /\bDIST\b|DISTRIB/.test(n);

  if (nameHasUcits) {
    return {
      isUcits: true,
      kind: nameHasAcc ? 'acc' : nameHasDist ? 'dist' : 'unknown',
      reason: 'Nome do ativo contém "UCITS"',
    };
  }
  if (hasSuffix && (nameHasAcc || nameHasDist)) {
    return {
      isUcits: true,
      kind: nameHasAcc ? 'acc' : 'dist',
      reason: `Sufixo europeu ${t.slice(t.lastIndexOf('.'))} + variante identificada no nome`,
    };
  }
  return { isUcits: false, kind: 'unknown', reason: '' };
}
