import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import VersionFooter from './VersionFooter';
import MarketClocks from './MarketClocks';
import CurrencyTicker from './CurrencyTicker';
import { useAutoBackup } from '@/hooks/useAutoBackup';
import { CurrencyToggle, DisplayCurrencyProvider } from '@/hooks/useDisplayCurrency';

export default function AppLayout() {
  useAutoBackup();

  return (
    <DisplayCurrencyProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <Sidebar />
        <div className="hidden md:flex justify-center items-center gap-3 pt-3 md:ml-16 lg:ml-56 transition-all duration-300">
          <MarketClocks />
          <CurrencyTicker />
          <CurrencyToggle />
        </div>
        <main className="flex-1 pt-14 md:pt-2 md:ml-16 lg:ml-56 transition-all duration-300">
          <Outlet />
        </main>
        <div className="md:ml-16 lg:ml-56 transition-all duration-300">
          <VersionFooter />
        </div>
      </div>
    </DisplayCurrencyProvider>
  );
}
