import DashboardHeader from '@/components/dashboard/DashboardHeader';
import PortfolioSummary from '@/components/dashboard/PortfolioSummary';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import AllocationChart from '@/components/dashboard/AllocationChart';
import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <DashboardHeader />

        <div className="space-y-6 pb-12">
          <PortfolioSummary />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PortfolioChart />
            </div>
            <div>
              <AllocationChart />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <HoldingsTable />
            </div>
            <div>
              <AIInsightsPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
