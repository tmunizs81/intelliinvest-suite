import { Bell, Settings, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function DashboardHeader() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  return (
    <header className="flex items-center justify-between py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Invest<span className="text-primary">AI</span>
        </h1>
        <p className="text-sm text-muted-foreground">Controle inteligente de investimentos</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
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
