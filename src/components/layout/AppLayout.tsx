import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      {/* pt-14 on mobile for the top bar, md:pt-0 for desktop. ml-0 on mobile, ml-16/56 on desktop */}
      <main className="pt-14 md:pt-0 md:ml-16 lg:ml-56 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
