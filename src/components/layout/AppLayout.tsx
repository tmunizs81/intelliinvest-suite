import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import VersionFooter from './VersionFooter';
import { useAutoBackup } from '@/hooks/useAutoBackup';

export default function AppLayout() {
  useAutoBackup();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Sidebar />
      <main className="flex-1 pt-14 md:pt-0 md:ml-16 lg:ml-56 transition-all duration-300">
        <Outlet />
      </main>
      <div className="md:ml-16 lg:ml-56 transition-all duration-300">
        <VersionFooter />
      </div>
    </div>
  );
}

