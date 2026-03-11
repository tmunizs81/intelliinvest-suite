import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook that checks on each session if the daily backup has already been done.
 * If not, triggers the daily-backup edge function for the current user.
 * Runs once per session (not on every render).
 */
export function useAutoBackup() {
  const { user } = useAuth();
  const triggered = useRef(false);

  useEffect(() => {
    if (!user || triggered.current) return;
    triggered.current = true;

    const checkAndBackup = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const startOfDay = `${today}T00:00:00.000Z`;
        const endOfDay = `${today}T23:59:59.999Z`;

        const { data: existing } = await supabase
          .from('backups')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay)
          .eq('backup_type', 'auto')
          .limit(1);

        if (existing && existing.length > 0) return; // Already backed up today

        // Trigger backup in background (don't await to avoid blocking UI)
        supabase.functions.invoke('daily-backup', {
          body: { userId: user.id },
        }).catch(() => {
          // Silent fail — backup is non-critical
        });
      } catch {
        // Silent fail
      }
    };

    checkAndBackup();
  }, [user]);
}
