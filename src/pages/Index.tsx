import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import DashboardTabs, { type DashboardTab } from '@/components/dashboard/DashboardTabs';

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
import { Loader2 } from 'lucide-react';

const Index = () => {
  const isMobile = useIsMobile();
  const { assets, holdings, loading, error, lastUpdate, nextUpdate, refresh, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { snapshots, loading: snapshotsLoading, saveSnapshot } = usePortfolioSnapshots();

  useEffect(() => {
    if (assets.length > 0 && !loading) {
      saveSnapshot(assets);
    }
  }, [assets, loading, saveSnapshot]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('resumo');

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

        {/* Header */}
        <div className="flex items-center justify-between py-3">
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
          <button
            onClick={() => refresh()}
            className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
          >
            <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
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
            <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} isMobile={isMobile} />

            <div className={`mt-4 ${isMobile ? 'flex flex-col gap-3' : 'space-y-6'}`}>
              {activeTab === 'resumo' && (
                <TabResumo
                  assets={assets}
                  lastUpdate={lastUpdate}
                  nextUpdate={nextUpdate}
                  snapshots={snapshots}
                  snapshotsLoading={snapshotsLoading}
                  isMobile={isMobile}
                />
              )}
              {activeTab === 'carteira' && (
                <TabCarteira
                  assets={assets}
                  holdings={holdings}
                  loading={loading}
                  isMobile={isMobile}
                  onAdd={() => { setEditingHolding(null); setModalOpen(true); }}
                  onEdit={handleEdit}
                  onDelete={deleteHolding}
                />
              )}
              {activeTab === 'analise' && (
                <TabAnalise
                  assets={assets}
                  snapshots={snapshots}
                  isMobile={isMobile}
                />
              )}
              {activeTab === 'ia' && (
                <TabIA assets={assets} isMobile={isMobile} />
              )}
              {activeTab === 'alertas' && (
                <TabAlertas assets={assets} isMobile={isMobile} />
              )}
              {activeTab === 'mais' && (
                <TabMais assets={assets} isMobile={isMobile} />
              )}
            </div>
          </div>
        )}
      </div>

      <DashboardChatbot assets={assets} />
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

// ===== Panel wrapper =====
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
      <div className={`flex-1 overflow-auto ${noPadding ? '' : ''}`}>{children}</div>
    </div>
  );
}

