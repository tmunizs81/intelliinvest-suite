import { useState, useMemo } from 'react';
import { useTaxes, type Transaction, type MonthlyTaxSummary } from '@/hooks/useTaxes';
import { formatCurrency, formatPercent } from '@/lib/mockData';
import {
  Calculator, FileText, Plus, Trash2, Loader2, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, Download, Receipt, CalendarDays, TrendingDown,
  Upload,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const currentYear = new Date().getFullYear();
const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

const typeOptions = ['Ação', 'FII', 'ETF', 'Cripto', 'Renda Fixa'];

const darfCodes: Record<string, string> = {
  'Ação': '6015', 'FII': '6015', 'ETF': '6015', 'Cripto': '4600', 'Renda Fixa': '6015',
};

// --- Transaction Form ---
function TransactionForm({ onSave, onCancel }: { onSave: (tx: Omit<Transaction, 'id'>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState({
    ticker: '', name: '', type: 'Ação', operation: 'buy' as 'buy' | 'sell',
    quantity: '', price: '', fees: '0', date: new Date().toISOString().split('T')[0],
    is_daytrade: false, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.quantity || !form.price || !form.date) {
      setError('Preencha todos os campos obrigatórios'); return;
    }
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.price);
    const fees = parseFloat(form.fees || '0');
    if (isNaN(qty) || isNaN(price) || qty <= 0 || price <= 0) {
      setError('Quantidade e preço devem ser maiores que zero'); return;
    }
    setSaving(true);
    try {
      await onSave({
        ticker: form.ticker.toUpperCase().trim(),
        name: form.name.trim() || form.ticker.toUpperCase().trim(),
        type: form.type,
        operation: form.operation,
        quantity: qty,
        price,
        total: qty * price,
        fees,
        date: form.date,
        is_daytrade: form.is_daytrade,
        notes: form.notes || null,
      });
      onCancel();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5 space-y-4 animate-fade-in">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" /> Nova Operação
      </h3>

      {error && <p className="text-xs text-loss bg-loss/5 border border-loss/20 rounded-lg px-3 py-2">⚠️ {error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Operação</label>
          <div className="flex mt-1 rounded-lg border border-border overflow-hidden">
            <button type="button" onClick={() => setForm(f => ({ ...f, operation: 'buy' }))}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${form.operation === 'buy' ? 'bg-gain/15 text-gain' : 'text-muted-foreground hover:bg-accent/50'}`}>
              Compra
            </button>
            <button type="button" onClick={() => setForm(f => ({ ...f, operation: 'sell' }))}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${form.operation === 'sell' ? 'bg-loss/15 text-loss' : 'text-muted-foreground hover:bg-accent/50'}`}>
              Venda
            </button>
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Ticker *</label>
          <input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono uppercase placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="PETR4" maxLength={20} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nome</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Petrobras PN" maxLength={100} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</label>
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Quantidade *</label>
          <input value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            type="number" step="any" min="0"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="100" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço Unitário *</label>
          <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            type="number" step="0.01" min="0"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="35.00" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxas (R$)</label>
          <input value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
            type="number" step="0.01" min="0"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="0" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Data *</label>
          <input value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            type="date"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 cursor-pointer">
            <input type="checkbox" checked={form.is_daytrade} onChange={e => setForm(f => ({ ...f, is_daytrade: e.target.checked }))}
              className="rounded border-border" />
            <span className="text-xs text-muted-foreground">Day Trade</span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Salvar
        </button>
        <button type="button" onClick={onCancel}
          className="h-9 px-4 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-all">
          Cancelar
        </button>
      </div>
    </form>
  );
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function TaxChart({ monthly, year }: { monthly: MonthlyTaxSummary[]; year: number }) {
  const data = useMemo(() => {
    return MONTH_LABELS.map((label, i) => {
      const month = `${year}-${String(i + 1).padStart(2, '0')}`;
      const found = monthly.find(m => m.month === month);
      return {
        name: label,
        imposto: found?.totalTax || 0,
        ganho: found ? found.gains.reduce((s, g) => s + g.grossGain, 0) : 0,
      };
    });
  }, [monthly, year]);

  const hasData = data.some(d => d.imposto > 0 || d.ganho !== 0);
  if (!hasData) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-6">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-warning" />
        Impostos por Mês — {year}
      </h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,16%)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215,12%,50%)' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(215,12%,50%)' }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
            />
            <Tooltip
              contentStyle={{ background: 'hsl(220,18%,9%)', border: '1px solid hsl(220,14%,16%)', borderRadius: '8px', fontSize: '12px' }}
              itemStyle={{ color: 'hsl(210,20%,92%)' }}
              formatter={(value: number, name: string) => [formatCurrency(value), name === 'imposto' ? 'Imposto' : 'Ganho de Capital']}
              labelStyle={{ color: 'hsl(215,12%,50%)', fontSize: '11px' }}
            />
            <Bar dataKey="ganho" name="Ganho" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.ganho >= 0 ? 'hsl(160,84%,39%)' : 'hsl(0,72%,51%)'} fillOpacity={0.3} />
              ))}
            </Bar>
            <Bar dataKey="imposto" name="Imposto" radius={[4, 4, 0, 0]} fill="hsl(38,92%,50%)" maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- DARF Card ---
