import { useState } from 'react';

import PortfolioSummary from '@/components/dashboard/PortfolioSummary';
import PortfolioChart from '@/components/dashboard/PortfolioChart';
import AllocationChart from '@/components/dashboard/AllocationChart';
import PerformanceChart from '@/components/dashboard/PerformanceChart';
import HoldingsTable from '@/components/dashboard/HoldingsTable';
import AIInsightsPanel from '@/components/dashboard/AIInsightsPanel';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import HoldingModal from '@/components/dashboard/HoldingModal';
import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, LogOut, User } from 'lucide-react';

const Index = () => {
  const { user, signOut } = useAuth();
  const { assets, holdings, loading, error, lastUpdate, refresh, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);

  const handleEdit = (holding: HoldingRow) => {
    setEditingHolding(holding);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingHolding(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Invest<span className="text-primary">AI</span>
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline truncate max-w-[150px]">{user?.email}</span>
            </div>
            <button
              onClick={() => refresh()}
              className="h-9 w-9 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            >
              <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={signOut}
              className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-destructive/30 transition-all flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-loss/30 bg-loss/5 p-4 text-sm text-loss-foreground animate-fade-in">
            ⚠️ {error}
          </div>
        )}

        {loading && assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 animate-fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando carteira...</p>
          </div>
        ) : (
          <div className="space-y-6 pb-12">
            <PortfolioSummary assets={assets} lastUpdate={lastUpdate} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <PortfolioChart assets={assets} />
              </div>
              <div>
                <AllocationChart assets={assets} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <HoldingsTable
                  assets={assets}
                  holdings={holdings}
                  loading={loading}
                  onAdd={() => { setEditingHolding(null); setModalOpen(true); }}
                  onEdit={handleEdit}
                  onDelete={deleteHolding}
                />
              </div>
              <div className="space-y-6">
                <AlertsPanel />
                <AIInsightsPanel assets={assets} />
              </div>
            </div>
          </div>
        )}
      </div>

      <HoldingModal
        open={modalOpen}
        onClose={handleCloseModal}
        onSave={addHolding}
        editData={editingHolding}
        onUpdate={updateHolding}
      />
    </div>
  );
};

export default Index;
