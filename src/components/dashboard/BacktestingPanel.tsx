import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { History, Loader2, Send, TrendingDown, TrendingUp, Lightbulb, Clock } from 'lucide-react';

interface AssetImpact {
  ticker: string;
  return_pct: number;
  worst_drawdown_pct: number;
}

interface TimelinePoint {
  label: string;
  value_pct: number;
}

interface BacktestData {
  scenario_name: string;
  period: string;
  initial_value: number;
  lowest_value: number;
  final_value: number;
  max_drawdown_pct: number;
  total_return_pct: number;
  recovery_days: number;
  timeline: TimelinePoint[];
  asset_impacts: AssetImpact[];
  lessons: string[];
  summary: string;
}

const presetScenarios = [
  'Crise Covid-19 (Mar/2020)',
  'Crise 2008 (Set-Dez/2008)',
  'Bull Market 2016-2019',
  'Joesley Day (Mai/2017)',
  'Impeachment Dilma (2015-2016)',
];

export default function BacktestingPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const run = useCallback(async (scenario: string) => {
    if (assets.length === 0 || !scenario.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('backtesting', {
        body: { portfolio, scenario },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center">
          <History className="h-3.5 w-3.5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Backtesting</h3>
          <p className="text-[10px] text-muted-foreground">Simule cenários históricos</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && run(input)}
            placeholder="Ex: Crise Covid-19"
            className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-destructive/50 placeholder:text-muted-foreground"
            disabled={loading}
          />
          <button onClick={() => run(input)} disabled={!input.trim() || loading || assets.length === 0}
            className="h-9 w-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center disabled:opacity-50 hover:bg-destructive/20 transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {!data && !loading && (
          <div className="grid grid-cols-1 gap-2">
            {presetScenarios.map(s => (
              <button key={s} onClick={() => { setInput(s); run(s); }}
                className="text-left text-[11px] p-2 rounded-lg border border-border hover:border-destructive/30 hover:bg-destructive/5 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            <div className="text-center py-3 rounded-xl bg-gradient-to-br from-destructive/10 to-transparent">
              <p className="text-xs font-medium">{data.scenario_name}</p>
              <p className="text-[10px] text-muted-foreground">{data.period}</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div>
                  <p className="text-[9px] text-muted-foreground">Drawdown Máx</p>
                  <p className="text-sm font-mono font-bold text-loss">{data.max_drawdown_pct.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Retorno Total</p>
                  <p className={`text-sm font-mono font-bold ${data.total_return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {data.total_return_pct >= 0 ? '+' : ''}{data.total_return_pct.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-muted-foreground">Recuperação</p>
                  <p className="text-sm font-mono font-bold flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />{data.recovery_days}d
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline mini chart */}
            {data.timeline.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Evolução</p>
                <div className="flex items-end gap-0.5 h-16">
                  {data.timeline.map((point, i) => {
                    const min = Math.min(...data.timeline.map(t => t.value_pct));
                    const max = Math.max(...data.timeline.map(t => t.value_pct));
                    const range = max - min || 1;
                    const height = ((point.value_pct - min) / range) * 100;
                    const isNegative = point.value_pct < 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col justify-end" title={`${point.label}: ${point.value_pct.toFixed(1)}%`}>
                        <div
                          className={`rounded-t-sm ${isNegative ? 'bg-loss/60' : 'bg-gain/60'}`}
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[8px] text-muted-foreground">
                  <span>{data.timeline[0]?.label}</span>
                  <span>{data.timeline[data.timeline.length - 1]?.label}</span>
                </div>
              </div>
            )}

            {/* Asset impacts */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Impacto por ativo</p>
              {data.asset_impacts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-muted/30">
                  {a.return_pct >= 0 ? <TrendingUp className="h-3 w-3 text-gain" /> : <TrendingDown className="h-3 w-3 text-loss" />}
                  <span className="font-mono font-bold w-16">{a.ticker}</span>
                  <span className={`font-mono w-14 text-right ${a.return_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {a.return_pct >= 0 ? '+' : ''}{a.return_pct.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground text-[10px]">DD: {a.worst_drawdown_pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>

            {data.lessons.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Lições
                </p>
                {data.lessons.map((l, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-destructive/30">{l}</p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground italic">{data.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
