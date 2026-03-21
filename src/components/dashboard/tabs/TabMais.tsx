import { type Asset } from '@/lib/mockData';

import SimulatorPanel from '@/components/dashboard/SimulatorPanel';
import GoalsPanel from '@/components/dashboard/GoalsPanel';
import SmartContributionPanel from '@/components/dashboard/SmartContributionPanel';
import MonthlyReportPanel from '@/components/dashboard/MonthlyReportPanel';
import FiscalReportPanel from '@/components/dashboard/FiscalReportPanel';
import SessionLogPanel from '@/components/dashboard/SessionLogPanel';
import IntegrationsPanel from '@/components/dashboard/IntegrationsPanel';

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
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>;
}

export default function TabMais({ assets, isMobile }: Props) {
  return (
    <>
      {isMobile ? (
        <>
          <Panel title="Simulador E se?"><SimulatorPanel assets={assets} /></Panel>
          <Panel title="Metas"><GoalsPanel assets={assets} /></Panel>
          <Panel title="Aporte Inteligente"><SmartContributionPanel assets={assets} /></Panel>
          <Panel title="Relatório Mensal"><MonthlyReportPanel assets={assets} /></Panel>
          <Panel title="Relatório Fiscal"><FiscalReportPanel assets={assets} /></Panel>
          <Panel title="Sessões Ativas"><SessionLogPanel /></Panel>
          <Panel title="Integrações"><IntegrationsPanel assets={assets} /></Panel>
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
          <Grid2>
            <Panel title="📄 Relatório Fiscal (PDF/CSV)"><FiscalReportPanel assets={assets} /></Panel>
            <Panel title="🔐 Sessões Ativas"><SessionLogPanel /></Panel>
          </Grid2>
          <Panel title="🔗 Integrações (Sheets, Notion, Webhook)"><IntegrationsPanel assets={assets} /></Panel>
        </>
      )}
    </>
  );
}
