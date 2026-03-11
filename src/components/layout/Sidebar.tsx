import { NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Briefcase, BarChart3, LogOut, User,
  ChevronLeft, ChevronRight, TrendingUp, Brain, Calculator,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ai-trader', label: 'AI Pro Trader', icon: Brain },
  { to: '/taxes', label: 'Impostos', icon: Calculator },
  { to: '/assets', label: 'Meus Ativos', icon: Briefcase },
  { to: '/analysis', label: 'Análise Avançada', icon: BarChart3 },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-border bg-card transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-16 border-b border-border shrink-0">
        <TrendingUp className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">
            Invest<span className="text-primary">AI</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`
            }
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground truncate">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{user?.email}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={signOut}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all ${
              collapsed ? 'w-full justify-center' : 'flex-1'
            }`}
            title="Sair"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
