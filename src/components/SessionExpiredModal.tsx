import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, LogIn } from 'lucide-react';

export default function SessionExpiredModal() {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        setShow(false);
      }
      if (event === 'SIGNED_OUT') {
        // Check if it was unexpected (not user-initiated)
        const wasLoggedIn = sessionStorage.getItem('sn-was-logged-in');
        if (wasLoggedIn === 'true') {
          setShow(true);
        }
      }
    });

    // Track login state
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        sessionStorage.setItem('sn-was-logged-in', 'true');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Also intercept 401 from fetch
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        if (url.includes('supabase') || url.includes('functions')) {
          // Try to refresh token first
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            setShow(true);
          }
        }
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  const handleRelogin = () => {
    sessionStorage.removeItem('sn-was-logged-in');
    setShow(false);
    navigate('/login');
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-7 w-7 text-warning" />
        </div>
        <h2 className="text-xl font-bold">Sessão Expirada</h2>
        <p className="text-sm text-muted-foreground">
          Sua sessão expirou por inatividade. Faça login novamente para continuar.
        </p>
        <button
          onClick={handleRelogin}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <LogIn className="h-4 w-4" />
          Fazer Login
        </button>
      </div>
    </div>
  );
}
