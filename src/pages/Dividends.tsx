import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, DollarSign, Calendar, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, Building2, BarChart3, Clock,
  ArrowRight, Wallet, PieChart, History, Target, Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell, PieChart as RechartsPie, Pie,
} from 'recharts';

interface DividendEvent {
  date: string;
  paymentDate: string | null;
  exDate: string | null;
  amount: number;
  ticker: string;
  label: string;
  totalAmount?: number;
  name?: string;
  type?: string;
}

interface YearlyStat {
  year: string;
  totalPerShare: number;
  totalReceived: number;
  paymentCount: number;
  events: DividendEvent[];
}

interface AssetDividend {
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  currentPrice: number;
  history: DividendEvent[];
  projected: DividendEvent[];
  yearlyStats: YearlyStat[];
  totalPerShare12m: number;
  annualIncome: number;
  yieldPct: number;
  nextPayment: DividendEvent | null;
  lastPayment: DividendEvent | null;
  consistency: number;
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
  totalReceivedAllTime: number;
  assetsWithDividends: number;
  yieldOnCost: number;
}

const monthNames = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

const monthNamesFull = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-emerald-500/10 text-emerald-400',
  'ETF': 'bg-amber-500/10 text-amber-400',
};

export default function Dividends() {
  const { assets, holdings, loading: portfolioLoading } = usePortfolio();
  const [assetDividends, setAssetDividends] = useState<AssetDividend[]>([]);
  const [calendar, setCalendar] = useState<CalendarMonth[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [summary, setSummary] = useState<DividendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'calendar' | 'assets' | 'history'>('overview');
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  const fetchDividends = useCallback(async () => {
    if (assets.length === 0 || assets.every(a => a.currentPrice === 0)) return;

    setLoading(true);
    setError(null);

    try {
      const holdingsData = assets.map(a => {
        const h = holdings.find(hh => hh.ticker === a.ticker);
        return {
          ticker: a.ticker,
          name: a.name,
          type: a.type,
          quantity: a.quantity,
          currentPrice: a.currentPrice,
          avg_price: h?.avg_price || a.avgPrice,
        };
      });

      const { data, error: fnError } = await supabase.functions.invoke('dividends', {
        body: { holdings: holdingsData },
      });

      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);

      setAssetDividends(data.assets || []);
      setCalendar(data.calendar || []);
      setUpcoming(data.upcoming || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Dividends fetch error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar dividendos');
    } finally {
      setLoading(false);
    }
  }, [assets, holdings]);

  useEffect(() => {
    if (!portfolioLoading && assets.length > 0) {
      fetchDividends();
    }
  }, [portfolioLoading, assets.length > 0]);

  // ─── Computed data ───
  const allHistory = useMemo(() =>
    assetDividends
      .flatMap(a => a.history.map(h => ({
        ...h,
        name: a.name,
        type: a.type,
        quantity: a.quantity,
        totalAmount: Math.round(h.amount * a.quantity * 100) / 100,
      })))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [assetDividends]
  );

  const yearlyChartData = useMemo(() => {
    const yearMap: Record<string, number> = {};
    for (const div of allHistory) {
      const year = div.date.substring(0, 4);
      yearMap[year] = (yearMap[year] || 0) + div.totalAmount;
    }
    return Object.entries(yearMap)
      .map(([year, total]) => ({ year, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => a.year.localeCompare(b.year));
  }, [allHistory]);

  const monthlyChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: monthNames[i],
      received: 0,
      projected: 0,
    }));

    for (const div of allHistory) {
      const y = div.date.substring(0, 4);
      if (y === selectedYear) {
        const m = parseInt(div.date.substring(5, 7)) - 1;
        months[m].received += div.totalAmount;
      }
    }

    for (const cm of calendar) {
      const [y, m] = cm.month.split('-');
      if (y === selectedYear) {
        months[parseInt(m) - 1].projected += cm.total;
      }
    }

    return months.map(m => ({
      ...m,
      received: Math.round(m.received * 100) / 100,
      projected: Math.round(m.projected * 100) / 100,
    }));
  }, [allHistory, calendar, selectedYear]);

  const incomeByType = useMemo(() => {
    const typeMap: Record<string, number> = {};
    for (const a of assetDividends) {
      if (a.annualIncome > 0) {
        typeMap[a.type] = (typeMap[a.type] || 0) + a.annualIncome;
      }
    }
    const colors: Record<string, string> = {
      'Ação': 'hsl(var(--primary))',
      'FII': '#10b981',
      'ETF': '#f59e0b',
    };
    return Object.entries(typeMap).map(([type, value]) => ({
      name: type, value: Math.round(value * 100) / 100, fill: colors[type] || '#6b7280',
    }));
  }, [assetDividends]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(String(new Date().getFullYear()));
    for (const d of allHistory) years.add(d.date.substring(0, 4));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allHistory]);

  if (portfolioLoading || (loading && assetDividends.length === 0)) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dividendos & Proventos</h1>
        <div className="flex items-center justify-center h-64 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Carregando dados de dividendos...</span>
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dividendos & Proventos</h1>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
          <DollarSign className="h-12 w-12 opacity-30" />
          <p>Adicione ativos em "Meus Ativos" para ver seus dividendos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dividendos & Proventos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico de 5 anos, projeções e calendário
          </p>
        </div>
        <button
          onClick={fetchDividends}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent/50 transition-all self-start"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
          ⚠️ {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="rounded-lg border border-border bg-card p-5 glow-primary col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Renda Anual</span>
              <Wallet className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-bold font-mono text-gain">{formatCurrency(summary.totalAnnualIncome)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Média Mensal</span>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold font-mono">{formatCurrency(summary.monthlyAverage)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Projetado 12m</span>
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold font-mono text-primary">{formatCurrency(summary.totalProjected12m)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Recebido</span>
              <History className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold font-mono">{formatCurrency(summary.totalReceivedAllTime)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Yield on Cost</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold font-mono text-gain">{formatPercent(summary.yieldOnCost)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Ativos Pagantes</span>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-xl font-bold font-mono">{summary.assetsWithDividends}</p>
          </div>
        </div>
      )}

      {/* Upcoming Payments */}
      {upcoming.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Próximos Pagamentos (60 dias)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.slice(0, 6).map((ev: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono font-semibold text-sm">{ev.ticker}</p>
                    <p className="text-[10px] text-muted-foreground">{ev.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-gain text-sm">{formatCurrency(ev.totalAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(ev.paymentDate || ev.date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
        {([
          { key: 'overview' as const, label: 'Visão Geral', icon: PieChart },
          { key: 'calendar' as const, label: 'Calendário', icon: Calendar },
          { key: 'assets' as const, label: 'Por Ativo', icon: Building2 },
          { key: 'history' as const, label: 'Histórico', icon: BarChart3 },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap min-w-fit ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW TAB ─── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Monthly Chart */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Dividendos por Mês</h3>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="text-xs bg-muted border border-border rounded-md px-2 py-1"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'received' ? 'Recebido' : 'Projetado',
                  ]}
                />
                <Bar dataKey="received" fill="#10b981" radius={[4, 4, 0, 0]} name="received" />
                <Bar dataKey="projected" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.5} name="projected" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Yearly Evolution */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Evolução Anual</h3>
              {yearlyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={yearlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [formatCurrency(value), 'Total Recebido']}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">Sem dados históricos</p>
              )}
            </div>

            {/* Income by Type */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Renda por Tipo de Ativo</h3>
              {incomeByType.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={220}>
                    <RechartsPie>
                      <Pie
                        data={incomeByType}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {incomeByType.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [formatCurrency(value)]}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {incomeByType.map(t => (
                      <div key={t.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.fill }} />
                          <span className="text-sm">{t.name}</span>
                        </div>
                        <span className="font-mono text-sm font-medium">{formatCurrency(t.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">Sem dados</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CALENDAR TAB ─── */}
      {tab === 'calendar' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {calendar.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum dividendo projetado encontrado</p>
            </div>
          ) : (
            calendar.map(month => {
              const isExpanded = expandedMonth === month.month;
              const [year, m] = month.month.split('-');
              const isCurrentMonth = new Date().getFullYear() === parseInt(year) &&
                (new Date().getMonth() + 1) === parseInt(m);

              return (
                <div key={month.month} className={`border-b border-border/50 ${isCurrentMonth ? 'bg-primary/5' : ''}`}>
                  <button
                    onClick={() => setExpandedMonth(isExpanded ? null : month.month)}
                    className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{monthNamesFull[parseInt(m) - 1]} {year}</p>
                        <p className="text-xs text-muted-foreground">{month.events.length} pagamento(s) previstos</p>
                      </div>
                      {isCurrentMonth && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                          Mês atual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-mono font-bold text-gain">{formatCurrency(month.total)}</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-2">
                      {month.events.map((ev, i) => (
                        <div key={i} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 border border-border/30">
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadgeClass[ev.type] || 'bg-secondary text-secondary-foreground'}`}>
                              {ev.type}
                            </span>
                            <div>
                              <span className="font-mono font-semibold">{ev.ticker}</span>
                              <p className="text-xs text-muted-foreground">{ev.name}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-bold text-gain">{formatCurrency(ev.totalAmount)}</p>
                            <p className="text-[10px] text-muted-foreground">R${ev.amount.toFixed(4)}/cota</p>
                            {ev.paymentDate && (
                              <p className="text-[10px] text-muted-foreground">
                                Pgto: {new Date(ev.paymentDate).toLocaleDateString('pt-BR')}
                              </p>
                            )}
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

      {/* ─── ASSETS TAB ─── */}
      {tab === 'assets' && (
        <div className="space-y-4">
          {assetDividends.filter(a => a.history.length > 0 || a.projected.length > 0).length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum ativo com dividendos encontrado</p>
            </div>
          ) : (
            assetDividends
              .filter(a => a.annualIncome > 0 || a.history.length > 0)
              .sort((a, b) => b.annualIncome - a.annualIncome)
              .map(asset => {
                const isExpanded = expandedAsset === asset.ticker;
                return (
                  <div key={asset.ticker} className="rounded-lg border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedAsset(isExpanded ? null : asset.ticker)}
                      className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <span className="font-mono text-xs font-bold">{asset.ticker.substring(0, 4)}</span>
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{asset.ticker}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                              {asset.type}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{asset.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">DY 12m</p>
                          <p className="font-mono font-bold text-gain">{formatPercent(asset.yieldPct)}</p>
                        </div>
                        <div className="hidden sm:block">
                          <p className="text-xs text-muted-foreground">YoC</p>
                          <p className="font-mono font-bold text-primary">
                            {(() => {
                              const h = holdings.find(hh => hh.ticker === asset.ticker);
                              const avgP = h?.avg_price || 0;
                              const yoc = avgP > 0 ? (asset.totalPerShare12m / avgP * 100) : 0;
                              return formatPercent(yoc);
                            })()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Renda Anual</p>
                          <p className="font-mono font-bold">{formatCurrency(asset.annualIncome)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Consistência</p>
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${asset.consistency}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-mono">{asset.consistency}%</span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border p-4 space-y-4">
                        {/* Asset info cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase">R$/cota 12m</p>
                            <p className="font-mono font-bold">R${asset.totalPerShare12m.toFixed(2)}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase">Qtd Cotas</p>
                            <p className="font-mono font-bold">{asset.quantity}</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase">Último Pgto</p>
                            <p className="font-mono font-bold text-sm">
                              {asset.lastPayment ? new Date(asset.lastPayment.date).toLocaleDateString('pt-BR') : '—'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3">
                            <p className="text-[10px] text-muted-foreground uppercase">Próximo Pgto</p>
                            <p className="font-mono font-bold text-sm text-primary">
                              {asset.nextPayment ? new Date(asset.nextPayment.paymentDate || asset.nextPayment.date).toLocaleDateString('pt-BR') : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Yearly stats */}
                        {asset.yearlyStats.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Histórico por Ano</h4>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-muted-foreground border-b border-border/50">
                                  <th className="text-left py-2 px-3 text-xs font-medium">Ano</th>
                                  <th className="text-right py-2 px-3 text-xs font-medium">Pagamentos</th>
                                  <th className="text-right py-2 px-3 text-xs font-medium">R$/cota</th>
                                  <th className="text-right py-2 px-3 text-xs font-medium">Total Recebido</th>
                                </tr>
                              </thead>
                              <tbody>
                                {asset.yearlyStats.map(ys => (
                                  <tr key={ys.year} className="border-b border-border/30 hover:bg-accent/20">
                                    <td className="py-2 px-3 font-mono font-medium">{ys.year}</td>
                                    <td className="py-2 px-3 text-right text-muted-foreground">{ys.paymentCount}x</td>
                                    <td className="py-2 px-3 text-right font-mono">R${ys.totalPerShare.toFixed(2)}</td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-gain">{formatCurrency(ys.totalReceived)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {tab === 'history' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {allHistory.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <History className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhum dividendo histórico encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium text-xs">Data</th>
                    <th className="text-left p-3 font-medium text-xs">Ativo</th>
                    <th className="text-left p-3 font-medium text-xs">Tipo</th>
                    <th className="text-left p-3 font-medium text-xs">Evento</th>
                    <th className="text-right p-3 font-medium text-xs">R$/cota</th>
                    <th className="text-right p-3 font-medium text-xs">Qtd</th>
                    <th className="text-right p-3 font-medium text-xs">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allHistory.slice(0, 200).map((div, i) => (
                    <tr key={`${div.ticker}-${div.date}-${i}`} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {new Date(div.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="p-3 font-mono font-semibold">{div.ticker}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadgeClass[div.type || ''] || 'bg-secondary text-secondary-foreground'}`}>
                          {div.type}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{div.label}</td>
                      <td className="text-right p-3 font-mono text-muted-foreground">R${div.amount.toFixed(4)}</td>
                      <td className="text-right p-3 font-mono text-muted-foreground">{div.quantity}</td>
                      <td className="text-right p-3 font-mono font-bold text-gain">{formatCurrency(div.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
