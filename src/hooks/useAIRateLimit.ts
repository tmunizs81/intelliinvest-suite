import { useRef, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

const MIN_INTERVAL_MS = 10_000; // 10 seconds between AI calls
const MAX_CALLS_PER_MINUTE = 4;

interface CallRecord {
  timestamp: number;
}

/**
 * Hook for rate-limiting AI edge function calls on the client side.
 * Returns a `guardedInvoke` wrapper that checks throttle before calling.
 */
export function useAIRateLimit() {
  const callLog = useRef<CallRecord[]>([]);

  const canCall = useCallback((): boolean => {
    const now = Date.now();
    // Clean old entries (older than 60s)
    callLog.current = callLog.current.filter(c => now - c.timestamp < 60_000);

    // Check per-minute limit
    if (callLog.current.length >= MAX_CALLS_PER_MINUTE) {
      toast({
        title: 'Limite de requisições',
        description: 'Aguarde um momento antes de fazer novas consultas à IA.',
        variant: 'destructive',
      });
      return false;
    }

    // Check minimum interval
    const lastCall = callLog.current[callLog.current.length - 1];
    if (lastCall && now - lastCall.timestamp < MIN_INTERVAL_MS) {
      toast({
        title: 'Aguarde',
        description: `Aguarde ${Math.ceil((MIN_INTERVAL_MS - (now - lastCall.timestamp)) / 1000)}s antes da próxima consulta.`,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, []);

  const recordCall = useCallback(() => {
    callLog.current.push({ timestamp: Date.now() });
  }, []);

  return { canCall, recordCall };
}
