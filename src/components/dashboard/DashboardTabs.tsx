import { LayoutDashboard, BarChart3, Brain, Briefcase, Bell, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

export const dashboardTabs = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'carteira', label: 'Carteira', icon: Briefcase },
  { id: 'analise', label: 'Análise', icon: BarChart3 },
  { id: 'ia', label: 'IA', icon: Brain },
  { id: 'alertas', label: 'Alertas', icon: Bell },
  { id: 'mais', label: 'Mais', icon: Settings2 },
] as const;

export type DashboardTab = typeof dashboardTabs[number]['id'];

interface Props {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  isMobile?: boolean;
}

export default function DashboardTabs({ activeTab, onTabChange, isMobile }: Props) {
  if (isMobile) {
    return (
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-1">
        <div className="flex overflow-x-auto no-scrollbar">
          {dashboardTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-2 min-w-[60px] text-[10px] font-medium transition-colors active:scale-95 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="mobile-tab-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-1 px-1 py-1">
        {dashboardTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.97] ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="desktop-tab-bg"
                  className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-lg"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className={`h-4 w-4 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
