import { useState, useEffect, lazy, Suspense, useMemo, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import DashboardTabs, { type DashboardTab } from '@/components/dashboard/DashboardTabs';
import { AnimatePresence, motion } from 'framer-motion';

import LicenseAlert from '@/components/dashboard/LicenseAlert';
import HoldingModal from '@/components/dashboard/HoldingModal';
import DashboardChatbot from '@/components/dashboard/DashboardChatbot';
import OnboardingOverlay from '@/components/OnboardingOverlay';
import KioskMode from '@/components/dashboard/KioskMode';
import { DashboardSkeleton } from '@/components/ui/skeleton-card';

import { usePortfolio, type HoldingRow } from '@/hooks/usePortfolio';
import { usePortfolioSnapshots } from '@/hooks/usePortfolioSnapshots';
import { usePrivacyModeProvider, PrivacyContext } from '@/hooks/usePrivacyMode';
import { Loader2, Eye, EyeOff, Maximize, Camera } from 'lucide-react';
import { toast } from 'sonner';

// Lazy load tab components for code splitting
const TabResumo = lazy(() => import('@/components/dashboard/tabs/TabResumo'));
const TabCarteira = lazy(() => import('@/components/dashboard/tabs/TabCarteira'));
const TabAnalise = lazy(() => import('@/components/dashboard/tabs/TabAnalise'));
const TabIA = lazy(() => import('@/components/dashboard/tabs/TabIA'));
const TabAlertas = lazy(() => import('@/components/dashboard/tabs/TabAlertas'));
const TabMais = lazy(() => import('@/components/dashboard/tabs/TabMais'));

const TabFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const Index = () => {
  const isMobile = useIsMobile();
  const { assets, holdings, loading, error, lastUpdate, nextUpdate, refresh, addHolding, updateHolding, deleteHolding } = usePortfolio();
  const { snapshots, loading: snapshotsLoading, saveSnapshot, loadSnapshots } = usePortfolioSnapshots();
  const { privacyMode, togglePrivacy, blurValue, PrivacyContext: Ctx } = usePrivacyModeProvider();

  useEffect(() => {
    if (assets.length > 0 && !loading) {
      saveSnapshot(assets);
    }
  }, [assets, loading, saveSnapshot]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<HoldingRow | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('resumo');
  const [kioskMode, setKioskMode] = useState(false);

  const handleEdit = (holding: HoldingRow) => {
    setEditingHolding(holding);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingHolding(null);
  };

  if (kioskMode) {
    return <KioskMode assets={assets} onClose={() => setKioskMode(false)} />;
  }

  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy, blurValue }}>
      <div className={`min-h-screen bg-background ${privacyMode ? 'privacy-blur' : ''}`}>
        <div className="px-4 sm:px-6 lg:px-8 space-y-4">
          <div className="pt-4">
            <LicenseAlert />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-muted-foreground">
                Controle inteligente de investimentos
                {lastUpdate && (
                  <span className="ml-2 text-xs">
                    • Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={togglePrivacy}
                title={privacyMode ? 'Mostrar valores' : 'Ocultar valores'}
                className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {!isMobile && (
                <button
                  onClick={() => setKioskMode(true)}
                  title="Modo Kiosk / TV"
                  className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  <Maximize className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={async () => {
                  if (assets.length === 0) {
                    toast.error('Nenhum ativo na carteira');
                    return;
                  }
                  await saveSnapshot(assets);
                  await loadSnapshots();
                  toast.success('Snapshot patrimonial atualizado!');
                }}
                title="Atualizar snapshot patrimonial"
                className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={() => refresh()}
                className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
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
            <div className="pb-12">
              <DashboardTabs activeTab={activeTab} onTabChange={setActiveTab} isMobile={isMobile} />

              <div className="mt-4 animate-fade-in" key={activeTab}>
                <div className={isMobile ? 'flex flex-col gap-3' : 'space-y-6'}>
                  <Suspense fallback={<TabFallback />}>
                    {activeTab === 'resumo' && (
                      <TabResumo
                        assets={assets}
                        lastUpdate={lastUpdate}
                        nextUpdate={nextUpdate}
                        snapshots={snapshots}
                        snapshotsLoading={snapshotsLoading}
                        isMobile={isMobile}
                      />
                    )}
                    {activeTab === 'carteira' && (
                      <TabCarteira
                        assets={assets}
                        holdings={holdings}
                        loading={loading}
                        isMobile={isMobile}
                        onAdd={() => { setEditingHolding(null); setModalOpen(true); }}
                        onEdit={handleEdit}
                        onDelete={deleteHolding}
                      />
                    )}
                    {activeTab === 'analise' && (
                      <TabAnalise
                        assets={assets}
                        snapshots={snapshots}
                        isMobile={isMobile}
                      />
                    )}
                    {activeTab === 'ia' && (
                      <TabIA assets={assets} isMobile={isMobile} />
                    )}
                    {activeTab === 'alertas' && (
                      <TabAlertas assets={assets} isMobile={isMobile} />
                    )}
                    {activeTab === 'mais' && (
                      <TabMais assets={assets} isMobile={isMobile} />
                    )}
                  </Suspense>
                </div>
              </div>
            </div>
          )}
        </div>

        <DashboardChatbot assets={assets} />
        <OnboardingOverlay />

        <HoldingModal
          open={modalOpen}
          onClose={handleCloseModal}
          onSave={addHolding}
          editData={editingHolding}
          onUpdate={updateHolding}
          assets={assets}
        />
      </div>
    </PrivacyContext.Provider>
  );
};

export default Index;
