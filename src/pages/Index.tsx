import { useState, useCallback, useRef, useEffect } from 'react';
// @ts-ignore
import { Responsive as ResponsiveOrig } from 'react-grid-layout';
const ResponsiveGrid: any = ResponsiveOrig;
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileDashboardTabs, { type MobileTab } from '@/components/dashboard/MobileDashboardTabs';

import PortfolioSummary from '@/components/dashboard/PortfolioSummary';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import PortfolioHistoryChart from '@/components/dashboard/PortfolioHistoryChart';
import BenchmarkChart from '@/components/dashboard/BenchmarkChart';
import AllocationChart from '@/components/dashboard/AllocationChart';
import PerformanceChart from '@/components/dashboard/PerformanceChart';
import DividendsPanel from '@/components/dashboard/DividendsPanel';
import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import CurrencyDashboard from '@/components/dashboard/CurrencyDashboard';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import LicenseAlert from '@/components/dashboard/LicenseAlert';
import HoldingModal from '@/components/dashboard/HoldingModal';
import HealthScorePanel from '@/components/dashboard/HealthScorePanel';
import RebalancePanel from '@/components/dashboard/RebalancePanel';
import CorrelationHeatmap from '@/components/dashboard/CorrelationHeatmap';
import NewsPanel from '@/components/dashboard/NewsPanel';
import SimulatorPanel from '@/components/dashboard/SimulatorPanel';
import GoalsPanel from '@/components/dashboard/GoalsPanel';
import DashboardChatbot from '@/components/dashboard/DashboardChatbot';
import SmartAlertsPanel from '@/components/dashboard/SmartAlertsPanel';
import MonthlyReportPanel from '@/components/dashboard/MonthlyReportPanel';
import SmartContributionPanel from '@/components/dashboard/SmartContributionPanel';
import CeilingPricePanel from '@/components/dashboard/CeilingPricePanel';
import ProfitabilityPanel from '@/components/dashboard/ProfitabilityPanel';
import BacktestingPanel from '@/components/dashboard/BacktestingPanel';
import DividendForecastPanel from '@/components/dashboard/DividendForecastPanel';
import AssetScoringPanel from '@/components/dashboard/AssetScoringPanel';
import FixedIncomePanel from '@/components/dashboard/FixedIncomePanel';
import AIAdvisorPanel from '@/components/dashboard/AIAdvisorPanel';
import AIRiskPanel from '@/components/dashboard/AIRiskPanel';
import OnboardingOverlay from '@/components/OnboardingOverlay';

