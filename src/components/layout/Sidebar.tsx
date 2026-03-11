import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Briefcase, BarChart3, LogOut, User,
  ChevronLeft, ChevronRight, TrendingUp, Brain, Calculator, DollarSign, Settings,
  Menu, X, FileText,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import ThemeToggle from '@/components/ThemeToggle';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ai-trader', label: 'AI Pro Trader', icon: Brain },
  { to: '/dividends', label: 'Dividendos', icon: DollarSign },
  { to: '/taxes', label: 'Impostos', icon: Calculator },
  { to: '/assets', label: 'Meus Ativos', icon: Briefcase },
  { to: '/reports', label: 'Relatórios', icon: FileText },
  { to: '/analysis', label: 'Análise Avançada', icon: BarChart3 },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-card border-b border-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-9 w-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img src="/pwa-icon-192.png" alt="T2" className="h-6 w-6 rounded" />
          <span className="text-base font-bold tracking-tight">
            T2-<span className="text-primary">Simplynvest</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ThemeToggle />
          <User className="h-3.5 w-3.5" />
          <span className="truncate max-w-[120px]">{user?.email}</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: fixed side, Mobile: slide-over drawer */}
      <aside
        className={`
          fixed top-0 h-screen z-50 flex flex-col border-r border-border bg-card transition-all duration-300
          md:left-0
          ${collapsed ? 'md:w-16' : 'md:w-56'}
          ${mobileOpen ? 'left-0 w-64' : '-left-64 md:left-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14 md:h-16 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <img src="/pwa-icon-192.png" alt="T2" className="h-7 w-7 rounded shrink-0" />
            {(!collapsed || mobileOpen) && (
              <span className="text-lg font-bold tracking-tight">
                T2-<span className="text-primary">Simplynvest</span>
              </span>
            )}
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
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
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3 space-y-2">
          {(!collapsed || mobileOpen) && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground truncate">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user?.email}</span>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={signOut}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all ${
                collapsed && !mobileOpen ? 'w-full justify-center' : 'flex-1'
              }`}
              title="Sair"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {(!collapsed || mobileOpen) && <span>Sair</span>}
            </button>
            {/* Collapse button - desktop only */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex h-8 w-8 rounded-lg items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all shrink-0"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
