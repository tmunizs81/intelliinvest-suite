import DashboardHeader from '@/components/dashboard/DashboardHeader';
import PortfolioSummary from '@/components/dashboard/PortfolioSummary';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import AllocationChart from '@/components/dashboard/AllocationChart';
import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import { usePortfolio } from '@/hooks/usePortfolio';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { assets, loading, error, lastUpdate, refresh } = usePortfolio();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <DashboardHeader onRefresh={refresh} lastUpdate={lastUpdate} />

        {error && (
          <div className="mb-4 rounded-lg border border-loss/30 bg-loss/5 p-4 text-sm text-loss-foreground animate-fade-in">
            ⚠️ {error} — Usando últimos dados disponíveis.
          </div>
        )}

        {loading && assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Buscando cotações do Yahoo Finance...</p>
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            <PortfolioSummary assets={assets} lastUpdate={lastUpdate} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <PortfolioChart assets={assets} />
              </div>
              <div>
                <AllocationChart assets={assets} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <HoldingsTable assets={assets} loading={loading} />
              </div>
              <div>
                <AIInsightsPanel assets={assets} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