import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import { usePortfolioSnapshots } from '@/hooks/usePortfolioSnapshots';
import { Loader2, Lock, Unlock, RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'investai-dashboard-layouts';

const defaultLayouts: any = {
  lg: [
    { i: 'summary', x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 3 },
    { i: 'health-score', x: 0, y: 3, w: 3, h: 8, minW: 3, minH: 6 },
    { i: 'portfolio-chart', x: 3, y: 3, w: 9, h: 8, minW: 4, minH: 5 },
    { i: 'portfolio-history', x: 0, y: 11, w: 12, h: 8, minW: 6, minH: 6 },
    { i: 'allocation', x: 0, y: 19, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'rebalance', x: 4, y: 19, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'correlation', x: 8, y: 19, w: 4, h: 7, minW: 3, minH: 5 },
    { i: 'performance', x: 0, y: 26, w: 12, h: 7, minW: 6, minH: 5 },
    { i: 'dividends', x: 0, y: 33, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'dividend-forecast', x: 6, y: 33, w: 6, h: 8, minW: 4, minH: 6 },
    { i: 'holdings', x: 0, y: 41, w: 8, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 8, y: 41, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'currency', x: 8, y: 46, w: 4, h: 5, minW: 3, minH: 4 },
    { i: 'simulator', x: 0, y: 51, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'goals', x: 6, y: 51, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'news', x: 0, y: 60, w: 8, h: 7, minW: 4, minH: 5 },
    { i: 'ai-insights', x: 8, y: 60, w: 4, h: 7, minW: 3, minH: 4 },
    { i: 'smart-alerts', x: 0, y: 67, w: 6, h: 7, minW: 3, minH: 5 },
    { i: 'monthly-report', x: 6, y: 67, w: 6, h: 7, minW: 3, minH: 5 },
    { i: 'smart-contribution', x: 0, y: 74, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'ceiling-price', x: 6, y: 74, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'profitability', x: 0, y: 83, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'backtesting', x: 6, y: 83, w: 6, h: 9, minW: 4, minH: 6 },
    { i: 'asset-scoring', x: 0, y: 92, w: 6, h: 12, minW: 4, minH: 8 },
    { i: 'fixed-income', x: 6, y: 92, w: 6, h: 12, minW: 4, minH: 8 },
    { i: 'benchmark-chart', x: 0, y: 104, w: 12, h: 8, minW: 6, minH: 6 },
    { i: 'ai-advisor', x: 0, y: 112, w: 6, h: 12, minW: 4, minH: 8 },
    { i: 'ai-risk', x: 6, y: 112, w: 6, h: 12, minW: 4, minH: 8 },
  ],
  md: [
    { i: 'summary', x: 0, y: 0, w: 10, h: 3, minW: 6, minH: 3 },
    { i: 'health-score', x: 0, y: 3, w: 4, h: 8, minW: 3, minH: 6 },
    { i: 'portfolio-chart', x: 4, y: 3, w: 6, h: 8, minW: 4, minH: 5 },
    { i: 'portfolio-history', x: 0, y: 11, w: 10, h: 8, minW: 6, minH: 6 },
    { i: 'allocation', x: 0, y: 19, w: 5, h: 7, minW: 3, minH: 5 },
    { i: 'rebalance', x: 5, y: 19, w: 5, h: 7, minW: 3, minH: 5 },
    { i: 'correlation', x: 0, y: 26, w: 10, h: 7, minW: 6, minH: 5 },
    { i: 'performance', x: 0, y: 33, w: 10, h: 7, minW: 6, minH: 5 },
    { i: 'dividends', x: 0, y: 40, w: 5, h: 8, minW: 5, minH: 6 },
    { i: 'dividend-forecast', x: 5, y: 40, w: 5, h: 8, minW: 4, minH: 6 },
    { i: 'holdings', x: 0, y: 48, w: 10, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 0, y: 58, w: 5, h: 5, minW: 3, minH: 4 },
    { i: 'currency', x: 5, y: 58, w: 5, h: 5, minW: 3, minH: 4 },
    { i: 'simulator', x: 0, y: 63, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'goals', x: 5, y: 63, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'news', x: 0, y: 72, w: 6, h: 7, minW: 4, minH: 5 },
    { i: 'ai-insights', x: 6, y: 72, w: 4, h: 7, minW: 3, minH: 4 },
    { i: 'smart-alerts', x: 0, y: 79, w: 5, h: 7, minW: 3, minH: 5 },
    { i: 'monthly-report', x: 5, y: 79, w: 5, h: 7, minW: 3, minH: 5 },
    { i: 'smart-contribution', x: 0, y: 86, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'ceiling-price', x: 5, y: 86, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'profitability', x: 0, y: 95, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'backtesting', x: 5, y: 95, w: 5, h: 9, minW: 4, minH: 6 },
    { i: 'asset-scoring', x: 0, y: 104, w: 10, h: 12, minW: 4, minH: 8 },
    { i: 'fixed-income', x: 0, y: 116, w: 10, h: 12, minW: 4, minH: 8 },
    { i: 'benchmark-chart', x: 0, y: 128, w: 10, h: 8, minW: 6, minH: 6 },
    { i: 'ai-advisor', x: 0, y: 136, w: 5, h: 12, minW: 4, minH: 8 },
    { i: 'ai-risk', x: 5, y: 136, w: 5, h: 12, minW: 4, minH: 8 },
  ],
  sm: [
    { i: 'summary', x: 0, y: 0, w: 6, h: 4, minW: 6, minH: 3 },
    { i: 'health-score', x: 0, y: 4, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'portfolio-chart', x: 0, y: 12, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'portfolio-history', x: 0, y: 19, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'allocation', x: 0, y: 27, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'rebalance', x: 0, y: 34, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'correlation', x: 0, y: 41, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'performance', x: 0, y: 48, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'dividends', x: 0, y: 55, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'dividend-forecast', x: 0, y: 63, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'holdings', x: 0, y: 71, w: 6, h: 10, minW: 6, minH: 6 },
    { i: 'alerts', x: 0, y: 81, w: 6, h: 5, minW: 6, minH: 4 },
    { i: 'currency', x: 0, y: 86, w: 6, h: 5, minW: 6, minH: 4 },
    { i: 'simulator', x: 0, y: 91, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'goals', x: 0, y: 100, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'news', x: 0, y: 109, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'ai-insights', x: 0, y: 116, w: 6, h: 5, minW: 6, minH: 4 },
    { i: 'smart-alerts', x: 0, y: 121, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'monthly-report', x: 0, y: 128, w: 6, h: 7, minW: 6, minH: 5 },
    { i: 'smart-contribution', x: 0, y: 135, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'ceiling-price', x: 0, y: 144, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'profitability', x: 0, y: 153, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'backtesting', x: 0, y: 162, w: 6, h: 9, minW: 6, minH: 6 },
    { i: 'asset-scoring', x: 0, y: 171, w: 6, h: 12, minW: 6, minH: 8 },
    { i: 'fixed-income', x: 0, y: 183, w: 6, h: 12, minW: 6, minH: 8 },
    { i: 'benchmark-chart', x: 0, y: 195, w: 6, h: 8, minW: 6, minH: 6 },
    { i: 'ai-advisor', x: 0, y: 203, w: 6, h: 12, minW: 6, minH: 8 },
    { i: 'ai-risk', x: 0, y: 215, w: 6, h: 12, minW: 6, minH: 8 },
  ],
};

function loadLayouts(): any {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Check if saved layout has all required keys
      const requiredKeys = defaultLayouts.lg.map((l: any) => l.i);
      const savedKeys = (parsed.lg || []).map((l: any) => l.i);
      const hasAll = requiredKeys.every((k: string) => savedKeys.includes(k));
      if (hasAll) return parsed;
    }
  } catch {}
  return defaultLayouts;
}

