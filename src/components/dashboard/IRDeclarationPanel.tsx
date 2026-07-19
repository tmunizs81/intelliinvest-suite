import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/mockData';
import type { MonthlyTaxSummary } from '@/hooks/useTaxes';
import { Loader2, FileText, Sparkles, RefreshCw, Copy, Check, Download, Building2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Position {
  ticker: string; name: string; type: string; broker: string;
  quantity: number; custoTotal: number;
}

interface Props {
  year: number;
  positions: Position[];
  previousPositions: Position[];
  monthlyTaxes: MonthlyTaxSummary[];
}

const GRUPO_BEM: Record<string, { grupo: string; codigo: string; loc: string }> = {
  'Ação':       { grupo: '03', codigo: '31', loc: '105 - Brasil' },
  'FII':        { grupo: '07', codigo: '73', loc: '105 - Brasil' },
  'ETF':        { grupo: '07', codigo: '74', loc: '105 - Brasil' },
  'Cripto':     { grupo: '08', codigo: '81/89', loc: '105 - Brasil' },
  'Renda Fixa': { grupo: '04', codigo: '45', loc: '105 - Brasil' },
};

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
      {ok ? <Check className="h-3 w-3 text-gain" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function IRDeclarationPanel({ year, positions, previousPositions, monthlyTaxes }: Props) {
  const [guide, setGuide] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrichedBens = useMemo(() => positions.map(p => {
    const prev = previousPositions.find(pp => pp.ticker === p.ticker && pp.broker === p.broker);
    const meta = GRUPO_BEM[p.type] || { grupo: '99', codigo: '99', loc: '105 - Brasil' };
    return {
      ...p,
      grupo: meta.grupo,
      codigo: meta.codigo,
      localizacao: meta.loc,
      situacaoAnterior: prev?.custoTotal || 0,
      situacaoAtual: p.custoTotal,
      discriminacao: `${p.quantity.toLocaleString('pt-BR')} unidade(s) de ${p.name} (${p.ticker}), custodiadas na ${p.broker}, adquiridas ao custo médio total de ${formatCurrency(p.custoTotal)}.`,
    };
  }).sort((a, b) => b.situacaoAtual - a.situacaoAtual), [positions, previousPositions]);

  const rendimentosIsentos = useMemo(() => {
    const isentosVenda = monthlyTaxes
      .filter(m => m.exempt)
      .reduce((s, m) => s + m.gains.filter(g => g.taxRate === 0).reduce((a, g) => a + g.grossGain, 0), 0);
    return { isentosVenda };
  }, [monthlyTaxes]);

  const rendaVariavel = useMemo(() => monthlyTaxes.filter(m => m.totalTax > 0 || m.gains.some(g => g.grossGain !== 0)), [monthlyTaxes]);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-ir-declaration', {
        body: {
          year,
          positions: enrichedBens,
          previousPositions,
          monthlyTaxes: monthlyTaxes.map(m => ({ label: m.label, salesTotal: m.salesTotal, totalTax: m.totalTax })),
        },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setGuide(data?.guide || 'Nenhum guia gerado.');
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar');
    } finally { setLoading(false); }
  }, [year, enrichedBens, previousPositions, monthlyTaxes]);

  const exportFull = () => {
    let out = `═══════════════════════════════════════════════\n`;
    out += `   DECLARAÇÃO IRPF ${year + 1} — ANO-CALENDÁRIO ${year}\n`;
    out += `═══════════════════════════════════════════════\n\n`;
    out += `═══ FICHA: BENS E DIREITOS ═══\n\n`;
    enrichedBens.forEach((b, i) => {
      out += `[${i + 1}] ${b.ticker} — ${b.name}\n`;
      out += `  Grupo: ${b.grupo}  |  Código: ${b.codigo}  |  Localização: ${b.localizacao}\n`;
      out += `  Discriminação: ${b.discriminacao}\n`;
      out += `  Situação em 31/12/${year - 1}: ${formatCurrency(b.situacaoAnterior)}\n`;
      out += `  Situação em 31/12/${year}: ${formatCurrency(b.situacaoAtual)}\n\n`;
    });
    out += `\n═══ FICHA: RENDA VARIÁVEL ═══\n\n`;
    rendaVariavel.forEach(m => {
      out += `${m.label}\n`;
      out += `  Vendas: ${formatCurrency(m.salesTotal)}\n`;
      m.gains.forEach(g => {
        out += `  - ${g.type}: Ganho ${formatCurrency(g.grossGain)} | Imposto ${formatCurrency(g.tax)} (${(g.taxRate * 100).toFixed(0)}%)\n`;
      });
      if (m.totalTax > 0) out += `  DARF: ${formatCurrency(m.totalTax)} — Venc: ${new Date(m.darfDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}\n`;
      out += '\n';
    });
    out += `\n═══ RENDIMENTOS ISENTOS (linha 20 - Ganho isento venda ações) ═══\n`;
    out += `  Total isento por vendas ≤ R$20k/mês: ${formatCurrency(rendimentosIsentos.isentosVenda)}\n\n`;
    if (guide) out += `\n═══ ORIENTAÇÕES DA IA ═══\n\n${guide}\n`;

    const blob = new Blob([out], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `declaracao-irpf-${year + 1}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Declaração IRPF {year + 1} — Automatizada
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ano-calendário {year} • {enrichedBens.length} bens • {rendaVariavel.length} meses com movimentação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={generate} disabled={loading}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {guide ? 'Regenerar com IA' : 'Gerar guia IA'}
          </button>
          <button onClick={exportFull}
            className="h-9 px-3 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exportar declaração completa
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-loss bg-loss/5 border border-loss/20 rounded-lg px-3 py-2">⚠️ {error}</p>}

      {/* Bens e Direitos */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Ficha: Bens e Direitos</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">{enrichedBens.length} ativos</span>
        </div>
        {enrichedBens.length === 0 ? (
          <p className="px-5 py-8 text-xs text-center text-muted-foreground">Sem posições ativas em 31/12/{year}. Cadastre operações para popular.</p>
        ) : (
          <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
            {enrichedBens.map(b => (
              <div key={b.ticker + b.broker} className="px-5 py-3 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold font-mono">{b.ticker} <span className="text-[10px] text-muted-foreground font-sans ml-1">({b.type})</span></p>
                    <p className="text-[10px] text-muted-foreground">Grupo {b.grupo} • Cód. {b.codigo} • {b.localizacao} • {b.broker}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono font-semibold">{formatCurrency(b.situacaoAtual)}</p>
                    <p className="text-[10px] text-muted-foreground">31/12/{year - 1}: {formatCurrency(b.situacaoAnterior)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2">
                  <p className="text-[11px] leading-relaxed flex-1">{b.discriminacao}</p>
                  <CopyBtn text={b.discriminacao} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rendimentos Isentos summary */}
      {rendimentosIsentos.isentosVenda > 0 && (
        <div className="rounded-xl border border-gain/30 bg-gain/5 p-5">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-gain" /> Rendimentos Isentos — Linha 20
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Ganho líquido isento em alienações de ações no mercado à vista ≤ R$20.000/mês:
          </p>
          <div className="flex items-center gap-2 bg-card rounded-lg px-3 py-2">
            <span className="text-lg font-mono font-bold text-gain">{formatCurrency(rendimentosIsentos.isentosVenda)}</span>
            <CopyBtn text={rendimentosIsentos.isentosVenda.toFixed(2)} />
          </div>
        </div>
      )}

      {/* AI Guide */}
      {loading && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Contadoria IA analisando sua carteira...</p>
        </div>
      )}

      {guide && !loading && (
        <div className="rounded-xl border border-primary/20 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Guia Personalizado da Contadoria IA
            </p>
            <button onClick={generate} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed
            prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90
            prose-strong:text-foreground prose-code:text-primary prose-h2:text-sm prose-h2:mt-4">
            <ReactMarkdown>{guide}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
