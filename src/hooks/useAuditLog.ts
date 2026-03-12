import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function useAuditLog() {
  const { user } = useAuth();

  const log = useCallback(async (
    action: string,
    entityType: string,
    entityId?: string,
    details?: Record<string, any>
  ) => {
    if (!user) return;
    // Audit logs are now server-side only (service_role).
    // Client-side logging is a no-op to avoid RLS errors.
    console.debug(`[audit] ${action} ${entityType}`, entityId, details);
  }, [user]);

  return { log };
}
