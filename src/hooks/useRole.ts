import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useRole() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setRole('user');
      setLoading(false);
      return;
    }

    const fetchRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const roles = (data || []).map((r: any) => r.role);
      const admin = roles.includes('admin');
      setIsAdmin(admin);
      setRole(admin ? 'admin' : 'user');
      setLoading(false);
    };

    fetchRole();
  }, [user]);

  return { isAdmin, role, loading };
}
