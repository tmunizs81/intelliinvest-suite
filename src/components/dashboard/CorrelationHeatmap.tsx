import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { Grid3X3, Loader2, RefreshCw, Sparkles, AlertTriangle, Lightbulb } from 'lucide-react';

interface AICorrelation {
  risk_score: number;
  high_correlation_pairs: { pair: string; estimated_correlation: number; reason: string }[];
  hidden_risks: { risk: string; severity: string; affected_tickers: string[] }[];
  diversification_suggestions: string[];
  summary: string;
}

// Simple correlation estimation based on asset type and sector
function estimateCorrelation(a: Asset, b: Asset): number {
  if (a.ticker === b.ticker) return 1;
  
  let corr = 0.2; // base
  
  // Same type increases correlation
  if (a.type === b.type) corr += 0.3;
  
  // Same sector increases correlation more
  if (a.sector && b.sector && a.sector === b.sector) corr += 0.25;
  
  // Both Brazilian stocks
  if (a.type === 'Ação' && b.type === 'Ação') corr += 0.15;
  
  // Crypto vs traditional is usually lower
  if ((a.type === 'Cripto') !== (b.type === 'Cripto')) corr -= 0.2;
  
  // International vs domestic
  if ((a.type === 'ETF Internacional') !== (b.type === 'ETF Internacional')) corr -= 0.15;
  
  // Renda Fixa vs equity
  if ((a.type === 'Renda Fixa') !== (b.type === 'Renda Fixa')) corr -= 0.25;
  
  // Add some variance from daily change similarity
  const changeDiff = Math.abs(a.change24h - b.change24h);
  if (changeDiff < 0.5) corr += 0.1;
  else if (changeDiff > 3) corr -= 0.1;
  
  return Math.max(-0.5, Math.min(1, corr));
}

function getCellColor(corr: number): string {
  if (corr >= 0.8) return 'bg-loss/80';
  if (corr >= 0.6) return 'bg-loss/50';
  if (corr >= 0.4) return 'bg-warning/50';
  if (corr >= 0.2) return 'bg-warning/30';
  if (corr >= 0) return 'bg-muted/50';
  if (corr >= -0.2) return 'bg-primary/20';
  return 'bg-primary/40';
}

export default function CorrelationHeatmap({ assets }: { assets: Asset[] }) {
  const [showAll, setShowAll] = useState(false);
  const [aiData, setAiData] = useState<AICorrelation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const displayAssets = showAll ? assets : assets.slice(0, 8);

  const analyzeWithAI = useCallback(async () => {
    if (assets.length < 2) return;
    setAiLoading(true);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, sector: a.sector,
        quantity: a.quantity, currentPrice: a.currentPrice, allocation: a.allocation,
      }));
      const { data, error } = await supabase.functions.invoke('ai-correlation', { body: { portfolio } });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      setAiData(data);
      setShowAI(true);
    } catch {
    } finally {
      setAiLoading(false);
    }
  }, [assets]);

  const matrix = useMemo(() => {
    return displayAssets.map(a =>
      displayAssets.map(b => estimateCorrelation(a, b))
    );
  }, [displayAssets]);

  if (assets.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">Necessário pelo menos 2 ativos</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Grid3X3 className="h-3.5 w-3.5 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Correlação entre Ativos</h3>
            <p className="text-[10px] text-muted-foreground">Estimativa baseada em tipo e setor</p>
          </div>
        </div>
        {assets.length > 8 && (
          <button onClick={() => setShowAll(!showAll)}
            className="text-[10px] text-primary hover:underline">
            {showAll ? 'Mostrar menos' : `Todos (${assets.length})`}
          </button>
        )}
      </div>

      <div className="p-4 overflow-x-auto">
        <div className="min-w-fit">
          {/* Header row */}
          <div className="flex items-end mb-1" style={{ marginLeft: '60px' }}>
            {displayAssets.map((a, i) => (
              <div key={i} className="w-10 text-center">
                <span className="text-[8px] font-mono text-muted-foreground writing-mode-vertical"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', display: 'inline-block', height: '50px' }}>
                  {a.ticker}
                </span>
              </div>
            ))}
          </div>
          
          {/* Matrix rows */}
          {displayAssets.map((a, i) => (
            <div key={i} className="flex items-center gap-0">
              <span className="text-[9px] font-mono text-muted-foreground w-[60px] text-right pr-2 shrink-0 truncate">
                {a.ticker}
              </span>
              {matrix[i].map((corr, j) => (
                <div
                  key={j}
                  className={`w-10 h-8 flex items-center justify-center ${getCellColor(corr)} border border-background/50 transition-all hover:ring-1 hover:ring-primary/50`}
                  title={`${displayAssets[i].ticker} × ${displayAssets[j].ticker}: ${corr.toFixed(2)}`}
                >
                  <span className="text-[8px] font-mono font-medium">
                    {i === j ? '1.0' : corr.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-2 mt-3">
          <span className="text-[9px] text-muted-foreground">Baixa</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-3 rounded-sm bg-primary/40" />
            <div className="w-4 h-3 rounded-sm bg-primary/20" />
            <div className="w-4 h-3 rounded-sm bg-muted/50" />
            <div className="w-4 h-3 rounded-sm bg-warning/30" />
            <div className="w-4 h-3 rounded-sm bg-warning/50" />
            <div className="w-4 h-3 rounded-sm bg-loss/50" />
            <div className="w-4 h-3 rounded-sm bg-loss/80" />
          </div>
          <span className="text-[9px] text-muted-foreground">Alta</span>
        </div>

        {/* AI Analysis Button */}
        <div className="mt-3 border-t border-border pt-3">
          {!showAI ? (
            <button onClick={analyzeWithAI} disabled={aiLoading || assets.length < 2}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 text-primary text-[11px] font-medium hover:bg-primary/5 transition-all disabled:opacity-50">
              {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {aiLoading ? 'Analisando riscos ocultos...' : 'Análise IA de Riscos Ocultos'}
            </button>
          ) : aiData && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" /> Análise IA
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  aiData.risk_score >= 7 ? 'bg-loss/10 text-loss' : aiData.risk_score >= 4 ? 'bg-warning/10 text-warning-foreground' : 'bg-gain/10 text-gain'
                }`}>
                  Risco: {aiData.risk_score}/10
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">{aiData.summary}</p>

              {aiData.hidden_risks.length > 0 && (
                <div className="space-y-1">
                  {aiData.hidden_risks.slice(0, 3).map((r, i) => (
                    <div key={i} className={`flex items-start gap-1.5 text-[10px] p-1.5 rounded ${
                      r.severity === 'high' ? 'bg-loss/5' : r.severity === 'medium' ? 'bg-warning/5' : 'bg-muted/30'
                    }`}>
                      <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${
                        r.severity === 'high' ? 'text-loss' : 'text-warning-foreground'
                      }`} />
                      <div>
                        <p className="font-medium">{r.risk}</p>
                        <p className="text-muted-foreground">{r.affected_tickers.join(', ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {aiData.diversification_suggestions.length > 0 && (
                <div className="space-y-0.5">
                  {aiData.diversification_suggestions.slice(0, 2).map((s, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                      <Lightbulb className="h-3 w-3 text-primary shrink-0 mt-0.5" /> {s}
                    </p>
                  ))}
                </div>
              )}
              <button onClick={() => setShowAI(false)} className="text-[9px] text-muted-foreground hover:text-foreground">
                Fechar análise
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

