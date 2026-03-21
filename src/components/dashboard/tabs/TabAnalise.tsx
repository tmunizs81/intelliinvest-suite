import { type Asset } from '@/lib/mockData';
import { type SnapshotRow } from '@/hooks/usePortfolioSnapshots';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';

import PerformanceChart from '@/components/dashboard/PerformanceChart';
import DrawdownPanel from '@/components/dashboard/DrawdownPanel';
import CorrelationHeatmap from '@/components/dashboard/CorrelationHeatmap';
import BenchmarkChart from '@/components/dashboard/BenchmarkChart';
import ProfitabilityPanel from '@/components/dashboard/ProfitabilityPanel';
import BacktestingPanel from '@/components/dashboard/BacktestingPanel';
import CeilingPricePanel from '@/components/dashboard/CeilingPricePanel';

interface Props {
  assets: Asset[];
  snapshots: SnapshotRow[];
  isMobile: boolean;
}

function Panel({ children, title, className = '' }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm ${className}`}>
      {title && (
        <div className="bg-muted/40 border-b border-border px-4 py-2.5 shrink-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{title}</span>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <PanelErrorBoundary fallbackTitle={title ? `Erro em "${title}"` : undefined}>
          {children}
        </PanelErrorBoundary>
      </div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>;
}

export default function TabAnalise({ assets, snapshots, isMobile }: Props) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Performance"><PerformanceChart assets={assets} /></Panel>
          <Panel title="Drawdown"><DrawdownPanel snapshots={snapshots} /></Panel>
          <Panel title="Correlação"><CorrelationHeatmap assets={assets} /></Panel>
          <Panel title="Benchmarks"><BenchmarkChart snapshots={snapshots} /></Panel>
          <Panel title="Rentabilidade"><ProfitabilityPanel assets={assets} /></Panel>
          <Panel title="Backtesting"><BacktestingPanel assets={assets} /></Panel>
          <Panel title="Preço Teto"><CeilingPricePanel assets={assets} /></Panel>
        </>
      ) : (
        <>
          <Panel title="Performance"><PerformanceChart assets={assets} /></Panel>
          <Grid2>
            <Panel title="📉 Análise de Drawdown"><DrawdownPanel snapshots={snapshots} /></Panel>
            <Panel title="Correlação"><CorrelationHeatmap assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Rentabilidade vs Benchmarks"><ProfitabilityPanel assets={assets} /></Panel>
            <Panel title="Carteira vs Benchmarks"><BenchmarkChart snapshots={snapshots} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Backtesting Histórico"><BacktestingPanel assets={assets} /></Panel>
            <Panel title="Preço Teto (Bazin/Graham)"><CeilingPricePanel assets={assets} /></Panel>
          </Grid2>
        </>
      )}
    </>
  );
}
