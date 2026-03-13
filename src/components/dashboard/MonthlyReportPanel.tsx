import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import {
  FileText, Loader2, Sparkles, Download, TrendingUp, TrendingDown,
  AlertTriangle, Lightbulb, BarChart3, Eye,
} from 'lucide-react';

interface Performer {
  ticker: string;
  return_pct: number;
  comment: string;
}

interface ReportData {
  title: string;
  period: string;
  executive_summary: string;
  total_value: number;
  total_return_pct: number;
  monthly_return_pct: number;
  top_performers: Performer[];
  worst_performers: Performer[];
  dividends_analysis: string;
  risk_assessment: string;
  recommendations: string[];
  outlook: string;
}

export default function MonthlyReportPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, name: a.name, type: a.type,
        quantity: a.quantity, avgPrice: a.avgPrice,
        currentPrice: a.currentPrice, change24h: a.change24h,
        allocation: a.allocation, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('monthly-report', {
        body: { portfolio },
      });
      if (fnError) {
        // Extract meaningful error from response
        const msg = fnError.message || '';
        if (msg.includes('non-2xx')) {
          throw new Error('Falha temporária ao gerar relatório. Tente novamente.');
        }
        try {
          const errBody = JSON.parse(msg);
          throw new Error(errBody.error || msg);
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) {
            throw new Error(msg || 'Erro ao gerar relatório');
          }
          throw parseErr;
        }
      }
      if (result?.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  const downloadAsPDF = () => {
    if (!data) return;
    // Generate printable HTML and trigger print dialog for PDF
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${data.title}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a2e; }
  h1 { color: #0d9a6f; border-bottom: 3px solid #0d9a6f; padding-bottom: 10px; }
  h2 { color: #2a2a4a; margin-top: 30px; }
  .summary-box { background: #f0fdf4; border-left: 4px solid #0d9a6f; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
  .metric { display: inline-block; margin: 10px 30px 10px 0; }
  .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
  .metric-value { font-size: 24px; font-weight: bold; }
  .positive { color: #0d9a6f; }
  .negative { color: #e63946; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th, td { text-align: left; padding: 10px; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 600; }
  .rec { background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 10px; margin: 8px 0; border-radius: 0 6px 6px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
</style></head><body>
<h1>📊 ${data.title}</h1>
<p style="color:#666">${data.period}</p>
<div class="summary-box"><p>${data.executive_summary}</p></div>
<div>
  <div class="metric"><div class="metric-label">Patrimônio</div><div class="metric-value">R$ ${data.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
  <div class="metric"><div class="metric-label">Retorno Total</div><div class="metric-value ${data.total_return_pct >= 0 ? 'positive' : 'negative'}">${data.total_return_pct.toFixed(2)}%</div></div>
  <div class="metric"><div class="metric-label">Retorno Mensal</div><div class="metric-value ${data.monthly_return_pct >= 0 ? 'positive' : 'negative'}">${data.monthly_return_pct.toFixed(2)}%</div></div>
</div>
<h2>🏆 Melhores Desempenhos</h2>
<table><tr><th>Ativo</th><th>Retorno</th><th>Análise</th></tr>
${data.top_performers.map(p => `<tr><td><strong>${p.ticker}</strong></td><td class="positive">${p.return_pct.toFixed(2)}%</td><td>${p.comment}</td></tr>`).join('')}
</table>
<h2>📉 Piores Desempenhos</h2>
<table><tr><th>Ativo</th><th>Retorno</th><th>Análise</th></tr>
${data.worst_performers.map(p => `<tr><td><strong>${p.ticker}</strong></td><td class="negative">${p.return_pct.toFixed(2)}%</td><td>${p.comment}</td></tr>`).join('')}
</table>
<h2>💰 Dividendos</h2><p>${data.dividends_analysis}</p>
<h2>⚠️ Avaliação de Risco</h2><p>${data.risk_assessment}</p>
<h2>💡 Recomendações</h2>
${data.recommendations.map(r => `<div class="rec">${r}</div>`).join('')}
<h2>🔮 Perspectivas</h2><p>${data.outlook}</p>
<div class="footer">Relatório gerado por T2-Simplynvest IA • ${new Date().toLocaleDateString('pt-BR')}</div>
</body></html>`;
    
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Relatório Mensal IA</h3>
            <p className="text-[10px] text-muted-foreground">Análise completa com IA</p>
          </div>
        </div>
        {data && (
          <button onClick={downloadAsPDF}
            className="h-7 px-2 rounded-md border border-border flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-all">
            <Download className="h-3 w-3" /> PDF
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!data && !loading && !error && (
          <button onClick={generate} disabled={assets.length === 0}
            className="w-full py-8 flex flex-col items-center gap-3 text-muted-foreground hover:text-primary transition-all">
            <FileText className="h-10 w-10" />
            <span className="text-sm font-medium">Gerar Relatório Mensal</span>
            <span className="text-[11px]">Análise completa da sua carteira com IA</span>
          </button>
        )}

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Gerando relatório...</p>
            <p className="text-[10px] text-muted-foreground">Isso pode levar alguns segundos</p>
          </div>
        )}

        {error && (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-loss">⚠️ {error}</p>
            {error.includes('Créditos') && (
              <p className="text-[10px] text-muted-foreground">Os créditos de IA estão esgotados. Aguarde a renovação ou entre em contato com o suporte.</p>
            )}
            <button onClick={generate} className="text-[10px] text-primary hover:underline">Tentar novamente</button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Header */}
            <div className="text-center pb-3 border-b border-border">
              <h2 className="text-lg font-bold">{data.title}</h2>
              <p className="text-xs text-muted-foreground">{data.period}</p>
            </div>

            {/* Executive Summary */}
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
              <p className="text-xs leading-relaxed">{data.executive_summary}</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Patrimônio</p>
                <p className="text-sm font-bold font-mono">{formatCurrency(data.total_value)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Retorno Total</p>
                <p className={`text-sm font-bold font-mono ${data.total_return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {formatPercent(data.total_return_pct)}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">Retorno Mensal</p>
                <p className={`text-sm font-bold font-mono ${data.monthly_return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {formatPercent(data.monthly_return_pct)}
                </p>
              </div>
            </div>

            {/* Top/Worst Performers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-2">
                  <TrendingUp className="h-3 w-3 text-gain" /> Melhores
                </p>
                {data.top_performers.map((p, i) => (
                  <div key={i} className="mb-2 p-2 rounded bg-gain/5 border border-gain/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold">{p.ticker}</span>
                      <span className="text-xs font-mono text-gain">{formatPercent(p.return_pct)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.comment}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-2">
                  <TrendingDown className="h-3 w-3 text-loss" /> Piores
                </p>
                {data.worst_performers.map((p, i) => (
                  <div key={i} className="mb-2 p-2 rounded bg-loss/5 border border-loss/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold">{p.ticker}</span>
                      <span className="text-xs font-mono text-loss">{formatPercent(p.return_pct)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.comment}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Dividends */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">💰 Dividendos</p>
              <p className="text-[11px] text-muted-foreground">{data.dividends_analysis}</p>
            </div>

            {/* Risk */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-1">
                <AlertTriangle className="h-3 w-3" /> Risco
              </p>
              <p className="text-[11px] text-muted-foreground">{data.risk_assessment}</p>
            </div>

            {/* Recommendations */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-2">
                <Lightbulb className="h-3 w-3" /> Recomendações
              </p>
              {data.recommendations.map((rec, i) => (
                <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-primary/30 mb-1.5">{rec}</p>
              ))}
            </div>

            {/* Outlook */}
            <div className="rounded-lg bg-muted/50 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1 mb-1">
                <Eye className="h-3 w-3" /> Perspectivas
              </p>
              <p className="text-[11px]">{data.outlook}</p>
            </div>

            <p className="text-[9px] text-muted-foreground text-center">
              Gerado por T2-Simplynvest IA • {new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
