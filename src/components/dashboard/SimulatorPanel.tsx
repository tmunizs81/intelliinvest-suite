import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { Beaker, Loader2, Send, TrendingUp, TrendingDown, Lightbulb } from 'lucide-react';

interface SimImpact {
  ticker: string;
  current_value: number;
  projected_value: number;
  impact_pct: number;
  reasoning: string;
}

interface SimData {
  scenario_name: string;
  summary: string;
  current_total: number;
  projected_total: number;
  impact_pct: number;
  impacts: SimImpact[];
  recommendations: string[];
}

const presetScenarios = [
  'E se o dólar subir 20%?',
  'E se a Selic cair para 10%?',
  'E se o Ibovespa cair 15%?',
  'E se eu vender meu ativo mais concentrado?',
];

export default function SimulatorPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<SimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const simulate = useCallback(async (scenario: string) => {
    if (assets.length === 0 || !scenario.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        avgPrice: a.avgPrice, currentPrice: a.currentPrice,
        change24h: a.change24h, sector: a.sector,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('portfolio-simulator', {
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
        <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
          <Beaker className="h-3.5 w-3.5 text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Simulador "E se?"</h3>
          <p className="text-[10px] text-muted-foreground">Simule cenários na sua carteira</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Input */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && simulate(input)}
            placeholder="Ex: E se o dólar subir 30%?"
            className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-warning/50 placeholder:text-muted-foreground"
            disabled={loading}
          />
          <button onClick={() => simulate(input)} disabled={!input.trim() || loading || assets.length === 0}
            className="h-9 w-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center disabled:opacity-50 hover:bg-warning/20 transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>

        {/* Presets */}
        {!data && !loading && (
          <div className="grid grid-cols-2 gap-2">
            {presetScenarios.map(s => (
              <button key={s} onClick={() => { setInput(s); simulate(s); }}
                className="text-left text-[11px] p-2 rounded-lg border border-border hover:border-warning/30 hover:bg-warning/5 transition-all">
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            <div className="text-center py-3 rounded-xl bg-gradient-to-br from-warning/10 to-transparent">
              <p className="text-xs text-muted-foreground mb-1">{data.scenario_name}</p>
              <div className="flex items-center justify-center gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">Atual</p>
                  <p className="text-sm font-mono font-bold">{formatCurrency(data.current_total)}</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div>
                  <p className="text-[10px] text-muted-foreground">Projetado</p>
                  <p className={`text-sm font-mono font-bold ${data.impact_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {formatCurrency(data.projected_total)}
                  </p>
                </div>
              </div>
              <p className={`text-lg font-bold font-mono mt-1 ${data.impact_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                {data.impact_pct >= 0 ? '+' : ''}{data.impact_pct.toFixed(1)}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{data.summary}</p>
            </div>

            {/* Per-asset impacts */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Impacto por ativo</p>
              {data.impacts.map((imp, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-muted/30">
                  {imp.impact_pct >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-gain shrink-0" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-loss shrink-0" />
                  )}
                  <span className="font-mono font-bold w-16">{imp.ticker}</span>
                  <span className={`font-mono w-12 text-right ${imp.impact_pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {imp.impact_pct >= 0 ? '+' : ''}{imp.impact_pct.toFixed(1)}%
                  </span>
                  <span className="text-muted-foreground truncate flex-1">{imp.reasoning}</span>
                </div>
              ))}
            </div>

            {data.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Recomendações
                </p>
                {data.recommendations.map((rec, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground pl-2 border-l-2 border-warning/30">{rec}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