// ===== Grid helpers =====
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>;
}
function Grid3({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

// ===== Tab: Resumo =====
function TabResumo({ assets, lastUpdate, nextUpdate, snapshots, snapshotsLoading, isMobile }: any) {
  return (
    <>
      <Panel noPadding>
        <PortfolioSummary assets={assets} lastUpdate={lastUpdate} nextUpdate={nextUpdate} />
      </Panel>
      {isMobile ? (
        <>
          <Panel title="Saúde da Carteira"><HealthScorePanel assets={assets} /></Panel>
          <Panel title="Evolução Patrimonial"><PortfolioChart assets={assets} /></Panel>
          <Panel title="Histórico Patrimonial"><PortfolioHistoryChart snapshots={snapshots} loading={snapshotsLoading} /></Panel>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Saúde da Carteira"><HealthScorePanel assets={assets} /></Panel>
            <Panel title="Evolução Patrimonial" className="lg:col-span-2"><PortfolioChart assets={assets} /></Panel>
          </div>
          <Panel title="Histórico Patrimonial (Real)"><PortfolioHistoryChart snapshots={snapshots} loading={snapshotsLoading} /></Panel>
        </>
      )}
    </>
  );
}

// ===== Tab: Carteira =====
function TabCarteira({ assets, holdings, loading, isMobile, onAdd, onEdit, onDelete }: any) {
  return (
    <>
      <Panel title="Meus Ativos">
        <HoldingsTable
          assets={assets}
          holdings={holdings}
          loading={loading}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </Panel>
      {isMobile ? (
        <>
          <Panel title="Alocação"><AllocationChart assets={assets} /></Panel>
          <Panel title="Dividendos"><DividendsPanel assets={assets} /></Panel>
          <Panel title="Renda Fixa"><FixedIncomePanel assets={assets} /></Panel>
          <Panel title="Câmbio"><CurrencyDashboard /></Panel>
        </>
      ) : (
        <>
          <Grid3>
            <Panel title="Alocação"><AllocationChart assets={assets} /></Panel>
            <Panel title="Dividendos"><DividendsPanel assets={assets} /></Panel>
            <Panel title="Câmbio"><CurrencyDashboard /></Panel>
          </Grid3>
          <Panel title="Resumo Renda Fixa"><FixedIncomePanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}

// ===== Tab: Análise =====
function TabAnalise({ assets, snapshots, isMobile }: any) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Performance"><PerformanceChart assets={assets} /></Panel>
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
            <Panel title="Correlação"><CorrelationHeatmap assets={assets} /></Panel>
            <Panel title="Rentabilidade vs Benchmarks"><ProfitabilityPanel assets={assets} /></Panel>
          </Grid2>
          <Panel title="Carteira vs Benchmarks (CDI/IBOV/Dólar)"><BenchmarkChart snapshots={snapshots} /></Panel>
          <Grid2>
            <Panel title="Backtesting Histórico"><BacktestingPanel assets={assets} /></Panel>
            <Panel title="Preço Teto (Bazin/Graham)"><CeilingPricePanel assets={assets} /></Panel>
          </Grid2>
        </>
      )}
    </>
  );
}

// ===== Tab: IA =====
function TabIA({ assets, isMobile }: any) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Consultor IA"><AIAdvisorPanel assets={assets} cashBalance={0} /></Panel>
          <Panel title="Análise de Risco IA"><AIRiskPanel assets={assets} /></Panel>
          <Panel title="IA Insights"><AIInsightsPanel assets={assets} /></Panel>
          <Panel title="Rebalanceamento IA"><RebalancePanel assets={assets} /></Panel>
          <Panel title="Scoring IA"><AssetScoringPanel assets={assets} /></Panel>
          <Panel title="Projeção Dividendos IA"><DividendForecastPanel assets={assets} /></Panel>
          <Panel title="Notícias IA"><NewsPanel assets={assets} /></Panel>
        </>
      ) : (
        <>
          <Grid2>
            <Panel title="Consultor IA de Investimentos"><AIAdvisorPanel assets={assets} cashBalance={0} /></Panel>
            <Panel title="Análise de Risco IA"><AIRiskPanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="IA Insights"><AIInsightsPanel assets={assets} /></Panel>
            <Panel title="Rebalanceamento IA"><RebalancePanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Scoring IA de Ativos"><AssetScoringPanel assets={assets} /></Panel>
            <Panel title="Projeção de Dividendos IA"><DividendForecastPanel assets={assets} /></Panel>
          </Grid2>
          <Panel title="Notícias IA"><NewsPanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}

// ===== Tab: Alertas =====
function TabAlertas({ assets, isMobile }: any) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Alertas"><AlertsPanel /></Panel>
          <Panel title="Alertas Inteligentes"><SmartAlertsPanel assets={assets} /></Panel>
        </>
      ) : (
        <Grid2>
          <Panel title="Alertas de Preço"><AlertsPanel /></Panel>
          <Panel title="Alertas Inteligentes"><SmartAlertsPanel assets={assets} /></Panel>
        </Grid2>
      )}
    </>
  );
}

// ===== Tab: Mais =====
function TabMais({ assets, isMobile }: any) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Simulador E se?"><SimulatorPanel assets={assets} /></Panel>
          <Panel title="Metas"><GoalsPanel assets={assets} /></Panel>
          <Panel title="Aporte Inteligente"><SmartContributionPanel assets={assets} /></Panel>
          <Panel title="Relatório Mensal"><MonthlyReportPanel assets={assets} /></Panel>
        </>
      ) : (
        <>
          <Grid2>
            <Panel title="Simulador E se?"><SimulatorPanel assets={assets} /></Panel>
            <Panel title="Metas de Investimento"><GoalsPanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Aporte Inteligente"><SmartContributionPanel assets={assets} /></Panel>
            <Panel title="Relatório Mensal"><MonthlyReportPanel assets={assets} /></Panel>
          </Grid2>
        </>
      )}
    </>
  );
}

export default Index;
