import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearCache } from '@/lib/persistentCache';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Purge all per-user client-side caches so a new sign-in on the same browser
 * never rehydrates the previous account's data. Keeps public UI prefs
 * (theme, display currency, FX rates) intact.
 */
async function purgeUserScopedCaches() {
  // IndexedDB caches (dashboard bootstrap, holdings quotes, AI insights, snapshots)
  try { await clearCache(); } catch { /* noop */ }
  // localStorage keys that hold per-user data
  try {
    const preserve = new Set([
      'display_currency_v1',
      'display_currency_fx_v1',
      'theme',
      'privacy_mode',
    ]);
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (preserve.has(k)) continue;
      // Drop everything user-scoped: bootstrap, metrics, alerts, ai-*, quotes, tickers
      if (/^(dashboard_bootstrap|portfolio_|ai-|alerts:|onboarding_|user_)/.test(k)) {
        toDelete.push(k);
      }
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LAST_UID_KEY = 'sn_last_uid_v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUidRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem(LAST_UID_KEY) : null
  );

  useEffect(() => {
    // Defensive: if a different account signs in (or user signs out), purge every
    // per-user cache so the previous account's data can never bleed into this session.
    const handleUidChange = async (nextUid: string | null) => {
      const prev = lastUidRef.current;
      if (prev !== nextUid) {
        await purgeUserScopedCaches();
        lastUidRef.current = nextUid;
        try {
          if (nextUid) localStorage.setItem(LAST_UID_KEY, nextUid);
          else localStorage.removeItem(LAST_UID_KEY);
        } catch { /* noop */ }
        // Force a reload on account switch so every hook re-hydrates from scratch.
        if (prev && nextUid && prev !== nextUid) {
          window.location.reload();
          return;
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUid = session?.user?.id ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void handleUidChange(nextUid);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUid = session?.user?.id ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      void handleUidChange(nextUid);
    });

    return () => subscription.unsubscribe();
  }, []);


  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: displayName },
      },
    });
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Send security alert for new login (fire and forget)
    if (!error && data?.user) {
      supabase.functions.invoke('telegram-security-alert', {
        body: {
          alertType: 'new_login',
          userId: data.user.id,
          details: {
            device: navigator.userAgent.slice(0, 100),
            timestamp: new Date().toISOString(),
          },
        },
      }).catch(() => {});
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await purgeUserScopedCaches();
    try { localStorage.removeItem(LAST_UID_KEY); } catch { /* noop */ }
    await supabase.auth.signOut();
  };


  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
