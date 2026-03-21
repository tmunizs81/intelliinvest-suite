import { type Asset } from '@/lib/mockData';
import { type HoldingRow } from '@/hooks/usePortfolio';

import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AllocationChart from '@/components/dashboard/AllocationChart';
import DividendsPanel from '@/components/dashboard/DividendsPanel';
import AvgPriceCalculator from '@/components/dashboard/AvgPriceCalculator';
import FixedIncomePanel from '@/components/dashboard/FixedIncomePanel';
import RealEstatePanel from '@/components/dashboard/RealEstatePanel';
import CurrencyDashboard from '@/components/dashboard/CurrencyDashboard';

interface Props {
  assets: Asset[];
  holdings: HoldingRow[];
  loading: boolean;
  isMobile: boolean;
  onAdd: () => void;
  onEdit: (holding: HoldingRow) => void;
  onDelete: (id: string) => void;
}

function Panel({ children, title, className = '' }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm ${className}`}>
      {title && (
        <div className="bg-muted/40 border-b border-border px-4 py-2.5 shrink-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{title}</span>
        </div>
      )}
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

export default function TabCarteira({ assets, holdings, loading, isMobile, onAdd, onEdit, onDelete }: Props) {
  return (
    <>
      <Panel title="Meus Ativos">
        <HoldingsTable assets={assets} holdings={holdings} loading={loading} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
      </Panel>
      {isMobile ? (
        <>
          <Panel title="Alocação"><AllocationChart assets={assets} /></Panel>
          <Panel title="Dividendos"><DividendsPanel assets={assets} /></Panel>
          <Panel title="Calculadora PM"><AvgPriceCalculator assets={assets} /></Panel>
          <Panel title="Renda Fixa"><FixedIncomePanel assets={assets} /></Panel>
          <Panel title="Patrimônio Imobiliário"><RealEstatePanel assets={assets} /></Panel>
          <Panel title="Câmbio"><CurrencyDashboard /></Panel>
        </>
      ) : (
        <>
          <Grid3>
            <Panel title="Alocação"><AllocationChart assets={assets} /></Panel>
            <Panel title="Dividendos"><DividendsPanel assets={assets} /></Panel>
            <Panel title="Câmbio"><CurrencyDashboard /></Panel>
          </Grid3>
          <Grid2>
            <Panel title="Calculadora de Preço Médio"><AvgPriceCalculator assets={assets} /></Panel>
            <Panel title="Resumo Renda Fixa"><FixedIncomePanel assets={assets} /></Panel>
          </Grid2>
          <Panel title="Patrimônio Imobiliário"><RealEstatePanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}
