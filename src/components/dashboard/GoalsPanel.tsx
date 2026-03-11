import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { Target, Loader2, Sparkles, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface GoalAllocation {
  category: string;
  pct: number;
  reason: string;
}

interface Milestone {
  year: number;
  projected_value: number;
}

interface GoalData {
  monthly_needed: number;
  required_return_pct: number;
  probability_pct: number;
  years_to_goal: number;
  projected_total: number;
  summary: string;
  suggested_allocation: GoalAllocation[];
  milestones: Milestone[];
}

const COLORS = [
  'hsl(160, 84%, 39%)', 'hsl(200, 80%, 50%)', 'hsl(38, 92%, 50%)',
  'hsl(280, 60%, 55%)', 'hsl(340, 75%, 55%)', 'hsl(160, 50%, 55%)',
];

export default function GoalsPanel({ assets }: { assets: Asset[] }) {
  const [data, setData] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalAmount, setGoalAmount] = useState('1000000');
  const [goalYears, setGoalYears] = useState('10');

  const calculate = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const portfolio = assets.map(a => ({
        ticker: a.ticker, type: a.type, quantity: a.quantity,
        currentPrice: a.currentPrice,
      }));
      const { data: result, error: fnError } = await supabase.functions.invoke('investment-goals', {
        body: { portfolio, goal_amount: Number(goalAmount), goal_years: Number(goalYears) },
      });
      if (fnError) throw new Error(fnError.message);
      if (result.error) throw new Error(result.error);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets, goalAmount, goalYears]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Target className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Metas de Investimento</h3>
          <p className="text-[10px] text-muted-foreground">Planejamento com IA</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Goal inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Meta (R$)</label>
            <input
              value={goalAmount}
              onChange={e => setGoalAmount(e.target.value.replace(/\D/g, ''))}
              className="w-full mt-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="1000000"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Prazo (anos)</label>
            <input
              value={goalYears}
              onChange={e => setGoalYears(e.target.value.replace(/\D/g, ''))}
              className="w-full mt-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="10"
            />
          </div>
        </div>

        <button
          onClick={calculate}
          disabled={loading || assets.length === 0 || !goalAmount || !goalYears}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Calculando...' : 'Calcular com IA'}
        </button>

        {error && <p className="text-xs text-loss">⚠️ {error}</p>}

        {data && !loading && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-xl bg-gradient-to-br from-primary/10 to-transparent p-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">{data.summary}</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">Aporte Mensal</p>
                  <p className="text-sm font-mono font-bold text-primary">{formatCurrency(data.monthly_needed)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Retorno Necessário</p>
                  <p className="text-sm font-mono font-bold">{data.required_return_pct.toFixed(1)}% a.a.</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Probabilidade</p>
                  <p className={`text-sm font-mono font-bold ${data.probability_pct >= 70 ? 'text-gain' : data.probability_pct >= 40 ? 'text-warning' : 'text-loss'}`}>
                    {data.probability_pct}%
                  </p>
                </div>
              </div>
            </div>

            {/* Milestones Chart */}
            {data.milestones.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Projeção</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.milestones}>
                      <XAxis dataKey="year" tick={{ fontSize: 10 }} stroke="hsl(215, 12%, 50%)" />
                      <YAxis tick={{ fontSize: 9 }} stroke="hsl(215, 12%, 50%)"
                        tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        labelFormatter={(l) => `Ano ${l}`}
                        contentStyle={{ background: 'hsl(220,18%,9%)', border: '1px solid hsl(220,14%,16%)', borderRadius: '8px', fontSize: '11px' }}
                      />
                      <Bar dataKey="projected_value" radius={[4, 4, 0, 0]}>
                        {data.milestones.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Suggested Allocation */}
            {data.suggested_allocation.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Alocação Sugerida</p>
                {data.suggested_allocation.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[11px] font-medium flex-1">{item.category}</span>
                    <span className="text-[11px] font-mono font-bold">{item.pct}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
