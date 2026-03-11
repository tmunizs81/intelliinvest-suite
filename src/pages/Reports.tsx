import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FileText, Download, TrendingUp, TrendingDown, DollarSign, PieChart,
  BarChart3, Calendar, Filter, Loader2, Printer, ArrowUpRight, ArrowDownRight, FileSpreadsheet,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import { exportPortfolioCSV, exportTransactionsCSV } from '@/lib/exportUtils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, LineChart, Line, CartesianGrid,
  Area, AreaChart,
} from 'recharts';

const COLORS = [
  'hsl(160, 84%, 39%)', 'hsl(270, 70%, 60%)', 'hsl(38, 92%, 50%)',
  'hsl(200, 70%, 50%)', 'hsl(340, 70%, 55%)', 'hsl(120, 50%, 45%)',
  'hsl(30, 80%, 55%)', 'hsl(180, 60%, 45%)',
];

type ReportTab = 'overview' | 'performance' | 'allocation' | 'brokers' | 'transactions';

const PERIODS = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '1y', label: '1A', months: 12 },
  { id: 'all', label: 'Total', months: 0 },
];

function getPeriodDate(months: number): Date | null {
  if (months === 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

interface Transaction {
  id: string;
  ticker: string;
  name: string;
  type: string;
  operation: string;
  quantity: number;
  price: number;
  total: number;
  fees: number;
  date: string;
  is_daytrade: boolean;
  notes: string | null;
}

export default function Reports() {
  const { assets, holdings } = usePortfolio();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [period, setPeriod] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const periodConfig = PERIODS.find(p => p.id === period) || PERIODS[4];
  const periodDate = getPeriodDate(periodConfig.months);

  // Load transactions
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingTx(true);
      let query = supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false });
      if (periodDate) {
        query = query.gte('date', periodDate.toISOString().split('T')[0]);
      }
      const { data } = await query;
      setTransactions((data as Transaction[]) || []);
      setLoadingTx(false);
    };
    load();
  }, [user, period]);

  // Filter transactions by period
  const filteredTransactions = useMemo(() => {
    if (!periodDate) return transactions;
    return transactions.filter(t => new Date(t.date) >= periodDate);
  }, [transactions, periodDate]);

  const txSummary = useMemo(() => {
    const buys = filteredTransactions.filter(t => t.operation === 'buy');
    const sells = filteredTransactions.filter(t => t.operation === 'sell');
    return {
      totalBuys: buys.reduce((s, t) => s + t.total, 0),
      totalSells: sells.reduce((s, t) => s + t.total, 0),
      totalFees: filteredTransactions.reduce((s, t) => s + t.fees, 0),
      countBuys: buys.length,
      countSells: sells.length,
      count: filteredTransactions.length,
    };
  }, [filteredTransactions]);

  const total = useMemo(() => assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0), [assets]);
  const cost = useMemo(() => assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0), [assets]);
  const gain = total - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  const topGainers = useMemo(() =>
    [...assets]
      .map(a => ({ ...a, profit: (a.currentPrice - a.avgPrice) * a.quantity, profitPct: a.avgPrice > 0 ? ((a.currentPrice - a.avgPrice) / a.avgPrice) * 100 : 0 }))
      .sort((a, b) => b.profitPct - a.profitPct),
    [assets]
  );

  const byType = useMemo(() => {
    const map: Record<string, { type: string; value: number; cost: number; count: number }> = {};
    assets.forEach(a => {
      if (!map[a.type]) map[a.type] = { type: a.type, value: 0, cost: 0, count: 0 };
      map[a.type].value += a.currentPrice * a.quantity;
      map[a.type].cost += a.avgPrice * a.quantity;
      map[a.type].count += 1;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [assets]);

  const bySector = useMemo(() => {
    const map: Record<string, { sector: string; value: number; count: number }> = {};
    assets.forEach(a => {
      const s = a.sector || 'Sem setor';
      if (!map[s]) map[s] = { sector: s, value: 0, count: 0 };
      map[s].value += a.currentPrice * a.quantity;
      map[s].count += 1;
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [assets]);

  const byBroker = useMemo(() => {
    const map: Record<string, { broker: string; value: number; cost: number; count: number; tickers: string[] }> = {};
    holdings.forEach(h => {
      const b = (h as any).broker || 'Não informada';
      const asset = assets.find(a => a.ticker === h.ticker);
      const value = asset ? asset.currentPrice * h.quantity : h.avg_price * h.quantity;
      const costVal = h.avg_price * h.quantity;
      if (!map[b]) map[b] = { broker: b, value: 0, cost: 0, count: 0, tickers: [] };
      map[b].value += value;
      map[b].cost += costVal;
      map[b].count += 1;
      map[b].tickers.push(h.ticker);
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [holdings, assets]);

  const pieData = useMemo(() =>
    byType.map(t => ({ name: t.type, value: Math.round(t.value * 100) / 100 })),
    [byType]
  );

  const handleExportPDF = () => {
    const content = reportRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>Relatório de Investimentos - ${dateStr}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; padding: 40px; }
          h1 { font-size: 24px; margin-bottom: 4px; color: #0d9488; }
          h2 { font-size: 18px; margin: 24px 0 12px; color: #1a1a2e; border-bottom: 2px solid #0d9488; padding-bottom: 6px; }
          h3 { font-size: 14px; margin: 16px 0 8px; color: #555; }
          .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
          .summary-card { padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
          .summary-card .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-card .value { font-size: 20px; font-weight: 700; margin-top: 4px; }
          .positive { color: #0d9488; }
          .negative { color: #ef4444; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; padding: 8px 12px; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
          td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
          tr:hover { background: #f9fafb; }
          .text-right { text-align: right; }
          .mono { font-family: 'JetBrains Mono', monospace; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
          .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #999; text-align: center; }
          @media print { body { padding: 20px; } .no-print { display: none; } }
        </style>
      </head><body>
        <h1>📊 Relatório de Investimentos</h1>
        <p class="subtitle">T2-Simplynvest • Gerado em ${dateStr} às ${now.toLocaleTimeString('pt-BR')}</p>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Patrimônio Total</div>
            <div class="value">${formatCurrency(total)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Custo Total</div>
            <div class="value">${formatCurrency(cost)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Resultado</div>
            <div class="value ${gain >= 0 ? 'positive' : 'negative'}">${formatCurrency(gain)} (${gainPct.toFixed(2)}%)</div>
          </div>
          <div class="summary-card">
            <div class="label">Ativos</div>
            <div class="value">${assets.length}</div>
          </div>
        </div>

        <h2>Composição por Tipo</h2>
        <table>
          <thead><tr><th>Tipo</th><th class="text-right">Ativos</th><th class="text-right">Valor</th><th class="text-right">Custo</th><th class="text-right">Resultado</th><th class="text-right">Alocação</th></tr></thead>
          <tbody>
            ${byType.map(t => `<tr>
              <td><strong>${t.type}</strong></td>
              <td class="text-right">${t.count}</td>
              <td class="text-right mono">${formatCurrency(t.value)}</td>
              <td class="text-right mono">${formatCurrency(t.cost)}</td>
              <td class="text-right mono ${t.value - t.cost >= 0 ? 'positive' : 'negative'}">${formatCurrency(t.value - t.cost)}</td>
              <td class="text-right">${total > 0 ? ((t.value / total) * 100).toFixed(1) : 0}%</td>
            </tr>`).join('')}
          </tbody>
        </table>

        ${byBroker.length > 0 ? `
        <h2>Distribuição por Corretora</h2>
        <table>
          <thead><tr><th>Corretora</th><th class="text-right">Ativos</th><th class="text-right">Valor</th><th class="text-right">Custo</th><th class="text-right">Resultado</th></tr></thead>
          <tbody>
            ${byBroker.map(b => `<tr>
              <td><strong>${b.broker}</strong></td>
              <td class="text-right">${b.count}</td>
              <td class="text-right mono">${formatCurrency(b.value)}</td>
              <td class="text-right mono">${formatCurrency(b.cost)}</td>
              <td class="text-right mono ${b.value - b.cost >= 0 ? 'positive' : 'negative'}">${formatCurrency(b.value - b.cost)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ` : ''}

        <h2>Detalhamento por Ativo</h2>
        <table>
          <thead><tr><th>Ticker</th><th>Nome</th><th>Tipo</th><th class="text-right">Qtd</th><th class="text-right">PM</th><th class="text-right">Atual</th><th class="text-right">Total</th><th class="text-right">Resultado</th><th class="text-right">%</th></tr></thead>
          <tbody>
            ${topGainers.map(a => `<tr>
              <td class="mono"><strong>${a.ticker}</strong></td>
              <td>${a.name}</td>
              <td>${a.type}</td>
              <td class="text-right mono">${a.quantity}</td>
              <td class="text-right mono">${formatCurrency(a.avgPrice)}</td>
              <td class="text-right mono">${formatCurrency(a.currentPrice)}</td>
              <td class="text-right mono">${formatCurrency(a.currentPrice * a.quantity)}</td>
              <td class="text-right mono ${a.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(a.profit)}</td>
              <td class="text-right ${a.profitPct >= 0 ? 'positive' : 'negative'}">${a.profitPct.toFixed(2)}%</td>
            </tr>`).join('')}
          </tbody>
        </table>

        ${bySector.length > 0 ? `
        <h2>Distribuição por Setor</h2>
        <table>
          <thead><tr><th>Setor</th><th class="text-right">Ativos</th><th class="text-right">Valor</th><th class="text-right">Alocação</th></tr></thead>
          <tbody>
            ${bySector.map(s => `<tr>
              <td>${s.sector}</td>
              <td class="text-right">${s.count}</td>
              <td class="text-right mono">${formatCurrency(s.value)}</td>
              <td class="text-right">${total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ` : ''}

        <div class="footer">
          Gerado automaticamente por T2-Simplynvest • ${dateStr}
        </div>
      </body></html>
    `);

    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const tabs: { id: ReportTab; label: string; icon: any }[] = [
    { id: 'overview', label: 'Visão Geral', icon: FileText },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'allocation', label: 'Alocação', icon: PieChart },
    { id: 'brokers', label: 'Corretoras', icon: BarChart3 },
    { id: 'transactions', label: 'Transações', icon: Calendar },
  ];

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Análise completa da sua carteira de investimentos
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportPortfolioCSV(assets)}
            disabled={assets.length === 0}
            className="h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium flex items-center gap-2 hover:bg-accent transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV Carteira
          </button>
          <button
            onClick={() => exportTransactionsCSV(transactions)}
            disabled={transactions.length === 0}
            className="h-9 px-4 rounded-lg border border-border bg-card text-sm font-medium flex items-center gap-2 hover:bg-accent transition-colors disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CSV Transações
          </button>
          <button
            onClick={handleExportPDF}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Download className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Period Filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Período:</span>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                period === p.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodDate && (
          <span className="text-[11px] text-muted-foreground">
            desde {periodDate.toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      <div ref={reportRef}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Patrimônio Total" value={formatCurrency(total)} icon={DollarSign} />
              <SummaryCard label="Custo Total" value={formatCurrency(cost)} icon={BarChart3} />
              <SummaryCard
                label="Resultado Total"
                value={`${formatCurrency(gain)} (${gainPct.toFixed(2)}%)`}
                icon={gain >= 0 ? TrendingUp : TrendingDown}
                variant={gain >= 0 ? 'gain' : 'loss'}
              />
              <SummaryCard label="Total de Ativos" value={assets.length.toString()} icon={PieChart} />
            </div>

            {/* Top movers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-[hsl(var(--gain-foreground))]" />
                  Melhores Ativos
                </h3>
                <div className="space-y-2">
                  {topGainers.filter(a => a.profitPct > 0).slice(0, 5).map(a => (
                    <div key={a.ticker} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                      <div>
                        <span className="font-mono font-semibold text-sm">{a.ticker}</span>
                        <p className="text-[11px] text-muted-foreground">{a.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-[hsl(var(--gain-foreground))]">
                          +{formatPercent(a.profitPct)}
                        </span>
                        <p className="text-[11px] text-muted-foreground font-mono">{formatCurrency(a.profit)}</p>
                      </div>
                    </div>
                  ))}
                  {topGainers.filter(a => a.profitPct > 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum ativo positivo</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <ArrowDownRight className="h-4 w-4 text-[hsl(var(--loss-foreground))]" />
                  Piores Ativos
                </h3>
                <div className="space-y-2">
                  {[...topGainers].reverse().filter(a => a.profitPct < 0).slice(0, 5).map(a => (
                    <div key={a.ticker} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                      <div>
                        <span className="font-mono font-semibold text-sm">{a.ticker}</span>
                        <p className="text-[11px] text-muted-foreground">{a.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-mono font-bold text-[hsl(var(--loss-foreground))]">
                          {formatPercent(a.profitPct)}
                        </span>
                        <p className="text-[11px] text-muted-foreground font-mono">{formatCurrency(a.profit)}</p>
                      </div>
                    </div>
                  ))}
                  {topGainers.filter(a => a.profitPct < 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum ativo negativo</p>
                  )}
                </div>
              </div>
            </div>

            {/* Full table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold">Detalhamento Completo</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium">Ativo</th>
                      <th className="text-left p-3 font-medium">Tipo</th>
                      <th className="text-right p-3 font-medium">Qtd</th>
                      <th className="text-right p-3 font-medium">PM</th>
                      <th className="text-right p-3 font-medium">Atual</th>
                      <th className="text-right p-3 font-medium">Total</th>
                      <th className="text-right p-3 font-medium">Resultado</th>
                      <th className="text-right p-3 font-medium">%</th>
                      <th className="text-right p-3 font-medium">Alocação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGainers.map(a => (
                      <tr key={a.ticker} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="p-3">
                          <span className="font-mono font-semibold">{a.ticker}</span>
                          <p className="text-[11px] text-muted-foreground">{a.name}</p>
                        </td>
                        <td className="p-3 text-xs">{a.type}</td>
                        <td className="p-3 text-right font-mono">{a.quantity}</td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(a.avgPrice)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(a.currentPrice)}</td>
                        <td className="p-3 text-right font-mono font-medium">{formatCurrency(a.currentPrice * a.quantity)}</td>
                        <td className={`p-3 text-right font-mono font-medium ${a.profit >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                          {formatCurrency(a.profit)}
                        </td>
                        <td className={`p-3 text-right font-mono ${a.profitPct >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                          {a.profitPct.toFixed(2)}%
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{a.allocation}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="p-3" colSpan={5}>Total</td>
                      <td className="p-3 text-right font-mono">{formatCurrency(total)}</td>
                      <td className={`p-3 text-right font-mono ${gain >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                        {formatCurrency(gain)}
                      </td>
                      <td className={`p-3 text-right font-mono ${gainPct >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                        {gainPct.toFixed(2)}%
                      </td>
                      <td className="p-3 text-right font-mono">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Resultado Total" value={formatCurrency(gain)} variant={gain >= 0 ? 'gain' : 'loss'} icon={gain >= 0 ? TrendingUp : TrendingDown} />
              <SummaryCard label="Rentabilidade" value={`${gainPct.toFixed(2)}%`} variant={gainPct >= 0 ? 'gain' : 'loss'} icon={BarChart3} />
              <SummaryCard label="Melhor Ativo" value={topGainers[0]?.ticker || '—'} icon={ArrowUpRight} />
              <SummaryCard label="Pior Ativo" value={topGainers[topGainers.length - 1]?.ticker || '—'} icon={ArrowDownRight} />
            </div>

            {/* Performance bar chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Resultado por Ativo (R$)</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topGainers.slice(0, 15)} layout="vertical" margin={{ left: 60, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" />
                    <XAxis type="number" tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11, fill: 'hsl(215, 12%, 50%)' }} />
                    <YAxis dataKey="ticker" type="category" tick={{ fontSize: 11, fill: 'hsl(210, 20%, 80%)', fontFamily: 'monospace' }} width={55} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220, 18%, 9%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [formatCurrency(v), 'Resultado']}
                    />
                    <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                      {topGainers.slice(0, 15).map((entry, i) => (
                        <Cell key={i} fill={entry.profit >= 0 ? 'hsl(160, 84%, 39%)' : 'hsl(0, 72%, 51%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Performance table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold">Ranking de Performance (%)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium w-8">#</th>
                      <th className="text-left p-3 font-medium">Ativo</th>
                      <th className="text-right p-3 font-medium">Custo</th>
                      <th className="text-right p-3 font-medium">Valor Atual</th>
                      <th className="text-right p-3 font-medium">Resultado R$</th>
                      <th className="text-right p-3 font-medium">Resultado %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topGainers.map((a, i) => (
                      <tr key={a.ticker} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3">
                          <span className="font-mono font-semibold">{a.ticker}</span>
                          <span className="text-[11px] text-muted-foreground ml-2">{a.type}</span>
                        </td>
                        <td className="p-3 text-right font-mono">{formatCurrency(a.avgPrice * a.quantity)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(a.currentPrice * a.quantity)}</td>
                        <td className={`p-3 text-right font-mono font-medium ${a.profit >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                          {a.profit >= 0 ? '+' : ''}{formatCurrency(a.profit)}
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${a.profitPct >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                          {a.profitPct >= 0 ? '+' : ''}{a.profitPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Allocation Tab */}
        {activeTab === 'allocation' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pie by type */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Alocação por Tipo</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`} labelLine={false}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(220, 18%, 9%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie by sector */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold mb-4">Alocação por Setor</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie
                        data={bySector.map(s => ({ name: s.sector, value: Math.round(s.value * 100) / 100 }))}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                        labelLine={false}
                      >
                        {bySector.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(220, 18%, 9%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatCurrency(v)} />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Type detail table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold">Detalhamento por Tipo</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium">Tipo</th>
                      <th className="text-right p-3 font-medium">Ativos</th>
                      <th className="text-right p-3 font-medium">Custo</th>
                      <th className="text-right p-3 font-medium">Valor</th>
                      <th className="text-right p-3 font-medium">Resultado</th>
                      <th className="text-right p-3 font-medium">Alocação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byType.map(t => {
                      const profit = t.value - t.cost;
                      return (
                        <tr key={t.type} className="border-b border-border/30 hover:bg-accent/30">
                          <td className="p-3 font-semibold">{t.type}</td>
                          <td className="p-3 text-right">{t.count}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(t.cost)}</td>
                          <td className="p-3 text-right font-mono font-medium">{formatCurrency(t.value)}</td>
                          <td className={`p-3 text-right font-mono font-medium ${profit >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                            {formatCurrency(profit)}
                          </td>
                          <td className="p-3 text-right font-mono">{total > 0 ? ((t.value / total) * 100).toFixed(1) : 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sector detail table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold">Detalhamento por Setor</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-3 font-medium">Setor</th>
                      <th className="text-right p-3 font-medium">Ativos</th>
                      <th className="text-right p-3 font-medium">Valor</th>
                      <th className="text-right p-3 font-medium">Alocação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySector.map(s => (
                      <tr key={s.sector} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="p-3 font-semibold">{s.sector}</td>
                        <td className="p-3 text-right">{s.count}</td>
                        <td className="p-3 text-right font-mono font-medium">{formatCurrency(s.value)}</td>
                        <td className="p-3 text-right font-mono">{total > 0 ? ((s.value / total) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Brokers Tab */}
        {activeTab === 'brokers' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Corretoras" value={byBroker.length.toString()} icon={BarChart3} />
              <SummaryCard label="Patrimônio Total" value={formatCurrency(total)} icon={DollarSign} />
              <SummaryCard label="Maior Posição" value={byBroker[0]?.broker || '—'} icon={TrendingUp} />
              <SummaryCard label="Ativos Totais" value={assets.length.toString()} icon={PieChart} />
            </div>

            {/* Broker bar chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Valor por Corretora</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byBroker} margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 16%)" />
                    <XAxis dataKey="broker" tick={{ fontSize: 11, fill: 'hsl(215, 12%, 50%)' }} />
                    <YAxis tickFormatter={v => formatCurrency(v)} tick={{ fontSize: 11, fill: 'hsl(215, 12%, 50%)' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220, 18%, 9%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => [formatCurrency(v), 'Valor']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {byBroker.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Broker detail cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {byBroker.map((b, i) => {
                const profit = b.value - b.cost;
                const profitPct = b.cost > 0 ? (profit / b.cost) * 100 : 0;
                return (
                  <div key={b.broker} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <h4 className="font-semibold">{b.broker}</h4>
                      </div>
                      <span className="text-xs text-muted-foreground">{b.count} ativos</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Valor</p>
                        <p className="text-sm font-mono font-bold">{formatCurrency(b.value)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Custo</p>
                        <p className="text-sm font-mono">{formatCurrency(b.cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">Resultado</p>
                        <p className={`text-sm font-mono font-bold ${profit >= 0 ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'}`}>
                          {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Ativos:</p>
                      <div className="flex flex-wrap gap-1">
                        {b.tickers.map(t => (
                          <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Total Operações" value={txSummary.count.toString()} icon={Calendar} />
              <SummaryCard label="Compras" value={`${txSummary.countBuys} (${formatCurrency(txSummary.totalBuys)})`} icon={ArrowUpRight} variant="gain" />
              <SummaryCard label="Vendas" value={`${txSummary.countSells} (${formatCurrency(txSummary.totalSells)})`} icon={ArrowDownRight} variant="loss" />
              <SummaryCard label="Taxas Pagas" value={formatCurrency(txSummary.totalFees)} icon={DollarSign} />
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold">Histórico de Transações</h3>
                <span className="text-xs text-muted-foreground">{filteredTransactions.length} operações</span>
              </div>
              {loadingTx ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Carregando transações...</span>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-sm">
                  Nenhuma transação encontrada neste período
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left p-3 font-medium">Data</th>
                        <th className="text-left p-3 font-medium">Ativo</th>
                        <th className="text-left p-3 font-medium">Tipo</th>
                        <th className="text-center p-3 font-medium">Operação</th>
                        <th className="text-right p-3 font-medium">Qtd</th>
                        <th className="text-right p-3 font-medium">Preço</th>
                        <th className="text-right p-3 font-medium">Total</th>
                        <th className="text-right p-3 font-medium">Taxas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map(t => (
                        <tr key={t.id} className="border-b border-border/30 hover:bg-accent/30">
                          <td className="p-3 font-mono text-xs">{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                          <td className="p-3">
                            <span className="font-mono font-semibold">{t.ticker}</span>
                            <p className="text-[10px] text-muted-foreground">{t.name}</p>
                          </td>
                          <td className="p-3 text-xs">{t.type}</td>
                          <td className="p-3 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              t.operation === 'buy'
                                ? 'bg-[hsl(var(--gain)/0.1)] text-[hsl(var(--gain-foreground))]'
                                : 'bg-[hsl(var(--loss)/0.1)] text-[hsl(var(--loss-foreground))]'
                            }`}>
                              {t.operation === 'buy' ? 'COMPRA' : 'VENDA'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">{t.quantity}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(t.price)}</td>
                          <td className="p-3 text-right font-mono font-medium">{formatCurrency(t.total)}</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">{formatCurrency(t.fees)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="p-3" colSpan={6}>Total</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(txSummary.totalBuys + txSummary.totalSells)}</td>
                        <td className="p-3 text-right font-mono">{formatCurrency(txSummary.totalFees)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, variant }: {
  label: string;
  value: string;
  icon: any;
  variant?: 'gain' | 'loss';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${
          variant === 'gain' ? 'bg-[hsl(var(--gain)/0.1)]' :
          variant === 'loss' ? 'bg-[hsl(var(--loss)/0.1)]' :
          'bg-primary/10'
        }`}>
          <Icon className={`h-3.5 w-3.5 ${
            variant === 'gain' ? 'text-[hsl(var(--gain-foreground))]' :
            variant === 'loss' ? 'text-[hsl(var(--loss-foreground))]' :
            'text-primary'
          }`} />
        </div>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-lg font-bold font-mono ${
        variant === 'gain' ? 'text-[hsl(var(--gain-foreground))]' :
        variant === 'loss' ? 'text-[hsl(var(--loss-foreground))]' :
        ''
      }`}>{value}</p>
    </div>
  );
}
