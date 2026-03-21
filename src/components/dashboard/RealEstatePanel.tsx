import { Building2, TrendingUp, Home, MapPin } from 'lucide-react';
import { type Asset } from '@/lib/mockData';

interface Props {
  assets: Asset[];
}

export default function RealEstatePanel({ assets }: Props) {
  const properties = assets.filter(a => a.type === 'Imóvel');

  if (properties.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p>Nenhum imóvel cadastrado.</p>
        <p className="text-xs mt-1">Adicione imóveis na aba "Meus Ativos" selecionando tipo "Imóvel".</p>
      </div>
    );
  }

  const totalInvested = properties.reduce((s, p) => s + p.avgPrice * p.quantity, 0);
  const totalCurrent = properties.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
  const totalAppreciation = totalCurrent - totalInvested;
  const totalAppreciationPct = totalInvested > 0 ? (totalAppreciation / totalInvested) * 100 : 0;

  // Parse rental info from sector string
  const parseRentalInfo = (sector?: string) => {
    if (!sector) return null;
    const rentalMatch = sector.match(/Aluguel R\$([\d.,]+)\/mês/);
    const roiMonthMatch = sector.match(/ROI ([\d.,]+)%\/mês/);
    const roiYearMatch = sector.match(/\(([\d.,]+)%\/ano\)/);
    if (!rentalMatch) return null;
    return {
      rental: parseFloat(rentalMatch[1].replace('.', '').replace(',', '.')),
      roiMonth: roiMonthMatch ? parseFloat(roiMonthMatch[1].replace(',', '.')) : 0,
      roiYear: roiYearMatch ? parseFloat(roiYearMatch[1].replace(',', '.')) : 0,
    };
  };

  const totalMonthlyRental = properties.reduce((s, p) => {
    const info = parseRentalInfo(p.sector);
    return s + (info?.rental || 0);
  }, 0);

  const getPropertyType = (sector?: string) => {
    if (!sector) return '';
    return sector.split('•')[0]?.trim() || '';
  };

  const isRented = (sector?: string) => sector?.includes('Aluguel');

  return (
    <div className="p-4 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Patrimônio Imobiliário</p>
          <p className="text-lg font-bold text-foreground mt-1">
            R$ {totalCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Valorização Total</p>
          <p className={`text-lg font-bold mt-1 ${totalAppreciation >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {totalAppreciation >= 0 ? '+' : ''}R$ {totalAppreciation.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className={`text-xs ${totalAppreciationPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {totalAppreciationPct >= 0 ? '+' : ''}{totalAppreciationPct.toFixed(2)}%
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Renda Mensal (Aluguéis)</p>
          <p className="text-lg font-bold text-primary mt-1">
            R$ {totalMonthlyRental.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Imóveis</p>
          <p className="text-lg font-bold text-foreground mt-1">{properties.length}</p>
        </div>
      </div>

      {/* Property list */}
      <div className="space-y-3">
        {properties.map((p) => {
          const invested = p.avgPrice * p.quantity;
          const current = p.currentPrice * p.quantity;
          const appreciation = current - invested;
          const appreciationPct = invested > 0 ? (appreciation / invested) * 100 : 0;
          const rentalInfo = parseRentalInfo(p.sector);
          const propType = getPropertyType(p.sector);
          const rented = isRented(p.sector);

          // Monthly appreciation (from change24h which holds total return %)
          const monthlyAppreciation = invested > 0 ? appreciation : 0;

          return (
            <div key={p.ticker} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {rented ? <MapPin className="h-5 w-5 text-primary" /> : <Home className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{propType}</span>
                      {rented && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">Alugado</span>
                      )}
                      {!rented && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Patrimônio</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-sm">R$ {current.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                  <p className={`text-xs font-medium ${appreciation >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {appreciation >= 0 ? '+' : ''}R$ {appreciation.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    <span className="ml-1">({appreciationPct >= 0 ? '+' : ''}{appreciationPct.toFixed(2)}%)</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-muted/40 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Valor Compra</span>
                  <p className="font-mono font-medium text-foreground">R$ {invested.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="bg-muted/40 rounded px-2 py-1.5">
                  <span className="text-muted-foreground">Valor Atual</span>
                  <p className="font-mono font-medium text-foreground">R$ {current.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                </div>
                {rentalInfo && (
                  <>
                    <div className="bg-emerald-500/5 rounded px-2 py-1.5">
                      <span className="text-muted-foreground">Aluguel/mês</span>
                      <p className="font-mono font-medium text-emerald-500">R$ {rentalInfo.rental.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-emerald-500/5 rounded px-2 py-1.5">
                      <span className="text-muted-foreground">ROI Aluguel</span>
                      <p className="font-mono font-medium text-emerald-500">{rentalInfo.roiMonth}%/mês • {rentalInfo.roiYear}%/ano</p>
                    </div>
                  </>
                )}
                {!rentalInfo && (
                  <>
                    <div className="bg-muted/40 rounded px-2 py-1.5">
                      <span className="text-muted-foreground">Valorização/mês</span>
                      <p className="font-mono font-medium text-foreground">
                        {appreciationPct > 0 ? (appreciationPct / Math.max(1, p.change24h > 0 ? 1 : 1)).toFixed(2) : '0.00'}%
                      </p>
                    </div>
                    <div className="bg-muted/40 rounded px-2 py-1.5">
                      <span className="text-muted-foreground">Valorização/ano</span>
                      <p className="font-mono font-medium text-foreground">{appreciationPct.toFixed(2)}%</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
