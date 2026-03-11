import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Upload, Download, Search, Pencil, Trash2, ArrowUpRight,
  ArrowDownRight, ChevronRight, Loader2, FileSpreadsheet, X, AlertTriangle, FileUp,
  Wallet, DollarSign,
} from 'lucide-react';
import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import HoldingModal from '@/components/dashboard/HoldingModal';
import SellModal from '@/components/dashboard/SellModal';
import CashBalanceModal from '@/components/dashboard/CashBalanceModal';
import BrokerageImportPanel from '@/components/dashboard/BrokerageImportPanel';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';

const typeBadgeClass: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-[hsl(270,70%,60%)]/10 text-[hsl(270,70%,85%)]',
  'ETF': 'bg-[hsl(38,92%,50%)]/10 text-[hsl(38,92%,80%)]',
  'ETF Internacional': 'bg-emerald-500/10 text-emerald-400',
  'Cripto': 'bg-[hsl(160,84%,39%)]/10 text-[hsl(160,84%,80%)]',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
};

export default function Assets() {
  const navigate = useNavigate();
  const { assets, holdings, cashBalance, loading, refresh, addHolding, updateHolding, deleteHolding, sellHolding, updateCashBalance } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellingHolding, setSellingHolding] = useState<HoldingRow | null>(null);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [brokerageOpen, setBrokerageOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cashModalOpen, setCashModalOpen] = useState(false);

  const handleSell = (holdingRow: HoldingRow, asset: Asset) => {
    setSellingHolding(holdingRow);
    setSellingPrice(asset.currentPrice);
    setSellOpen(true);
  };

  const filtered = assets.filter(a => {
    const matchSearch = !search || a.ticker.toLowerCase().includes(search.toLowerCase()) || a.name.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || a.type === typeFilter;
    return matchSearch && matchType;
  });

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
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo em Caixa</p>
            <p className="text-lg font-bold font-mono text-primary">{formatCurrency(cashBalance)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBrokerageOpen(true)}
            className="h-9 px-3 rounded-lg border border-primary/30 bg-primary/10 text-sm text-primary hover:bg-primary/20 flex items-center gap-2 transition-all"
          >
            <FileUp className="h-4 w-4" />
            Importar Nota B3
          </button>
          <button
            onClick={() => setImportOpen(true)}
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
      </div>

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
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
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
                <tbody>
                  {filtered.map((asset) => {
                    const assetTotal = asset.currentPrice * asset.quantity;
                    const assetCost = asset.avgPrice * asset.quantity;
                    const profit = assetTotal - assetCost;
                    const profitPct = assetCost > 0 ? (profit / assetCost) * 100 : 0;
                    const isPositive = asset.change24h >= 0;
                    const isProfitable = profit >= 0;
                    const holdingRow = holdings.find(h => h.ticker === asset.ticker);

                    return (
                      <tr
                        key={asset.ticker}
                        className="border-b border-border/50 hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/analysis?ticker=${asset.ticker}`)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold font-mono">{asset.ticker}</span>
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <p className="text-xs text-muted-foreground">{asset.name}</p>
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
                              {asset.currency && asset.currency !== 'BRL' && (
                                <p className="text-[10px] text-muted-foreground">
                                  {formatCurrency(asset.currentPrice / (asset.exchangeRate || 1), asset.currency)}
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
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((asset) => {
                const assetTotal = asset.currentPrice * asset.quantity;
                const assetCost = asset.avgPrice * asset.quantity;
                const profit = assetTotal - assetCost;
                const profitPct = assetCost > 0 ? (profit / assetCost) * 100 : 0;
                const isPositive = asset.change24h >= 0;
                const isProfitable = profit >= 0;
                const holdingRow = holdings.find(h => h.ticker === asset.ticker);

                return (
                  <div
                    key={asset.ticker}
                    className="p-4 hover:bg-accent/30 active:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/analysis?ticker=${asset.ticker}`)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono">{asset.ticker}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeClass[asset.type] || ''}`}>
                            {asset.type}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{asset.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-sm">
                          {asset.currentPrice > 0 ? formatCurrency(asset.currentPrice) : '—'}
                        </p>
                        {asset.currentPrice > 0 && asset.currency && asset.currency !== 'BRL' && (
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {formatCurrency(asset.currentPrice / (asset.exchangeRate || 1), asset.currency)}
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
    </div>
  );
}
