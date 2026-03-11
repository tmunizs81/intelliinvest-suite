import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface FamilyMember {
  id: string;
  owner_id: string;
  member_id: string | null;
  invited_email: string;
  status: string;
  created_at: string;
}

export function useFamilySharing() {
  const { user } = useAuth();
  const [sentInvites, setSentInvites] = useState<FamilyMember[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<FamilyMember[]>([]);
  const [familyOwners, setFamilyOwners] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Auto-link: find pending invites for this email and set member_id
    const { data: pendingForMe } = await supabase
      .from('family_members')
      .select('*')
      .eq('invited_email', user.email?.toLowerCase() || '')
      .eq('status', 'pending')
      .is('member_id', null);

    if (pendingForMe && pendingForMe.length > 0) {
      for (const invite of pendingForMe) {
        await supabase
          .from('family_members')
          .update({ member_id: user.id })
          .eq('id', invite.id);
      }
    }

    // Load sent invites (I'm owner)
    const { data: sent } = await supabase
      .from('family_members')
      .select('*')
      .eq('owner_id', user.id);
    setSentInvites(sent || []);

    // Load received invites (I'm member or invited email)
    const { data: received } = await supabase
      .from('family_members')
      .select('*')
      .eq('member_id', user.id)
      .neq('owner_id', user.id);
    setReceivedInvites(received || []);

    // Active family connections where I'm a member
    const { data: activeFamily } = await supabase
      .from('family_members')
      .select('*')
      .eq('member_id', user.id)
      .eq('status', 'active');
    setFamilyOwners(activeFamily || []);

    setLoading(false);
  }, [user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const acceptInvite = useCallback(async (inviteId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from('family_members')
      .update({ status: 'active', member_id: user.id })
      .eq('id', inviteId);
    if (error) throw error;
    await loadAll();
  }, [user, loadAll]);

  const rejectInvite = useCallback(async (inviteId: string) => {
    if (!user) return;
    await supabase.from('family_members').delete().eq('id', inviteId);
    await loadAll();
  }, [user, loadAll]);

  return { sentInvites, receivedInvites, familyOwners, loading, refresh: loadAll, acceptInvite, rejectInvite };
}
