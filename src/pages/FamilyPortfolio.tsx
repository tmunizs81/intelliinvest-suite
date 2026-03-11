import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, PieChart, Eye } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatPercent, type Asset } from '@/lib/mockData';

const COLORS = [
  'hsl(160,84%,39%)', 'hsl(270,70%,60%)', 'hsl(38,92%,50%)',
  'hsl(200,80%,50%)', 'hsl(340,65%,50%)', 'hsl(120,50%,45%)',
  'hsl(30,90%,55%)', 'hsl(180,60%,45%)', 'hsl(220,60%,55%)', 'hsl(0,60%,50%)',
];

const typeBadge: Record<string, string> = {
  'Ação': 'bg-primary/10 text-primary',
  'FII': 'bg-violet-500/10 text-violet-400',
  'ETF': 'bg-amber-500/10 text-amber-400',
  'Cripto': 'bg-emerald-500/10 text-emerald-400',
  'Renda Fixa': 'bg-secondary text-secondary-foreground',
};

interface FamilyOwner {
  id: string;
  owner_id: string;
  invited_email: string;
  status: string;
}

export default function FamilyPortfolio() {
  const { user } = useAuth();
  const [owners, setOwners] = useState<FamilyOwner[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cashBalance, setCashBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);

  // Load family connections where user is a member
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('family_members')
        .select('*')
        .eq('member_id', user.id)
        .eq('status', 'active');
      setOwners(data || []);
      if (data && data.length > 0) {
        setSelectedOwner(data[0].owner_id);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const loadPortfolio = useCallback(async (ownerId: string) => {
    setLoadingPortfolio(true);
    try {
      // Fetch holdings via edge function
      const { data: portfolioData, error: fnError } = await supabase.functions.invoke('family-portfolio', {
        body: { owner_id: ownerId },
      });

      if (fnError) throw fnError;
      if (portfolioData?.error) throw new Error(portfolioData.error);

      const holdings = portfolioData.holdings || [];
      setOwnerName(portfolioData.ownerName || 'Proprietário');
      setCashBalance(portfolioData.cashBalance || 0);

      if (holdings.length === 0) {
        setAssets([]);
        setLoadingPortfolio(false);
        return;
      }

      // Fetch quotes
      const tickers = holdings.map((h: any) => h.ticker);
      const { data: quoteData } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers },
      });

      const quotes = quoteData?.quotes || {};
      let totalValue = 0;

      const enriched = holdings.map((item: any) => {
        const quote = quotes[item.ticker];
        const currentPrice = quote?.currentPriceBRL || quote?.currentPrice || 0;
        const value = currentPrice * item.quantity;
        totalValue += value;
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type as Asset['type'],
          quantity: item.quantity,
          avgPrice: item.avg_price,
          currentPrice,
          change24h: quote?.change24h || 0,
          allocation: 0,
          sector: item.sector || undefined,
          currency: quote?.currency || 'BRL',
          currentPriceBRL: currentPrice,
          exchangeRate: quote?.exchangeRate || 1,
        };
      });

      const withAlloc: Asset[] = enriched.map((a: any) => ({
        ...a,
        allocation: totalValue > 0 ? Math.round(((a.currentPrice * a.quantity) / totalValue) * 1000) / 10 : 0,
      }));

      setAssets(withAlloc);
    } catch (err) {
      console.error('Error loading family portfolio:', err);
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOwner) {
      loadPortfolio(selectedOwner);
    }
  }, [selectedOwner, loadPortfolio]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (owners.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Carteira Familiar</h1>
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma carteira compartilhada</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Você ainda não foi adicionado como membro familiar. Peça ao proprietário para enviar um convite em Configurações → Família.
          </p>
        </div>
      </div>
    );
  }

  const totalInvested = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const totalPL = totalValue - totalInvested;
  const totalPLPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const patrimonio = totalValue + cashBalance;

  const allocationData = assets
    .filter(a => a.allocation > 0)
    .map(a => ({ name: a.ticker, value: a.allocation }));

  const typeAllocation = assets.reduce((acc, a) => {
    const val = a.currentPrice * a.quantity;
    acc[a.type] = (acc[a.type] || 0) + val;
    return acc;
  }, {} as Record<string, number>);

  const typeData = Object.entries(typeAllocation).map(([name, value]) => ({
    name,
    value: totalValue > 0 ? Math.round((value / totalValue) * 1000) / 10 : 0,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Carteira Familiar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualização da carteira de <span className="font-medium text-foreground">{ownerName}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {owners.length > 1 && (
            <select
              value={selectedOwner || ''}
              onChange={e => setSelectedOwner(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {owners.map(o => (
                <option key={o.id} value={o.owner_id}>Carteira #{o.owner_id.slice(0, 6)}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => selectedOwner && loadPortfolio(selectedOwner)}
            disabled={loadingPortfolio}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent/50 flex items-center gap-2 transition-colors"
          >
            {loadingPortfolio ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* Read-only badge */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-4 py-2.5">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Modo visualização — você pode ver a carteira, mas não pode fazer alterações.</span>
      </div>

      {loadingPortfolio ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          Esta carteira não possui ativos cadastrados.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard label="Patrimônio" value={formatCurrency(patrimonio)} icon={Wallet} />
            <SummaryCard label="Investido" value={formatCurrency(totalInvested)} icon={TrendingUp} />
            <SummaryCard
              label="Lucro/Prejuízo"
              value={formatCurrency(totalPL)}
              sub={formatPercent(totalPLPercent)}
              positive={totalPL >= 0}
              icon={totalPL >= 0 ? TrendingUp : TrendingDown}
            />
            <SummaryCard label="Caixa" value={formatCurrency(cashBalance)} icon={Wallet} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Allocation by asset */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-muted-foreground" /> Alocação por Ativo
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={allocationData} cx="50%" cy="50%" outerRadius={85} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                      {allocationData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `${val}%`} />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Allocation by type */}
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-muted-foreground" /> Alocação por Tipo
              </h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPie>
                    <Pie data={typeData} cx="50%" cy="50%" outerRadius={85} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                      {typeData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: number) => `${val}%`} />
                  </RechartsPie>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Holdings table (read-only) */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold">Ativos ({assets.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left p-3 font-medium text-xs">Ativo</th>
                    <th className="text-left p-3 font-medium text-xs">Tipo</th>
                    <th className="text-right p-3 font-medium text-xs">Qtd</th>
                    <th className="text-right p-3 font-medium text-xs">PM</th>
                    <th className="text-right p-3 font-medium text-xs">Preço Atual</th>
                    <th className="text-right p-3 font-medium text-xs">Valor</th>
                    <th className="text-right p-3 font-medium text-xs">Var 24h</th>
                    <th className="text-right p-3 font-medium text-xs">P/L</th>
                    <th className="text-right p-3 font-medium text-xs">Alocação</th>
                  </tr>
                </thead>
                <tbody>
                  {assets
                    .sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))
                    .map(asset => {
                      const value = asset.currentPrice * asset.quantity;
                      const invested = asset.avgPrice * asset.quantity;
                      const pl = value - invested;
                      const plPercent = invested > 0 ? (pl / invested) * 100 : 0;
                      return (
                        <tr key={asset.ticker} className="border-b border-border/30 hover:bg-accent/20 transition-colors">
                          <td className="p-3">
                            <div>
                              <span className="font-mono font-semibold">{asset.ticker}</span>
                              <p className="text-xs text-muted-foreground truncate max-w-[150px]">{asset.name}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${typeBadge[asset.type] || 'bg-muted text-muted-foreground'}`}>
                              {asset.type}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono">{asset.quantity.toLocaleString('pt-BR')}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(asset.avgPrice)}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(asset.currentPrice)}</td>
                          <td className="p-3 text-right font-mono font-medium">{formatCurrency(value)}</td>
                          <td className={`p-3 text-right font-mono ${asset.change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
                            {asset.change24h >= 0 ? '+' : ''}{formatPercent(asset.change24h)}
                          </td>
                          <td className={`p-3 text-right font-mono ${pl >= 0 ? 'text-gain' : 'text-loss'}`}>
                            {formatCurrency(pl)}
                            <span className="text-[10px] block">{pl >= 0 ? '+' : ''}{formatPercent(plPercent)}</span>
                          </td>
                          <td className="p-3 text-right font-mono">{asset.allocation}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, positive, icon: Icon }: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xl font-bold font-mono">{value}</p>
      {sub && (
        <p className={`text-xs font-mono mt-0.5 ${positive ? 'text-gain' : 'text-loss'}`}>{sub}</p>
      )}
    </div>
  );
}
