import { Bell, Settings, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface Props {
  onRefresh: () => Promise<void>;
  lastUpdate: Date | null;
}

export default function DashboardHeader({ onRefresh, lastUpdate }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <header className="flex items-center justify-between py-6">
      <div className="flex items-center gap-3">
        <img src="/pwa-icon-192.png" alt="T2-Simplynvest" className="h-9 w-9 rounded-lg" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            T2-<span className="text-primary">Simplynvest</span>
          </h1>
        <p className="text-sm text-muted-foreground">
          Controle inteligente de investimentos
          {lastUpdate && (
            <span className="ml-2 text-xs">
              • Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full border-2 border-card" />
        </button>
        <button className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
