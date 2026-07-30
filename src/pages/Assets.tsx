import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus, Upload, Download, Search, Pencil, Trash2, ArrowUpRight,
  ArrowDownRight, ChevronRight, Loader2, FileSpreadsheet, X, AlertTriangle, FileUp,
  Wallet, DollarSign, Building2, ArrowUpDown, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import HoldingModal from '@/components/dashboard/HoldingModal';
import BulkImportYahoo from '@/components/dashboard/BulkImportYahoo';
import CsvBulkImportModal from '@/components/dashboard/CsvBulkImportModal';
import SellModal from '@/components/dashboard/SellModal';
import CashBalanceModal from '@/components/dashboard/CashBalanceModal';
import BrokerageImportPanel from '@/components/dashboard/BrokerageImportPanel';
import B3ImportPanel from '@/components/dashboard/B3ImportPanel';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import CustodyModal from '@/components/dashboard/CustodyModal';
import { BrokerLogo, preloadBrokers } from '@/lib/brokerLogos';
import { useBrokerLogoSettings, setLogoDensity } from '@/lib/brokerLogoSettings';
import BrokerReconciliationModal from '@/components/dashboard/BrokerReconciliationModal';
import { reconciliationGroups, assetRoute, NO_BROKER, brokerLabel } from '@/lib/holdingsIsolation';


const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-[hsl(270,70%,60%)]/10 text-[hsl(270,70%,85%)]',
  'ETF': 'bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,80%)]',
  'ETF Internacional': 'bg-emerald-500/10 text-emerald-400',
  'Cripto': 'bg-[hsl(160,84%,39%)]/10 text-[hsl(160,84%,80%)]',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
};

/** Checkbox acessível e consistente com o design system. */
function RowCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-[hsl(var(--primary))] rounded border-border"
    />
  );
}


