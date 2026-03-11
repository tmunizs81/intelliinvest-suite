import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-16 lg:ml-56 transition-all duration-300">
        <Outlet />
      </main>
    </div>
  );
}
