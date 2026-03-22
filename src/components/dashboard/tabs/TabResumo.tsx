import { type Asset } from '@/lib/mockData';
import { type SnapshotRow } from '@/hooks/usePortfolioSnapshots';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';
import LazyPanel from '@/components/LazyPanel';

import PortfolioChart from '@/components/dashboard/PortfolioChart';
import HealthScorePanel from '@/components/dashboard/HealthScorePanel';
import TreemapPanel from '@/components/dashboard/TreemapPanel';
import SectorRadarPanel from '@/components/dashboard/SectorRadarPanel';
import EventsCalendarPanel from '@/components/dashboard/EventsCalendarPanel';
import RealEstatePanel from '@/components/dashboard/RealEstatePanel';
import AchievementsPanel from '@/components/dashboard/AchievementsPanel';
import LiveTickerBar from '@/components/dashboard/LiveTickerBar';
import PortfolioSummary from '@/components/dashboard/PortfolioSummary';

interface Props {
  assets: Asset[];
  lastUpdate: Date | null;
  nextUpdate: Date | null;
  snapshots: SnapshotRow[];
  snapshotsLoading: boolean;
  isMobile: boolean;
}

function Panel({ children, title, noPadding, className = '' }: {
  children: React.ReactNode;
  title?: string;
  noPadding?: boolean;
  className?: string;
}) {
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

export default function TabResumo({ assets, lastUpdate, nextUpdate, snapshots, snapshotsLoading, isMobile }: Props) {
  return (
    <>
      <LiveTickerBar assets={assets} />
      <Panel noPadding>
        <PortfolioSummary assets={assets} lastUpdate={lastUpdate} nextUpdate={nextUpdate} />
      </Panel>
      {isMobile ? (
        <>
          <Panel title="Saúde da Carteira"><HealthScorePanel assets={assets} /></Panel>
          <Panel title="Mapa de Calor"><TreemapPanel assets={assets} /></Panel>
          <Panel title="Concentração Setorial"><SectorRadarPanel assets={assets} /></Panel>
          <Panel title="Calendário de Eventos"><EventsCalendarPanel assets={assets} /></Panel>
          <Panel title="Evolução Patrimonial"><PortfolioChart assets={assets} snapshots={snapshots} loading={snapshotsLoading} /></Panel>
          <Panel title="Histórico Patrimonial"><PortfolioChart assets={assets} snapshots={snapshots} loading={snapshotsLoading} showCostLine /></Panel>
          <Panel title="Patrimônio Imobiliário"><RealEstatePanel assets={assets} /></Panel>
          <Panel title="🏆 Conquistas"><AchievementsPanel assets={assets} /></Panel>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Saúde da Carteira"><HealthScorePanel assets={assets} /></Panel>
            <Panel title="Evolução Patrimonial" className="lg:col-span-2"><PortfolioChart assets={assets} snapshots={snapshots} loading={snapshotsLoading} /></Panel>
          </div>
          <Panel title="🗺️ Mapa de Calor (Treemap)"><TreemapPanel assets={assets} /></Panel>
          <Grid2>
            <Panel title="📡 Concentração Setorial (Radar)"><SectorRadarPanel assets={assets} /></Panel>
            <Panel title="📅 Calendário de Eventos"><EventsCalendarPanel assets={assets} /></Panel>
          </Grid2>
          <Panel title="Histórico Patrimonial (Real)"><PortfolioChart assets={assets} snapshots={snapshots} loading={snapshotsLoading} showCostLine /></Panel>
          <Panel title="🏠 Patrimônio Imobiliário"><RealEstatePanel assets={assets} /></Panel>
          <Panel title="🏆 Conquistas e Badges"><AchievementsPanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}
