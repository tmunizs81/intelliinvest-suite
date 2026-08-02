import { type Asset } from '@/lib/mockData';
import { PanelErrorBoundary } from '@/components/PanelErrorBoundary';
import EconomicCalendarCarousel from '@/components/dashboard/EconomicCalendarCarousel';

interface Props {
  assets: Asset[];
  isMobile: boolean;
}

export default function TabCalendario({ assets, isMobile }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Calendário Econômico</h2>
      </div>
      
      <PanelErrorBoundary fallbackTitle="Erro no Calendário Econômico">
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <EconomicCalendarCarousel assets={assets} />
        </div>
      </PanelErrorBoundary>

      <div className="bg-muted/30 rounded-lg p-4 border border-dashed border-border mt-4">
        <p className="text-sm text-muted-foreground text-center">
          Acompanhe os principais indicadores macroeconômicos globais que podem afetar sua carteira.
        </p>
      </div>
    </div>
  );
}
