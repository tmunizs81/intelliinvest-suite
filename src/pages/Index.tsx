import { useState, useCallback } from 'react';
// @ts-ignore
import { Responsive, WidthProvider } from 'react-grid-layout';
// @ts-ignore
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import PortfolioSummary from '@/components/dashboard/PortfolioSummary';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import AllocationChart from '@/components/dashboard/AllocationChart';
import PerformanceChart from '@/components/dashboard/PerformanceChart';
import DividendsPanel from '@/components/dashboard/DividendsPanel';
import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import HoldingModal from '@/components/dashboard/HoldingModal';
import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import { Loader2, Lock, Unlock, RotateCcw } from 'lucide-react';

const ResponsiveGridLayout = WidthProvider(Responsive);

const STORAGE_KEY = 'investai-dashboard-layouts';

const defaultLayouts: any = {
  lg: [
    { i: 'summary', x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 3 },
    { i: 'portfolio-chart', x: 0, y: 3, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'allocation', x: 8, y: 3, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'performance', x: 0, y: 10, w: 12, h: 8, minW: 6, minH: 6 },
    { i: 'dividends', x: 0, y: 18, w: 12, h: 9, minW: 6, minH: 6 },
    { i: 'holdings', x: 0, y: 27, w: 8, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 8, y: 27, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'ai-insights', x: 8, y: 32, w: 4, h: 5, minW: 3, minH: 4 },
  ],
  md: [
    { i: 'summary', x: 0, y: 0, w: 10, h: 3, minW: 6, minH: 3 },
    { i: 'portfolio-chart', x: 0, y: 3, w: 6, h: 7, minW: 4, minH: 5 },
    { i: 'allocation', x: 6, y: 3, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'performance', x: 0, y: 10, w: 10, h: 8, minW: 6, minH: 6 },
    { i: 'dividends', x: 0, y: 18, w: 10, h: 9, minW: 6, minH: 6 },
    { i: 'holdings', x: 0, y: 27, w: 10, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 0, y: 37, w: 5, h: 5, minW: 3, minH: 4 },
    { i: 'ai-insights', x: 5, y: 37, w: 5, h: 5, minW: 3, minH: 4 },
  ],
  sm: [
    { i: 'summary', x: 0, y: 0, w: 6, h: 4, minW: 6, minH: 3 },
    { i: 'portfolio-chart', x: 0, y: 4, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'allocation', x: 0, y: 11, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'performance', x: 0, y: 18, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'dividends', x: 0, y: 26, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'holdings', x: 0, y: 35, w: 6, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 0, y: 45, w: 6, h: 5, minW: 6, minH: 4 },
    { i: 'ai-insights', x: 0, y: 50, w: 6, h: 5, minW: 6, minH: 4 },
  ],
};

function loadLayouts(): Record<string, Layout[]> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return defaultLayouts;
}

const Index = () => {
  const { assets, holdings, loading, error, lastUpdate, refresh, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [layouts, setLayouts] = useState(loadLayouts);
  const [locked, setLocked] = useState(true);

  const handleLayoutChange = useCallback((_: Layout[], allLayouts: Record<string, Layout[]>) => {
    setLayouts(allLayouts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
  }, []);

  const resetLayout = useCallback(() => {
    setLayouts(defaultLayouts);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleEdit = (holding: HoldingRow) => {
    setEditingHolding(holding);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingHolding(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between py-5">
          <div>
            <p className="text-sm text-muted-foreground">
              Controle inteligente de investimentos
              {lastUpdate && (
                <span className="ml-2 text-xs">
                  • Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocked(!locked)}
              className={`h-8 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                locked
                  ? 'border-border bg-card text-muted-foreground hover:text-foreground'
                  : 'border-primary/30 bg-primary/10 text-primary'
              }`}
              title={locked ? 'Desbloquear layout' : 'Bloquear layout'}
            >
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {locked ? 'Editar Layout' : 'Editando'}
            </button>
            {!locked && (
              <button
                onClick={resetLayout}
                className="h-8 px-3 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-all"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
            <button
              onClick={() => refresh()}
              className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            >
              <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-loss/30 bg-loss/5 p-4 text-sm text-loss-foreground animate-fade-in">
            ⚠️ {error}
          </div>
        )}

        {loading && assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando carteira...</p>
          </div>
        ) : (
          <div className="pb-12">
            <ResponsiveGridLayout
              className="layout"
              layouts={layouts}
              breakpoints={{ lg: 1200, md: 800, sm: 0 }}
              cols={{ lg: 12, md: 10, sm: 6 }}
              rowHeight={40}
              isDraggable={!locked}
              isResizable={!locked}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".drag-handle"
              compactType="vertical"
              margin={[16, 16]}
            >
              <div key="summary">
                <DashboardPanel title="" noPadding locked={locked}>
                  <PortfolioSummary assets={assets} lastUpdate={lastUpdate} />
                </DashboardPanel>
              </div>
              <div key="portfolio-chart">
                <DashboardPanel title="Evolução Patrimonial" locked={locked}>
                  <PortfolioChart assets={assets} />
                </DashboardPanel>
              </div>
              <div key="allocation">
                <DashboardPanel title="Alocação" locked={locked}>
                  <AllocationChart assets={assets} />
                </DashboardPanel>
              </div>
              <div key="performance">
                <DashboardPanel title="Performance" locked={locked}>
                  <PerformanceChart assets={assets} />
                </DashboardPanel>
              </div>
              <div key="dividends">
                <DashboardPanel title="Dividendos" locked={locked}>
                  <DividendsPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="holdings">
                <DashboardPanel title="Carteira" locked={locked}>
                  <HoldingsTable
                    assets={assets}
                    holdings={holdings}
                    loading={loading}
                    onAdd={() => { setEditingHolding(null); setModalOpen(true); }}
                    onEdit={handleEdit}
                    onDelete={deleteHolding}
                  />
                </DashboardPanel>
              </div>
              <div key="alerts">
                <DashboardPanel title="Alertas" locked={locked}>
                  <AlertsPanel />
                </DashboardPanel>
              </div>
              <div key="ai-insights">
                <DashboardPanel title="IA Insights" locked={locked}>
                  <AIInsightsPanel assets={assets} />
                </DashboardPanel>
              </div>
            </ResponsiveGridLayout>
          </div>
        )}
      </div>

      <HoldingModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={addHolding}
        editData={editingHolding}
        onUpdate={updateHolding}
      />
    </div>
  );
};

function DashboardPanel({ children, title, noPadding, locked }: {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
  locked: boolean;
}) {
  return (
    <div className="h-full w-full overflow-auto rounded-lg">
      {!locked && title && (
        <div className="drag-handle cursor-grab active:cursor-grabbing bg-muted/50 border-b border-border px-3 py-1.5 flex items-center gap-2 rounded-t-lg">
          <div className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</span>
        </div>
      )}
      <div className={noPadding ? '' : ''}>{children}</div>
    </div>
  );
}

export default Index;