const Index = () => {
  const isMobile = useIsMobile();
  const { assets, holdings, loading, error, lastUpdate, nextUpdate, refresh, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { snapshots, loading: snapshotsLoading, saveSnapshot } = usePortfolioSnapshots();

  // Save snapshot when assets are loaded
  useEffect(() => {
    if (assets.length > 0 && !loading) {
      saveSnapshot(assets);
    }
  }, [assets, loading, saveSnapshot]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('resumo');
  const [layouts, setLayouts] = useState(loadLayouts);
  const [locked, setLocked] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleLayoutChange = useCallback((_: any, allLayouts: any) => {
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
      <div className="px-4 sm:px-6 lg:px-8 space-y-4">
        <div className="pt-4">
          <LicenseAlert />
        </div>
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
            {!isMobile && (
              <>
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
              </>
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
          <div className="pb-12" ref={containerRef}>
            {isMobile ? (
              <MobileDashboardTabs activeTab={mobileTab} onTabChange={setMobileTab} />
              <div className="flex flex-col gap-3 mt-3">
                {/* Resumo */}
                {mobileTab === 'resumo' && (
                  <>
                    <MobilePanel title="" noPadding><PortfolioSummary assets={assets} lastUpdate={lastUpdate} nextUpdate={nextUpdate} /></MobilePanel>
                    <MobilePanel title="Saúde da Carteira"><HealthScorePanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Evolução Patrimonial"><PortfolioChart assets={assets} /></MobilePanel>
                    <MobilePanel title="Histórico Patrimonial"><PortfolioHistoryChart snapshots={snapshots} loading={snapshotsLoading} /></MobilePanel>
                  </>
                )}
                {/* Carteira */}
                {mobileTab === 'carteira' && (
                  <>
                    <MobilePanel title="Carteira">
                      <HoldingsTable
                        assets={assets}
                        holdings={holdings}
                        loading={loading}
                        onAdd={() => { setEditingHolding(null); setModalOpen(true); }}
                        onEdit={handleEdit}
                        onDelete={deleteHolding}
                      />
                    </MobilePanel>
                    <MobilePanel title="Alocação"><AllocationChart assets={assets} /></MobilePanel>
                    <MobilePanel title="Dividendos"><DividendsPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Renda Fixa"><FixedIncomePanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Câmbio"><CurrencyDashboard /></MobilePanel>
                  </>
                )}
                {/* Análise */}
                {mobileTab === 'analise' && (
                  <>
                    <MobilePanel title="Performance"><PerformanceChart assets={assets} /></MobilePanel>
                    <MobilePanel title="Correlação"><CorrelationHeatmap assets={assets} /></MobilePanel>
                    <MobilePanel title="Benchmarks"><BenchmarkChart snapshots={snapshots} /></MobilePanel>
                    <MobilePanel title="Rentabilidade"><ProfitabilityPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Backtesting"><BacktestingPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Preço Teto"><CeilingPricePanel assets={assets} /></MobilePanel>
                  </>
                )}
                {/* IA */}
                {mobileTab === 'ia' && (
                  <>
                    <MobilePanel title="Consultor IA"><AIAdvisorPanel assets={assets} cashBalance={0} /></MobilePanel>
                    <MobilePanel title="Análise de Risco IA"><AIRiskPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="IA Insights"><AIInsightsPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Rebalanceamento IA"><RebalancePanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Scoring IA"><AssetScoringPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Projeção Dividendos IA"><DividendForecastPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Notícias IA"><NewsPanel assets={assets} /></MobilePanel>
                  </>
                )}
                {/* Alertas */}
                {mobileTab === 'alertas' && (
                  <>
                    <MobilePanel title="Alertas"><AlertsPanel /></MobilePanel>
                    <MobilePanel title="Alertas Inteligentes"><SmartAlertsPanel assets={assets} /></MobilePanel>
                  </>
                )}
                {/* Mais */}
                {mobileTab === 'mais' && (
                  <>
                    <MobilePanel title="Simulador E se?"><SimulatorPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Metas"><GoalsPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Aporte Inteligente"><SmartContributionPanel assets={assets} /></MobilePanel>
                    <MobilePanel title="Relatório Mensal"><MonthlyReportPanel assets={assets} /></MobilePanel>
                  </>
                )}
              </div>
            ) : (
            <ResponsiveGrid
              className="layout"
              width={containerWidth}
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
                  <PortfolioSummary assets={assets} lastUpdate={lastUpdate} nextUpdate={nextUpdate} />
                </DashboardPanel>
              </div>
              <div key="health-score">
                <DashboardPanel title="Saúde da Carteira" locked={locked}>
                  <HealthScorePanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="portfolio-chart">
                <DashboardPanel title="Evolução Patrimonial" locked={locked}>
                  <PortfolioChart assets={assets} />
                </DashboardPanel>
              </div>
              <div key="portfolio-history">
                <DashboardPanel title="Histórico Patrimonial (Real)" locked={locked}>
                  <PortfolioHistoryChart snapshots={snapshots} loading={snapshotsLoading} />
                </DashboardPanel>
              </div>
              <div key="allocation">
                <DashboardPanel title="Alocação" locked={locked}>
                  <AllocationChart assets={assets} />
                </DashboardPanel>
              </div>
              <div key="rebalance">
                <DashboardPanel title="Rebalanceamento IA" locked={locked}>
                  <RebalancePanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="correlation">
                <DashboardPanel title="Correlação" locked={locked}>
                  <CorrelationHeatmap assets={assets} />
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
              <div key="dividend-forecast">
                <DashboardPanel title="Projeção de Dividendos IA" locked={locked}>
                  <DividendForecastPanel assets={assets} />
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
              <div key="currency">
                <DashboardPanel title="Câmbio" locked={locked}>
                  <CurrencyDashboard />
                </DashboardPanel>
              </div>
              <div key="simulator">
                <DashboardPanel title="Simulador E se?" locked={locked}>
                  <SimulatorPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="goals">
                <DashboardPanel title="Metas" locked={locked}>
                  <GoalsPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="news">
                <DashboardPanel title="Notícias IA" locked={locked}>
                  <NewsPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="ai-insights">
                <DashboardPanel title="IA Insights" locked={locked}>
                  <AIInsightsPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="smart-alerts">
                <DashboardPanel title="Alertas Inteligentes" locked={locked}>
                  <SmartAlertsPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="monthly-report">
                <DashboardPanel title="Relatório Mensal" locked={locked}>
                  <MonthlyReportPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="smart-contribution">
                <DashboardPanel title="Aporte Inteligente" locked={locked}>
                  <SmartContributionPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="ceiling-price">
                <DashboardPanel title="Preço Teto (Bazin/Graham)" locked={locked}>
                  <CeilingPricePanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="profitability">
                <DashboardPanel title="Rentabilidade vs Benchmarks" locked={locked}>
                  <ProfitabilityPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="backtesting">
                <DashboardPanel title="Backtesting Histórico" locked={locked}>
                  <BacktestingPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="asset-scoring">
                <DashboardPanel title="Scoring IA de Ativos" locked={locked}>
                  <AssetScoringPanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="fixed-income">
                <DashboardPanel title="Resumo Renda Fixa" locked={locked}>
                  <FixedIncomePanel assets={assets} />
                </DashboardPanel>
              </div>
              <div key="benchmark-chart">
                <DashboardPanel title="Carteira vs Benchmarks (CDI/IBOV/Dólar)" locked={locked}>
                  <BenchmarkChart snapshots={snapshots} />
                </DashboardPanel>
              </div>
              <div key="ai-advisor">
                <DashboardPanel title="Consultor IA de Investimentos" locked={locked}>
                  <AIAdvisorPanel assets={assets} cashBalance={0} />
                </DashboardPanel>
              </div>
              <div key="ai-risk">
                <DashboardPanel title="Análise de Risco IA" locked={locked}>
                  <AIRiskPanel assets={assets} />
                </DashboardPanel>
              </div>
            </ResponsiveGrid>
            )}
          </div>
        )}
      </div>

      {/* Floating AI Chatbot */}
      <DashboardChatbot assets={assets} />

      {/* Onboarding */}
      <OnboardingOverlay />

      <HoldingModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={addHolding}
        editData={editingHolding}
        onUpdate={updateHolding}
        assets={assets}
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
    <div className={`h-full w-full flex flex-col rounded-xl border border-border bg-card overflow-hidden transition-shadow ${
      !locked ? 'ring-1 ring-primary/10 shadow-lg shadow-primary/5' : 'shadow-sm'
    }`}>
      {!locked && title && (
        <div className="drag-handle cursor-grab active:cursor-grabbing bg-muted/60 border-b border-border px-3 py-1.5 flex items-center gap-2 shrink-0">
          <div className="flex gap-0.5">
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{title}</span>
        </div>
      )}
      <div className={`flex-1 overflow-auto ${noPadding ? '' : ''}`}>{children}</div>
    </div>
  );
}

function MobilePanel({ children, title, noPadding }: {
  children: React.ReactNode;
  title: string;
  noPadding?: boolean;
}) {
  return (
    <div className="w-full flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {title && (
        <div className="bg-muted/60 border-b border-border px-3 py-2 shrink-0">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{title}</span>
        </div>
      )}
      <div className={`overflow-auto ${noPadding ? '' : ''}`}>{children}</div>
    </div>
  );
}

export default Index;
