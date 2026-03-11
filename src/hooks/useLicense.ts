import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';

export type LicenseStatus = 'active' | 'paused' | 'frozen' | 'revoked' | 'expired' | 'none';

export function useLicense() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const [status, setStatus] = useState<LicenseStatus>('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStatus('none');
      setLoading(false);
      return;
    }

    if (roleLoading) {
      setLoading(true);
      return;
    }

    // Admins always have access
    if (isAdmin) {
      setStatus('active');
      setLoading(false);
      return;
    }

    const check = async () => {
      try {
        setLoading(true);

        const { data } = await supabase
          .from('serial_keys')
          .select('status, expires_at')
          .eq('used_by', user.id)
          .in('status', ['used', 'paused', 'frozen'])
          .limit(1);

        const license = data?.[0];

        if (!license) {
          const { data: revoked } = await supabase
            .from('serial_keys')
            .select('status')
            .eq('used_by', user.id)
            .eq('status', 'revoked')
            .limit(1);

          setStatus(revoked?.[0] ? 'revoked' : 'none');
          return;
        }

        if (license.status === 'used' && license.expires_at) {
          if (new Date(license.expires_at) < new Date()) {
            setStatus('expired');
            return;
          }
        }

        const statusMap: Record<string, LicenseStatus> = {
          used: 'active',
          paused: 'paused',
          frozen: 'frozen',
        };

        setStatus(statusMap[license.status] || 'active');
      } catch (error) {
        console.error('Erro ao verificar licença:', error);
        setStatus('none');
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user, isAdmin, roleLoading]);

  const isBlocked = !!user && (status === 'revoked' || status === 'expired' || status === 'none');

  return { status, loading: loading || roleLoading, isBlocked, isAdmin };
}
