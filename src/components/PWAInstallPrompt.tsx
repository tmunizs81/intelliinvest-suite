import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for install prompt (Android/Chrome)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short delay
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show iOS instructions if not installed
    if (ios && !standalone) {
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9999] animate-in slide-in-from-bottom-4 duration-500 md:left-auto md:right-4 md:max-w-sm">
      <div className="rounded-xl border border-border bg-card shadow-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Instalar T2-Simplynvest</p>
              <p className="text-xs text-muted-foreground">
                Acesse como um app nativo no seu celular
              </p>
            </div>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIOS ? (
          <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
            <p className="text-xs font-medium">Para instalar no iPhone/iPad:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Toque no ícone <strong>Compartilhar</strong> (quadrado com seta) no Safari</li>
              <li>Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></li>
              <li>Toque em <strong>"Adicionar"</strong></li>
            </ol>
          </div>
        ) : (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="h-4 w-4" />
            Instalar Agora
          </button>
        )}
      </div>
    </div>
  );
}
