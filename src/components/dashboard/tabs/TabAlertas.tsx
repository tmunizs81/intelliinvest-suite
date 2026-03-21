import { type Asset } from '@/lib/mockData';

import AlertsPanel from '@/components/dashboard/AlertsPanel';
import SmartAlertsPanel from '@/components/dashboard/SmartAlertsPanel';

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

export default function TabAlertas({ assets, isMobile }: Props) {
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
