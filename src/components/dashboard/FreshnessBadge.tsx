/**
 * FreshnessBadge — mostra "Atualizado há Xmin" e botão "Recalcular agora"
 * com retry/backoff exponencial em caso de falha.
 */
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  lastUpdate: Date | null;
  loading: boolean;
  onRefresh: () => Promise<void> | void;
}

function timeAgo(date: Date | null): string {
  if (!date) return 'nunca';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return 'agora';
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  return `${h}h atrás`;
}

export default function FreshnessBadge({ lastUpdate, loading, onRefresh }: Props) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const stale = lastUpdate ? Date.now() - lastUpdate.getTime() > 10 * 60 * 1000 : true;

  const handleClick = async () => {
    if (busy || loading) return;
    setBusy(true);
    const delays = [0, 1500, 4000, 10_000]; // exponential-ish backoff
    let lastErr: unknown = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
      try {
        await onRefresh();
        toast.success('Cotações atualizadas');
        setBusy(false);
        return;
      } catch (e) {
        lastErr = e;
        if (i < delays.length - 1) toast.warning(`Falha ao atualizar. Tentando novamente...`);
      }
    }
    toast.error(`Não foi possível atualizar: ${(lastErr as Error)?.message ?? 'timeout'}`);
    setBusy(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy || loading}
      title="Recalcular agora"
      className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all ${
        stale
          ? 'border-loss/40 bg-loss/5 text-loss'
          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30'
      }`}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy || loading ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">
        {busy ? 'Atualizando...' : `Atualizado ${timeAgo(lastUpdate)}`}
      </span>
    </button>
  );
}