function DarfCard({ summary }: { summary: MonthlyTaxSummary }) {
  const [expanded, setExpanded] = useState(false);
  const hasTax = summary.totalTax > 0;
  const hasGains = summary.gains.some(g => g.grossGain !== 0);

  return (
    <div className={`rounded-xl border ${hasTax ? 'border-warning/30' : 'border-border'} bg-card overflow-hidden transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div className="text-left">
            <p className="text-sm font-semibold">{summary.label}</p>
            <p className="text-[10px] text-muted-foreground">
              Vendas: {formatCurrency(summary.salesTotal)} • {summary.gains.reduce((s, g) => s + g.operations.length, 0)} operações
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {summary.exempt && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gain/10 text-gain font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Isento
            </span>
          )}
          {hasTax ? (
            <div className="text-right">
              <p className="text-sm font-bold text-warning font-mono">{formatCurrency(summary.totalTax)}</p>
              <p className="text-[10px] text-muted-foreground">DARF até {new Date(summary.darfDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Sem imposto</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-3 border-t border-border pt-3 animate-fade-in">
          {summary.gains.map((gain) => (
            <div key={gain.type} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{gain.type}</span>
                <span className="text-[10px] text-muted-foreground">
                  Alíquota: {(gain.taxRate * 100).toFixed(0)}% {gain.taxRate === 0 && '(isento)'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground border-b border-border">
                      <th className="text-left py-1.5 pr-3">Ticker</th>
                      <th className="text-left py-1.5 pr-3">Data</th>
                      <th className="text-right py-1.5 pr-3">Qtd</th>
                      <th className="text-right py-1.5 pr-3">Venda</th>
                      <th className="text-right py-1.5 pr-3">Custo Médio</th>
                      <th className="text-right py-1.5">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gain.operations.map((op, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-mono font-medium">{op.ticker}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{new Date(op.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{op.quantity}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{formatCurrency(op.sellPrice)}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">{formatCurrency(op.avgCost)}</td>
                        <td className={`py-1.5 text-right font-mono font-medium ${op.gain >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {formatCurrency(op.gain)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-[11px] bg-muted/30 rounded-lg px-3 py-2">
                <div className="space-x-4">
                  <span>Lucro Bruto: <strong className={gain.grossGain >= 0 ? 'text-gain' : 'text-loss'}>{formatCurrency(gain.grossGain)}</strong></span>
                  {gain.deductibleLoss > 0 && <span>Prejuízo deduzido: <strong className="text-loss">-{formatCurrency(gain.deductibleLoss)}</strong></span>}
                  <span>Base de cálculo: <strong>{formatCurrency(gain.netGain)}</strong></span>
                </div>
                <span className="font-semibold">Imposto: <strong className="text-warning">{formatCurrency(gain.tax)}</strong></span>
              </div>
            </div>
          ))}

          {hasTax && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-warning" />
                <div>
                  <p className="text-xs font-semibold">DARF a pagar</p>
                  <p className="text-[10px] text-muted-foreground">
                    Código {summary.gains.map(g => darfCodes[g.type] || '6015').filter((v, i, a) => a.indexOf(v) === i).join(' / ')} • Vencimento: {new Date(summary.darfDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <p className="text-lg font-bold text-warning font-mono">{formatCurrency(summary.totalTax)}</p>
            </div>
          )}

          {summary.lossCarryForward < 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5" />
              Prejuízo acumulado para compensação: <strong className="text-loss">{formatCurrency(summary.lossCarryForward)}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Page ---
export default function Taxes() {
  const { transactions, loading, error, addTransaction, deleteTransaction, getAnnualSummary } = useTaxes();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<'taxes' | 'transactions'>('taxes');

  const annual = getAnnualSummary(selectedYear);

  const exportCSV = () => {
    const yearTxs = transactions.filter(t => t.date.startsWith(String(selectedYear)));
    if (yearTxs.length === 0) return;
    const header = 'Data;Operação;Ticker;Nome;Tipo;Quantidade;Preço;Total;Taxas;Day Trade;Notas';
    const rows = yearTxs.map(t =>
      `${t.date};${t.operation === 'buy' ? 'Compra' : 'Venda'};${t.ticker};${t.name};${t.type};${t.quantity};${t.price};${t.total};${t.fees};${t.is_daytrade ? 'Sim' : 'Não'};${t.notes || ''}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operacoes-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTaxReport = () => {
    if (annual.monthly.length === 0) return;
    let report = `RELATÓRIO DE IMPOSTOS - ${selectedYear}\n`;
    report += `${'='.repeat(50)}\n\n`;
    report += `Total de Vendas: ${formatCurrency(annual.totalSales)}\n`;
    report += `Ganho de Capital Total: ${formatCurrency(annual.totalGains)}\n`;
    report += `Imposto Total: ${formatCurrency(annual.totalTax)}\n`;
    report += `Meses com DARF: ${annual.taxPaidMonths}\n\n`;

    for (const m of annual.monthly) {
      report += `--- ${m.label} ---\n`;
      report += `Vendas: ${formatCurrency(m.salesTotal)}\n`;
      for (const g of m.gains) {
        report += `  ${g.type}: Lucro ${formatCurrency(g.grossGain)}, Imposto ${formatCurrency(g.tax)} (${(g.taxRate * 100).toFixed(0)}%)\n`;
        for (const op of g.operations) {
          report += `    ${op.ticker}: ${op.quantity}un x ${formatCurrency(op.sellPrice)} = ${formatCurrency(op.gain)} ${op.isDaytrade ? '(DT)' : ''}\n`;
        }
      }
      if (m.totalTax > 0) {
        report += `  DARF: ${formatCurrency(m.totalTax)} - Venc: ${new Date(m.darfDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}\n`;
      }
      report += '\n';
    }

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-impostos-${selectedYear}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <Calculator className="h-5 w-5 text-warning" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Automação de Impostos</h1>
              <p className="text-xs text-muted-foreground">Cálculo automático de IR, DARFs e relatórios para declaração</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => setShowForm(!showForm)}
              className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 flex items-center gap-1.5 transition-all">
              <Plus className="h-3.5 w-3.5" /> Operação
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-loss/30 bg-loss/5 p-4 text-sm text-loss-foreground">⚠️ {error}</div>
        )}

        {/* Transaction Form */}
        {showForm && (
          <div className="mb-6">
            <TransactionForm onSave={addTransaction} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {/* Annual Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Vendas</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(annual.totalSales)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ganho de Capital</p>
            <p className={`text-lg font-bold font-mono ${annual.totalGains >= 0 ? 'text-gain' : 'text-loss'}`}>
              {formatCurrency(annual.totalGains)}
            </p>
          </div>
          <div className={`rounded-xl border ${annual.totalTax > 0 ? 'border-warning/30' : 'border-border'} bg-card p-4`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Imposto Total</p>
            <p className={`text-lg font-bold font-mono ${annual.totalTax > 0 ? 'text-warning' : ''}`}>
              {formatCurrency(annual.totalTax)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">DARFs Gerados</p>
            <p className="text-lg font-bold font-mono">{annual.taxPaidMonths}</p>
          </div>
        </div>

        {/* Monthly Tax Chart */}
        <TaxChart monthly={annual.monthly} year={selectedYear} />

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-4 border-b border-border">
          <button onClick={() => setTab('taxes')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-all ${tab === 'taxes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Calculator className="h-3.5 w-3.5 inline mr-1.5" />Impostos por Mês
          </button>
          <button onClick={() => setTab('transactions')}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-all ${tab === 'transactions' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <FileText className="h-3.5 w-3.5 inline mr-1.5" />Operações ({transactions.filter(t => t.date.startsWith(String(selectedYear))).length})
          </button>
        </div>

        {tab === 'taxes' ? (
          <div className="space-y-3">
            {annual.monthly.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <Calculator className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma venda registrada em {selectedYear}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Adicione operações de compra e venda para calcular impostos</p>
              </div>
            ) : (
              <>
                {annual.monthly.map(m => <DarfCard key={m.month} summary={m} />)}

                {/* Export buttons */}
                <div className="flex items-center gap-3 pt-4">
                  <button onClick={exportTaxReport}
                    className="h-9 px-4 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all">
                    <Download className="h-3.5 w-3.5" /> Relatório para Declaração
                  </button>
                  <button onClick={exportCSV}
                    className="h-9 px-4 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all">
                    <Download className="h-3.5 w-3.5" /> Exportar Operações CSV
                  </button>
                </div>

                {/* Tax rules info */}
                <div className="rounded-xl border border-border bg-card p-5 mt-4">
                  <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Regras de Tributação Aplicadas
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[11px] text-muted-foreground">
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="font-semibold text-foreground mb-1">Ações (Swing Trade)</p>
                      <p>15% sobre lucro líquido. Isento se vendas no mês ≤ R$20.000. Day trade: 20%.</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="font-semibold text-foreground mb-1">FIIs e ETFs</p>
                      <p>FIIs: 20% sobre lucro, sem isenção. ETFs: 15% sobre lucro, sem isenção.</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="font-semibold text-foreground mb-1">Criptomoedas</p>
                      <p>15% sobre lucro. Isento se vendas no mês ≤ R$35.000.</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-3">
                    ⚠️ Este cálculo é uma estimativa. Consulte um contador para validação. Prejuízos acumulados são compensados automaticamente.
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.filter(t => t.date.startsWith(String(selectedYear))).length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma operação em {selectedYear}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-2.5">Data</th>
                        <th className="text-left px-4 py-2.5">Op</th>
                        <th className="text-left px-4 py-2.5">Ticker</th>
                        <th className="text-left px-4 py-2.5">Tipo</th>
                        <th className="text-right px-4 py-2.5">Qtd</th>
                        <th className="text-right px-4 py-2.5">Preço</th>
                        <th className="text-right px-4 py-2.5">Total</th>
                        <th className="text-right px-4 py-2.5">Taxas</th>
                        <th className="text-center px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions
                        .filter(t => t.date.startsWith(String(selectedYear)))
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(tx => (
                          <tr key={tx.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-xs">{new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${tx.operation === 'buy' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'}`}>
                                {tx.operation === 'buy' ? 'C' : 'V'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-medium">{tx.ticker}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{tx.type}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{tx.quantity}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(tx.price)}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(tx.total)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(tx.fees)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button onClick={() => deleteTransaction(tx.id)}
                                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-loss transition-colors">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button onClick={exportCSV}
                className="h-9 px-4 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all">
                <Download className="h-3.5 w-3.5" /> Exportar CSV
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
