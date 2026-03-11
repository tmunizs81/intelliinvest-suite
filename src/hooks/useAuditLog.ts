import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
    try {
      await supabase.from('audit_logs' as any).insert({
        user_id: user.id,
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        details: details || {},
      } as any);
    } catch (err) {
      console.error('Audit log error:', err);
    }
  }, [user]);

  return { log };
}
