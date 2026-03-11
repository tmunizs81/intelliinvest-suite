import { useState, useEffect } from 'react';
import { AlertTriangle, X, Pause, Snowflake, ShieldX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function LicenseAlert() {
  const { user } = useAuth();
  const [license, setLicense] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const checkLicense = async () => {
      // Check for paused, frozen, or no active license
      const { data } = await supabase
        .from('serial_keys')
        .select('*')
        .eq('used_by', user.id)
        .in('status', ['used', 'paused', 'frozen'])
        .limit(1);

      const lic = data?.[0] || null;
      setLicense(lic);

      // Also check for expired license
      if (lic && lic.status === 'used' && lic.expires_at) {
        const expiresAt = new Date(lic.expires_at);
        if (expiresAt < new Date()) {
          setLicense({ ...lic, status: 'expired' });
        }
      }
    };
    checkLicense();
  }, [user]);

  if (dismissed || !license) return null;
  if (license.status === 'used') return null; // Active and valid, no alert

  const config: Record<string, { icon: any; bg: string; border: string; iconColor: string; title: string; message: string }> = {
    paused: {
      icon: Pause,
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/30',
      iconColor: 'text-amber-400',
      title: 'Licença Pausada',
      message: 'Sua licença foi pausada pelo administrador. Algumas funcionalidades podem estar limitadas. Entre em contato com o suporte.',
    },
    frozen: {
      icon: Snowflake,
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/30',
      iconColor: 'text-blue-400',
      title: 'Licença Congelada',
      message: 'Sua licença foi congelada pelo administrador. O acesso ao sistema pode estar limitado.',
    },
    expired: {
      icon: AlertTriangle,
      bg: 'bg-destructive/5',
      border: 'border-destructive/30',
      iconColor: 'text-destructive',
      title: 'Licença Expirada',
      message: 'Sua licença expirou. Renove para continuar utilizando o sistema.',
    },
  };

  const cfg = config[license.status];
  if (!cfg) return null;
  const Icon = cfg.icon;

  return (
    <div className={`${cfg.bg} ${cfg.border} border rounded-lg p-4 flex items-start gap-3 relative`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{cfg.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{cfg.message}</p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
