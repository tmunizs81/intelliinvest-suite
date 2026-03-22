import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import { useAutoBackup } from '@/hooks/useAutoBackup';

export default function AppLayout() {
  useAutoBackup();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pt-14 md:pt-0 md:ml-16 lg:ml-56 transition-all duration-300">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
