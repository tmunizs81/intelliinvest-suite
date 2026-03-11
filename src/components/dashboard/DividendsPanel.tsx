import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, DollarSign, Calendar, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Building2, BarChart3,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';

interface DividendEvent {
  date: string;
  amount: number;
  ticker: string;
  totalAmount?: number;
  name?: string;
  type?: string;
}

interface AssetDividend {
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  history: DividendEvent[];
  projected: DividendEvent[];
  totalPerShare12m: number;
  annualIncome: number;
  yieldPct: number;
  error?: string;
}

interface CalendarMonth {
  month: string;
  events: (DividendEvent & { totalAmount: number; name: string; type: string })[];
  total: number;
}

interface DividendSummary {
  totalAnnualIncome: number;
  monthlyAverage: number;
  totalProjected12m: number;
  assetsWithDividends: number;
}

interface Props {
  assets: Asset[];
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function DividendsPanel({ assets }: Props) {
  const [assetDividends, setAssetDividends] = useState<AssetDividend[]>([]);
  const [calendar, setCalendar] = useState<CalendarMonth[]>([]);
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'calendar' | 'assets' | 'history'>('calendar');
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const fetchDividends = useCallback(async () => {
    if (assets.length === 0 || assets.every(a => a.currentPrice === 0)) return;

    setLoading(true);
    setError(null);

    try {
      const holdings = assets.map(a => ({
        ticker: a.ticker,
        name: a.name,
        type: a.type,
        quantity: a.quantity,
        currentPrice: a.currentPrice,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('dividends', {
        body: { holdings },
      });

      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);

      setAssetDividends(data.assets || []);
      setCalendar(data.calendar || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Dividends fetch error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar dividendos');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  useEffect(() => {
    fetchDividends();
  }, [fetchDividends]);

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  const typeBadgeClass: Record<string, string> = {
    'Ação': 'bg-primary/10 text-primary',
    'FII': 'bg-ai-accent/10 text-ai-accent-foreground',
    'ETF': 'bg-warning/10 text-warning-foreground',
  };

  // Build history: all past dividends from all assets, sorted by date desc
  const allHistory = assetDividends
    .flatMap(a => a.history.map(h => ({
      ...h,
      name: a.name,
      type: a.type,
      quantity: a.quantity,
      totalAmount: Math.round(h.amount * a.quantity * 100) / 100,
    })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 50);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Dividendos & Proventos</h2>
          </div>
          <button
            onClick={fetchDividends}
            disabled={loading}
            className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Renda Anual</p>
              <p className="text-sm font-mono font-bold text-gain">{formatCurrency(summary.totalAnnualIncome)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Média Mensal</p>
              <p className="text-sm font-mono font-bold">{formatCurrency(summary.monthlyAverage)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projetado 12m</p>
              <p className="text-sm font-mono font-bold text-primary">{formatCurrency(summary.totalProjected12m)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ativos Pagantes</p>
              <p className="text-sm font-mono font-bold">{summary.assetsWithDividends}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([
            { key: 'calendar', label: 'Calendário', icon: Calendar },
            { key: 'assets', label: 'Por Ativo', icon: Building2 },
            { key: 'history', label: 'Histórico', icon: BarChart3 },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 border-b border-loss/20 bg-loss/5 text-xs text-loss-foreground">
          ⚠️ {error}
        </div>
      )}

      {loading && assetDividends.length === 0 ? (
        <div className="p-8 flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Buscando dados de dividendos...</span>
        </div>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          {/* Calendar Tab */}
          {tab === 'calendar' && (
            <div>
              {calendar.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum dividendo projetado encontrado
                </div>
              ) : (
                calendar.map(month => {
                  const isExpanded = expandedMonth === month.month;
                  const [year, m] = month.month.split('-');
                  const isCurrentMonth = new Date().getFullYear() === parseInt(year) && (new Date().getMonth() + 1) === parseInt(m);

                  return (
                    <div key={month.month} className={`border-b border-border/50 ${isCurrentMonth ? 'bg-primary/5' : ''}`}>
                      <button
                        onClick={() => setExpandedMonth(isExpanded ? null : month.month)}
                        className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium">{formatMonth(month.month)}</p>
                            <p className="text-xs text-muted-foreground">{month.events.length} pagamento(s)</p>
                          </div>
                          {isCurrentMonth && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                              Mês atual
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold text-gain">{formatCurrency(month.total)}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-2">
                          {month.events.map((ev, i) => (
                            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30 text-sm">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[ev.type] || 'bg-secondary text-secondary-foreground'}`}>
                                  {ev.type}
                                </span>
                                <span className="font-mono font-medium">{ev.ticker}</span>
                                <span className="text-xs text-muted-foreground">{ev.name}</span>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-medium text-gain">{formatCurrency(ev.totalAmount)}</p>
                                <p className="text-[10px] text-muted-foreground">R${ev.amount.toFixed(2)}/cota</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Assets Tab */}
          {tab === 'assets' && (
            <div>
              {assetDividends.filter(a => a.history.length > 0 || a.projected.length > 0).length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum ativo com dividendos encontrado
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium text-xs">Ativo</th>
                      <th className="text-left p-3 font-medium text-xs">Tipo</th>
                      <th className="text-right p-3 font-medium text-xs">DY 12m</th>
                      <th className="text-right p-3 font-medium text-xs">R$/cota 12m</th>
                      <th className="text-right p-3 font-medium text-xs">Renda Anual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetDividends
                      .filter(a => a.annualIncome > 0)
                      .sort((a, b) => b.annualIncome - a.annualIncome)
                      .map(asset => (
                        <tr key={asset.ticker} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                          <td className="p-3">
                            <span className="font-mono font-semibold">{asset.ticker}</span>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{asset.name}</p>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[asset.type] || 'bg-secondary text-secondary-foreground'}`}>
                              {asset.type}
                            </span>
                          </td>
                          <td className="text-right p-3">
                            <span className="font-mono text-gain font-medium">
                              {formatPercent(asset.yieldPct)}
                            </span>
                          </td>
                          <td className="text-right p-3 font-mono text-muted-foreground">
                            R${asset.totalPerShare12m.toFixed(2)}
                          </td>
                          <td className="text-right p-3">
                            <span className="font-mono font-bold text-gain">
                              {formatCurrency(asset.annualIncome)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <div>
              {allHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum dividendo histórico encontrado
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium text-xs">Data</th>
                      <th className="text-left p-3 font-medium text-xs">Ativo</th>
                      <th className="text-right p-3 font-medium text-xs">R$/cota</th>
                      <th className="text-right p-3 font-medium text-xs">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allHistory.map((div, i) => (
                      <tr key={`${div.ticker}-${div.date}-${i}`} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="p-3 text-muted-foreground">
                          {new Date(div.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[div.type] || 'bg-secondary text-secondary-foreground'}`}>
                              {div.type}
                            </span>
                            <span className="font-mono font-medium">{div.ticker}</span>
                          </div>
                        </td>
                        <td className="text-right p-3 font-mono text-muted-foreground">
                          R${div.amount.toFixed(4)}
                        </td>
                        <td className="text-right p-3 font-mono font-medium text-gain">
                          {formatCurrency(div.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
