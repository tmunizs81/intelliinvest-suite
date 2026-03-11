import { ShieldX, AlertTriangle, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { LicenseStatus } from '@/hooks/useLicense';

const config: Record<string, { icon: any; title: string; description: string; color: string }> = {
  revoked: {
    icon: ShieldX,
    title: 'Licença Revogada',
    description: 'Sua licença foi revogada pelo administrador. Você não tem mais acesso ao sistema. Entre em contato com o suporte para regularizar sua situação.',
    color: 'text-destructive',
  },
  expired: {
    icon: AlertTriangle,
    title: 'Licença Expirada',
    description: 'Sua licença expirou. Renove sua licença para continuar utilizando o sistema.',
    color: 'text-amber-400',
  },
  none: {
    icon: KeyRound,
    title: 'Sem Licença Ativa',
    description: 'Você não possui uma licença ativa. Ative uma chave de licença para acessar o sistema.',
    color: 'text-muted-foreground',
  },
};

export default function BlockedScreen({ status }: { status: LicenseStatus }) {
  const { signOut, user } = useAuth();
  const cfg = config[status] || config.none;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className={`mx-auto h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center ${cfg.color}`}>
          <Icon className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{cfg.description}</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 text-left space-y-2">
          <p className="text-xs text-muted-foreground uppercase">Conta</p>
          <p className="text-sm font-mono">{user?.email}</p>
        </div>

        <div className="flex flex-col gap-2">
          {status === 'none' && (
            <p className="text-xs text-muted-foreground">
              Se você possui uma chave de ativação, entre em contato com o administrador.
            </p>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent/50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}
