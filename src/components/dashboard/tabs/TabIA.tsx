import { type Asset } from '@/lib/mockData';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';

import AIAdvisorPanel from '@/components/dashboard/AIAdvisorPanel';
import AIRiskPanel from '@/components/dashboard/AIRiskPanel';
import PatternDetectorPanel from '@/components/dashboard/PatternDetectorPanel';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import RebalancePanel from '@/components/dashboard/RebalancePanel';
import AssetScoringPanel from '@/components/dashboard/AssetScoringPanel';
import DividendForecastPanel from '@/components/dashboard/DividendForecastPanel';
import NewsPanel from '@/components/dashboard/NewsPanel';
import IRAssistantPanel from '@/components/dashboard/IRAssistantPanel';

interface Props {
  assets: Asset[];
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

export default function TabIA({ assets, isMobile }: Props) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Consultor IA"><AIAdvisorPanel assets={assets} cashBalance={0} /></Panel>
          <Panel title="Análise de Risco IA"><AIRiskPanel assets={assets} /></Panel>
          <Panel title="Padrões Gráficos IA"><PatternDetectorPanel assets={assets} /></Panel>
          <Panel title="IA Insights"><AIInsightsPanel assets={assets} /></Panel>
          <Panel title="Rebalanceamento IA"><RebalancePanel assets={assets} /></Panel>
          <Panel title="Scoring IA"><AssetScoringPanel assets={assets} /></Panel>
          <Panel title="Projeção Dividendos IA"><DividendForecastPanel assets={assets} /></Panel>
          <Panel title="Notícias IA"><NewsPanel assets={assets} /></Panel>
          <Panel title="Assistente IR"><IRAssistantPanel assets={assets} /></Panel>
        </>
      ) : (
        <>
          <Grid2>
            <Panel title="Consultor IA de Investimentos"><AIAdvisorPanel assets={assets} cashBalance={0} /></Panel>
            <Panel title="Análise de Risco IA"><AIRiskPanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="🔍 Detector de Padrões Gráficos"><PatternDetectorPanel assets={assets} /></Panel>
            <Panel title="IA Insights"><AIInsightsPanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Rebalanceamento IA"><RebalancePanel assets={assets} /></Panel>
            <Panel title="Scoring IA de Ativos"><AssetScoringPanel assets={assets} /></Panel>
          </Grid2>
          <Grid2>
            <Panel title="Projeção de Dividendos IA"><DividendForecastPanel assets={assets} /></Panel>
            <Panel title="📋 Assistente de Declaração IR"><IRAssistantPanel assets={assets} /></Panel>
          </Grid2>
          <Panel title="Notícias IA"><NewsPanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}