export default function Assets() {
  const navigate = useNavigate();
  const { density } = useBrokerLogoSettings();
  const { assets, holdings, cashBalance, cashBalances, loading, refresh, addHolding, updateHolding, deleteHolding, bulkDeleteHoldings, sellHolding, updateCashBalance, loadCashMovements } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellingHolding, setSellingHolding] = useState<HoldingRow | null>(null);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const brokerFilter = searchParams.get('broker') || '';
  const setBrokerFilter = (b: string) => {
    const next = new URLSearchParams(searchParams);
    if (b) next.set('broker', b); else next.delete('broker');
    setSearchParams(next, { replace: true });
  };
  const [sortBy, setSortBy] = useState<'default' | 'value_desc' | 'value_asc' | 'name_asc' | 'broker_asc' | 'change_desc'>('default');
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [brokerageOpen, setBrokerageOpen] = useState(false);
  const [b3ImportOpen, setB3ImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [custodyOpen, setCustodyOpen] = useState(false);
  const [bulkYahooOpen, setBulkYahooOpen] = useState(false);
  const [csvBulkOpen, setCsvBulkOpen] = useState(false);
  // Seleção em lote (ids de holdings) e colapso por corretora
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [reconcileOpen, setReconcileOpen] = useState(false);

  /** Lotes que exigem decisão manual de corretora (duplicados ou sem corretora). */
  const reconcilePending = useMemo(
    () => reconciliationGroups(holdings).reduce((s, g) => s + g.lots.length, 0),
    [holdings],
  );

  const handleSell = (holdingRow: HoldingRow, asset: Asset) => {
    setSellingHolding(holdingRow);
    setSellingPrice(asset.currentPrice);
    setSellOpen(true);
  };

  // Corretoras únicas presentes na carteira (contagem para exibir no chip)
  const brokerFacets = useMemo(() => {
    const map = new Map<string, number>();
    holdings.forEach((h) => {
      const b = (h.broker || '').trim();
      if (!b) return;
      map.set(b, (map.get(b) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [holdings]);

  // Pré-carrega logos das top-N corretoras mais usadas na carteira,
  // reduzindo latência quando o usuário abre o filtro de corretora.
  useEffect(() => {
    if (!brokerFacets.length) return;
    preloadBrokers(brokerFacets.slice(0, 8).map(([b]) => b));
  }, [brokerFacets]);

  /** Corretora do lote — sempre do próprio registro, nunca de outro ticker igual. */
  const brokerOf = (a: Asset) => (a.broker || '').trim();

  const filtered = useMemo(() => {
    const list = assets.filter(a => {
      const matchSearch = !search || a.ticker.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase());
      const matchType = !typeFilter || a.type === typeFilter;
      const matchBroker = !brokerFilter || brokerOf(a) === brokerFilter;
      return matchSearch && matchType && matchBroker;
    });
    if (sortBy === 'default') return list;
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'value_desc': return (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity);
        case 'value_asc': return (a.currentPrice * a.quantity) - (b.currentPrice * b.quantity);
        case 'name_asc': return a.ticker.localeCompare(b.ticker);
        case 'broker_asc': return (brokerOf(a) || 'zzz').localeCompare(brokerOf(b) || 'zzz');
        case 'change_desc': return (b.change24h || 0) - (a.change24h || 0);
        default: return 0;
      }
    });
    return sorted;
  }, [assets, search, typeFilter, brokerFilter, sortBy]);

  /** Agrupamento por corretora — a fonte da verdade visual do módulo. */
  const groups = useMemo(() => {
    const map = new Map<string, Asset[]>();
    filtered.forEach((a) => {
      const key = brokerOf(a) || NO_BROKER;
      const arr = map.get(key);
      if (arr) arr.push(a); else map.set(key, [a]);
    });
    return Array.from(map.entries())
      .map(([broker, items]) => {
        const value = items.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
        const cost = items.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
        return { broker, items, value, cost, gain: value - cost };
      })
      .sort((a, b) => {
        if (a.broker === NO_BROKER) return 1;
        if (b.broker === NO_BROKER) return -1;
        return b.value - a.value;
      });
  }, [filtered]);

  const visibleIds = useMemo(
    () => filtered.map(a => a.holdingId).filter(Boolean) as string[],
    [filtered],
  );

  // Mantém a seleção coerente quando a lista muda (filtro, exclusão, refresh)
  useEffect(() => {
    setSelected(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (visibleIds.includes(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  const toggleOne = (id?: string) => {
    if (!id) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (items: Asset[]) => {
    const ids = items.map(a => a.holdingId).filter(Boolean) as string[];
    const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (allSelected) next.delete(id); else next.add(id); });
      return next;
    });
  };

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const toggleAllVisible = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(visibleIds));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const removed = await bulkDeleteHoldings(ids);
      setSelected(new Set());
      const summary = removed
        .slice(0, 3)
        .map(h => `${h.ticker} (${brokerLabel(h.broker)})`)
        .join(', ');
      toast.success(
        `${removed.length} ${removed.length === 1 ? 'posição removida' : 'posições removidas'}`,
        {
          description: summary + (removed.length > 3 ? ` +${removed.length - 3}` : ''),
          duration: 10000,
          action: {
            label: 'Desfazer',
            onClick: async () => {
              try {
                await restoreHoldings(removed);
                toast.success('Exclusão desfeita');
              } catch (e: any) {
                toast.error(e?.message || 'Não foi possível desfazer');
              }
            },
          },
        },
      );
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover ativos');
    } finally {
      setBulkDeleting(false);
    }
  };

  const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const cost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const gain = total - cost;

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este ativo da carteira?')) return;
    await deleteHolding(id);
  };


  const handleCSVImport = async () => {
    if (!importData.trim()) return;
    setImporting(true);
    setImportError('');

    try {
      const lines = importData.trim().split('\n');
      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('ticker') || header.includes('ativo');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      for (const line of dataLines) {
        const parts = line.split(/[;,\t]/).map(s => s.trim());
        if (parts.length < 4) continue;

        const [ticker, name, type, quantity, avgPrice, sector] = parts;
        await addHolding({
          ticker: ticker.toUpperCase(),
          name: name || ticker,
          type: type || 'Ação',
          quantity: parseFloat(quantity) || 0,
          avg_price: parseFloat(avgPrice?.replace(',', '.')) || 0,
          sector: sector || null,
          broker: null,
        });
      }

      setImportOpen(false);
      setImportData('');
    } catch (err: any) {
      setImportError(err?.message || 'Erro na importação');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportData(ev.target?.result as string || '');
    };
    reader.readAsText(file);
  };

  const exportCSV = () => {
    const header = 'Ticker;Nome;Tipo;Quantidade;Preço Médio;Setor';
    const rows = holdings.map(h =>
      `${h.ticker};${h.name};${h.type};${h.quantity};${h.avg_price};${h.sector || ''}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investai-carteira.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const types = ['Ação', 'FII', 'ETF', 'ETF Internacional', 'Cripto', 'Renda Fixa'];

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Meus Ativos</h1>
          <p className="text-sm text-muted-foreground">
            {assets.length} ativos • Patrimônio: {formatCurrency(total)} •{' '}
            <span className={gain >= 0 ? 'text-gain' : 'text-loss'}>
              {formatCurrency(gain)} ({formatPercent(cost > 0 ? (gain / cost) * 100 : 0)})
            </span>
            {' '}• <span className="text-primary">Caixa: {formatCurrency(cashBalance)}</span>
          </p>
        </div>

        {/* Cash balance card */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Wallet className="h-4 w-4 text-primary" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo em Caixa</p>
              <p className="text-lg font-bold font-mono text-primary">{formatCurrency(cashBalance)}</p>
            </div>
            <button
              onClick={() => setCashModalOpen(true)}
              className="ml-auto h-8 px-3 rounded-lg border border-primary/30 bg-primary/10 text-xs text-primary hover:bg-primary/20 transition-all font-medium"
            >
              <DollarSign className="h-3.5 w-3.5 inline mr-1" />
              Gerenciar
            </button>
          </div>
          {cashBalances.length > 0 && (
            <div className="mt-2 pt-2 border-t border-primary/10 space-y-0.5">
              {cashBalances.map((cb) => (
                <div key={cb.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{cb.broker || 'Sem corretora'}</span>
                  <span className="font-mono text-primary/80">{formatCurrency(cb.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setReconcileOpen(true)}
            className={`h-9 px-3 rounded-lg border text-sm flex items-center gap-2 transition-all ${
              reconcilePending > 0
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
            title="Revisar e reatribuir corretoras antes de unificar posições"
          >
            <AlertTriangle className="h-4 w-4" />
            Reconciliar corretoras
            {reconcilePending > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold">{reconcilePending}</span>
            )}
          </button>
          <button
            onClick={() => setCustodyOpen(true)}
            disabled={holdings.length === 0}
            className="h-9 px-3 rounded-lg border border-[hsl(270,70%,60%)]/30 bg-[hsl(270,70%,60%)]/10 text-sm text-[hsl(270,70%,85%)] hover:bg-[hsl(270,70%,60%)]/20 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Building2 className="h-4 w-4" />
            Custódia
          </button>
          <button
            onClick={() => setB3ImportOpen(true)}
            className="h-9 px-3 rounded-lg border border-gain/30 bg-gain/10 text-sm text-gain hover:bg-gain/20 flex items-center gap-2 transition-all"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importar CEI/B3
          </button>
          <button
            onClick={() => setBrokerageOpen(true)}
            className="h-9 px-3 rounded-lg border border-primary/30 bg-primary/10 text-sm text-primary hover:bg-primary/20 flex items-center gap-2 transition-all"
          >
            <FileUp className="h-4 w-4" />
            Nota Corretagem
          </button>
          <button
            onClick={() => setBulkYahooOpen(true)}
            className="h-9 px-3 rounded-lg border border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5 text-sm text-primary hover:from-primary/20 hover:to-primary/10 flex items-center gap-2 transition-all font-medium"
          >
            <Upload className="h-4 w-4" />
            Importar via Yahoo
          </button>
          <button
            onClick={() => setCsvBulkOpen(true)}
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-all"
          >
            <Upload className="h-4 w-4" />
            Importar CSV
          </button>
          <button
            onClick={exportCSV}
            disabled={holdings.length === 0}
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
          <button
            onClick={() => { setEditingHolding(null); setModalOpen(true); }}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Adicionar Ativo
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por ticker ou nome..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              !typeFilter ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="appearance-none rounded-lg border border-input bg-card pl-8 pr-3 py-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Ordenar ativos"
          >
            <option value="default">Ordem padrão</option>
            <option value="value_desc">Maior valor</option>
            <option value="value_asc">Menor valor</option>
            <option value="change_desc">Maior variação 24h</option>
            <option value="name_asc">Ticker (A–Z)</option>
            <option value="broker_asc">Corretora (A–Z)</option>
          </select>
          <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Broker filter chips */}
      {brokerFacets.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 -mt-2">
          <button
            onClick={() => setBrokerFilter('')}
            className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
              !brokerFilter ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Todas ({holdings.length})
          </button>
          {brokerFacets.map(([b, count]) => (
            <button
              key={b}
              onClick={() => setBrokerFilter(brokerFilter === b ? '' : b)}
              className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                brokerFilter === b ? 'bg-primary/15 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <BrokerLogo broker={b} size={12} />
              {b}
              <span className="opacity-60">({count})</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">Logos:</span>
            <button
              onClick={() => setLogoDensity(density === 'full' ? 'compact' : 'full')}
              className="rounded-full border border-border px-2 py-0.5 hover:text-foreground transition-colors"
              title="Alternar densidade das logos de corretora"
            >
              {density === 'full' ? 'Completo' : 'Compacto'}
            </button>
          </div>
        </div>
      )}

      {/* Active broker filter banner */}
      {brokerFilter && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <BrokerLogo broker={brokerFilter} size={16} />
          <span className="text-muted-foreground">Filtrando por corretora:</span>
          <span className="font-semibold text-foreground">{brokerFilter}</span>
          <span className="text-muted-foreground">({filtered.length} {filtered.length === 1 ? 'ativo' : 'ativos'})</span>
          <button
            onClick={() => setBrokerFilter('')}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] hover:border-primary/50 hover:text-primary transition-colors"
            aria-label="Limpar filtro de corretora"
          >
            <X className="h-3 w-3" /> Limpar filtro
          </button>
        </div>
      )}




      {/* B3 Integration Banner */}
      <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold">Integração B3 / CEI</h3>
          <p className="text-xs text-muted-foreground mt-1">
            A B3 não disponibiliza API pública gratuita para sincronização automática. Para importar sua carteira,
            acesse o <a href="https://cei.b3.com.br" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Portal CEI da B3</a>,
            exporte seu extrato em CSV e use o botão "Importar CSV" acima. Formato esperado: <code className="text-[10px] bg-muted px-1 py-0.5 rounded">Ticker;Nome;Tipo;Quantidade;Preço Médio;Setor</code>
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading && assets.length === 0 ? (
          <div className="flex items-center justify-center py-16 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Carregando ativos...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground mb-4">
              {search || typeFilter ? 'Nenhum ativo encontrado com esses filtros' : 'Nenhum ativo na carteira'}
            </p>
            {!search && !typeFilter && (
              <button
                onClick={() => { setEditingHolding(null); setModalOpen(true); }}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Adicionar primeiro ativo
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Barra de ação em lote */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
                <RowCheckbox checked={allVisibleSelected} onChange={toggleAllVisible} label="Selecionar todos os ativos visíveis" />
                Selecionar todos ({visibleIds.length})
              </label>
              {selected.size > 0 && (
                <>
                  <span className="text-primary font-medium">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpar seleção
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--loss)/0.12)] border border-[hsl(var(--loss)/0.35)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--loss-foreground))] hover:bg-[hsl(var(--loss)/0.2)] transition-colors disabled:opacity-50"
                  >
                    {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Excluir selecionados
                  </button>
                </>
              )}
            </div>

            {/* Desktop Table — agrupado por corretora */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="w-10 p-4"></th>
                    <th className="text-left p-4 font-medium">Ativo</th>
                    <th className="text-left p-4 font-medium">Tipo</th>
                    <th className="text-right p-4 font-medium">Qtd</th>
                    <th className="text-right p-4 font-medium">PM</th>
                    <th className="text-right p-4 font-medium">Atual</th>
                    <th className="text-right p-4 font-medium">24h</th>
                    <th className="text-right p-4 font-medium">Total</th>
                    <th className="text-right p-4 font-medium">Lucro</th>
                    <th className="text-right p-4 font-medium">Alocação</th>
                    <th className="text-right p-4 font-medium w-24"></th>
                  </tr>
                </thead>
                {groups.map((g) => {
                  const ids = g.items.map(a => a.holdingId).filter(Boolean) as string[];
                  const groupSelected = ids.length > 0 && ids.every(id => selected.has(id));
                  const isCollapsed = collapsed.has(g.broker);
                  const label = g.broker === NO_BROKER ? 'Sem corretora' : g.broker;
                  return (
                    <tbody key={g.broker}>
                      <tr className="bg-muted/40 border-y border-border">
                        <td className="p-3 pl-4">
                          <RowCheckbox checked={groupSelected} onChange={() => toggleGroup(g.items)} label={`Selecionar todos de ${label}`} />
                        </td>
                        <td colSpan={10} className="p-3 pr-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCollapsed(prev => {
                                const next = new Set(prev);
                                if (next.has(g.broker)) next.delete(g.broker); else next.add(g.broker);
                                return next;
                              })}
                              className="inline-flex items-center gap-2 text-sm font-semibold hover:text-primary transition-colors"
                            >
                              <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                              {g.broker !== NO_BROKER && <BrokerLogo broker={g.broker} size={18} />}
                              {label}
                              <span className="text-[11px] font-normal text-muted-foreground">
                                ({g.items.length} {g.items.length === 1 ? 'ativo' : 'ativos'})
                              </span>
                            </button>
                            <div className="ml-auto flex items-center gap-3 font-mono text-xs">
                              <span className="text-muted-foreground">{formatCurrency(g.value)}</span>
                              <span className={g.gain >= 0 ? 'text-gain' : 'text-loss'}>
                                {formatCurrency(g.gain)} ({formatPercent(g.cost > 0 ? (g.gain / g.cost) * 100 : 0)})
                              </span>
                              {g.broker !== NO_BROKER && (
                                <button
                                  onClick={() => setBrokerFilter(brokerFilter === g.broker ? '' : g.broker)}
                                  className="rounded-full border border-border px-2 py-0.5 text-[10px] font-sans text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                                >
                                  {brokerFilter === g.broker ? 'Limpar' : 'Ver só esta'}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {!isCollapsed && g.items.map((asset) => {
                        const assetTotal = asset.currentPrice * asset.quantity;
                        const assetCost = asset.avgPrice * asset.quantity;
                        const profit = assetTotal - assetCost;
                        const profitPct = assetCost > 0 ? (profit / assetCost) * 100 : 0;
                        const isPositive = asset.change24h >= 0;
                        const isProfitable = profit >= 0;
                        const holdingRow = holdings.find(h => h.id === asset.holdingId);
                        const isSelected = !!asset.holdingId && selected.has(asset.holdingId);

                        return (
                          <tr
                            key={asset.holdingId || `${asset.ticker}::${g.broker}`}
                            className={`border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                            onClick={() => navigate(`/analysis?ticker=${asset.ticker}`)}
                          >
                            <td className="p-4" onClick={e => e.stopPropagation()}>
                              <RowCheckbox
                                checked={isSelected}
                                onChange={() => toggleOne(asset.holdingId)}
                                label={`Selecionar ${asset.ticker} em ${label}`}
                              />
                            </td>
                            <td className="p-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold font-mono">{asset.ticker}</span>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{asset.name}</p>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                                {asset.type}
                              </span>
                            </td>
                            <td className="text-right p-4 font-mono">{asset.quantity}</td>
                            <td className="text-right p-4 font-mono text-muted-foreground">{formatCurrency(asset.avgPrice)}</td>
                            <td className="text-right p-4 font-mono font-medium">
                              {asset.currentPrice > 0 ? (
                                <div>
                                  <span>{formatCurrency(asset.currentPrice)}</span>
                                  {asset.currency && asset.currency !== 'BRL' && asset.originalPrice && asset.originalPrice > 0 && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {formatCurrency(asset.originalPrice, asset.currency)}
                                    </p>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="text-right p-4">
                              {asset.currentPrice > 0 ? (
                                <span className={`inline-flex items-center gap-1 font-mono text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
                                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  {formatPercent(asset.change24h)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="text-right p-4 font-mono font-medium">
                              {asset.currentPrice > 0 ? formatCurrency(assetTotal) : '—'}
                            </td>
                            <td className="text-right p-4">
                              {asset.currentPrice > 0 ? (
                                <div className={`font-mono ${isProfitable ? 'text-gain' : 'text-loss'}`}>
                                  <span className="font-medium">{formatCurrency(profit)}</span>
                                  <p className="text-xs">{formatPercent(profitPct)}</p>
                                </div>
                              ) : '—'}
                            </td>
                            <td className="text-right p-4 font-mono text-muted-foreground">{asset.allocation}%</td>
                            <td className="text-right p-4" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                {holdingRow && (
                                  <>
                                    <button
                                      onClick={() => handleSell(holdingRow, asset)}
                                      className="h-7 px-2 rounded flex items-center justify-center gap-1 text-[10px] font-semibold text-[hsl(var(--loss-foreground))] bg-[hsl(var(--loss)/0.1)] hover:bg-[hsl(var(--loss)/0.2)] transition-colors"
                                      title="Vender"
                                    >
                                      <ArrowDownRight className="h-3 w-3" />
                                      Vender
                                    </button>
                                    <button
                                      onClick={() => { setEditingHolding(holdingRow); setModalOpen(true); }}
                                      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(holdingRow.id)}
                                      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-[hsl(var(--loss-foreground))] hover:bg-[hsl(var(--loss)/0.1)] transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>

            {/* Mobile Card View — agrupado por corretora */}
            <div className="md:hidden">
              {groups.map((g) => {
                const ids = g.items.map(a => a.holdingId).filter(Boolean) as string[];
                const groupSelected = ids.length > 0 && ids.every(id => selected.has(id));
                const label = g.broker === NO_BROKER ? 'Sem corretora' : g.broker;
                return (
                  <div key={g.broker}>
                    <div className="flex items-center gap-2 bg-muted/40 border-y border-border px-4 py-2">
                      <RowCheckbox checked={groupSelected} onChange={() => toggleGroup(g.items)} label={`Selecionar todos de ${label}`} />
                      {g.broker !== NO_BROKER && <BrokerLogo broker={g.broker} size={16} />}
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground">({g.items.length})</span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">{formatCurrency(g.value)}</span>
                    </div>
                    <div className="divide-y divide-border">
                      {g.items.map((asset) => {
                        const assetTotal = asset.currentPrice * asset.quantity;
                        const assetCost = asset.avgPrice * asset.quantity;
                        const profit = assetTotal - assetCost;
                        const profitPct = assetCost > 0 ? (profit / assetCost) * 100 : 0;
                        const isPositive = asset.change24h >= 0;
                        const isProfitable = profit >= 0;
                        const holdingRow = holdings.find(h => h.id === asset.holdingId);
                        const isSelected = !!asset.holdingId && selected.has(asset.holdingId);

                        return (
                          <div
                            key={asset.holdingId || `${asset.ticker}::${g.broker}`}
                            className={`p-4 hover:bg-accent/30 active:bg-accent/50 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                            onClick={() => navigate(`/analysis?ticker=${asset.ticker}`)}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <span className="mt-1" onClick={e => e.stopPropagation()}>
                                  <RowCheckbox
                                    checked={isSelected}
                                    onChange={() => toggleOne(asset.holdingId)}
                                    label={`Selecionar ${asset.ticker} em ${label}`}
                                  />
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold font-mono">{asset.ticker}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                                      {asset.type}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{asset.name}</p>
                                  {density === 'full' && g.broker !== NO_BROKER && (
                                    <p className="text-[10px] text-muted-foreground/70">{g.broker}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-semibold text-sm">
                                  {asset.currentPrice > 0 ? formatCurrency(asset.currentPrice) : '—'}
                                </p>
                                {asset.currentPrice > 0 && asset.currency && asset.currency !== 'BRL' && asset.originalPrice && asset.originalPrice > 0 && (
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    {formatCurrency(asset.originalPrice, asset.currency)}
                                  </p>
                                )}
                                {asset.currentPrice > 0 && (
                                  <span className={`inline-flex items-center gap-0.5 text-xs font-mono ${isPositive ? 'text-gain' : 'text-loss'}`}>
                                    {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                    {formatPercent(asset.change24h)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <span>{asset.quantity} un</span>
                                <span>PM {formatCurrency(asset.avgPrice)}</span>
                                <span>{asset.allocation}%</span>
                              </div>
                              {asset.currentPrice > 0 && (
                                <span className={`font-mono font-medium ${isProfitable ? 'text-gain' : 'text-loss'}`}>
                                  {formatCurrency(profit)} ({formatPercent(profitPct)})
                                </span>
                              )}
                            </div>
                            {holdingRow && (
                              <div className="flex items-center justify-end gap-1 mt-2" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleSell(holdingRow, asset)}
                                  className="h-7 px-2 rounded flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--loss-foreground))] bg-[hsl(var(--loss)/0.1)] hover:bg-[hsl(var(--loss)/0.2)] transition-colors"
                                >
                                  <ArrowDownRight className="h-3 w-3" />
                                  Vender
                                </button>
                                <button
                                  onClick={() => { setEditingHolding(holdingRow); setModalOpen(true); }}
                                  className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(holdingRow.id)}
                                  className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-[hsl(var(--loss-foreground))] hover:bg-[hsl(var(--loss)/0.1)] transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* CSV Import Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Importar CSV</h2>
              </div>
              <button onClick={() => setImportOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Cole os dados ou faça upload de um arquivo CSV. Formato: <code className="bg-muted px-1 py-0.5 rounded text-xs">Ticker;Nome;Tipo;Quantidade;Preço Médio;Setor</code>
              </p>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/30 p-6 text-center text-sm text-muted-foreground hover:text-foreground transition-all"
                >
                  <Upload className="h-6 w-6 mx-auto mb-2" />
                  Clique para selecionar arquivo CSV
                </button>
              </div>
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                rows={6}
                placeholder="PETR4;Petrobras PN;Ação;100;28.50;Petróleo&#10;HGLG11;CSHG Logística;FII;50;158.00;Logística"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {importError && (
                <div className="rounded-md bg-[hsl(var(--loss)/0.1)] border border-[hsl(var(--loss)/0.2)] p-3 text-sm text-[hsl(var(--loss-foreground))]">
                  {importError}
                </div>
              )}
              <button
                onClick={handleCSVImport}
                disabled={!importData.trim() || importing}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar Ativos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B3/CEI Import Modal */}
      {b3ImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-gain" />
                <h2 className="text-lg font-semibold">Importar Extrato CEI/B3</h2>
              </div>
              <button onClick={() => setB3ImportOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <B3ImportPanel onImportComplete={() => { setB3ImportOpen(false); refresh(); }} />
            </div>
          </div>
        </div>
      )}

      {/* Brokerage Note Import Modal */}
      {brokerageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Importar Nota de Corretagem</h2>
              </div>
              <button onClick={() => setBrokerageOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <BrokerageImportPanel />
            </div>
          </div>
        </div>
      )}

      <HoldingModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingHolding(null); }}
        onSave={addHolding}
        editData={editingHolding}
        onUpdate={updateHolding}
      />

      <SellModal
        open={sellOpen}
        holding={sellingHolding}
        currentPrice={sellingPrice}
        onClose={() => { setSellOpen(false); setSellingHolding(null); }}
        onSell={sellHolding}
      />

      <CashBalanceModal
        open={cashModalOpen}
        onClose={() => setCashModalOpen(false)}
        cashBalances={cashBalances}
        totalBalance={cashBalance}
        onConfirm={updateCashBalance}
        loadMovements={loadCashMovements}
      />

      <CustodyModal
        open={custodyOpen}
        onClose={() => setCustodyOpen(false)}
        holdings={holdings}
        assets={assets}
      />

      <BulkImportYahoo open={bulkYahooOpen} onClose={() => setBulkYahooOpen(false)} />
      <CsvBulkImportModal open={csvBulkOpen} onClose={() => setCsvBulkOpen(false)} />
    </div>
  );
}
