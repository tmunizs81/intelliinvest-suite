import { useState } from 'react';
import { LayoutDashboard, BarChart3, Brain, Briefcase, Bell, Settings2 } from 'lucide-react';

const tabs = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard },
  { id: 'carteira', label: 'Carteira', icon: Briefcase },
  { id: 'analise', label: 'Análise', icon: BarChart3 },
  { id: 'ia', label: 'IA', icon: Brain },
  { id: 'alertas', label: 'Alertas', icon: Bell },
  { id: 'mais', label: 'Mais', icon: Settings2 },
] as const;

export type MobileTab = typeof tabs[number]['id'];

interface Props {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

export default function MobileDashboardTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border -mx-4 px-1">
      <div className="flex overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 min-w-[60px] text-[10px] font-medium transition-all border-b-2 ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
