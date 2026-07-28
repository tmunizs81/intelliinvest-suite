import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, Loader2, KeyRound, Mail, Trash2, ShieldCheck, ShieldOff } from 'lucide-react';

interface Props {
  target: {
    user_id: string;
    display_name?: string | null;
    email?: string | null;
    is_admin: boolean;
    license?: { plan_type?: string; expires_at?: string | null; status?: string } | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditModal({ target, onClose, onSaved }: Props) {
  const [name, setName] = useState(target.display_name ?? '');
  const [email, setEmail] = useState(target.email ?? '');
  const [newPass, setNewPass] = useState('');
  const [plan, setPlan] = useState(target.license?.plan_type ?? 'monthly');
  const [expires, setExpires] = useState(target.license?.expires_at?.slice(0, 10) ?? '');
  const [licStatus, setLicStatus] = useState(target.license?.status ?? 'active');
  const [busy, setBusy] = useState<string | null>(null);

  const call = async (action: string, payload?: any) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-manager', {
        body: { action, target_user_id: target.user_id, payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return true;
    } catch (e: any) {
      toast.error(`${action}: ${e.message ?? e}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    if (await call('update_profile', { display_name: name, email: email !== target.email ? email : undefined })) {
      toast.success('Perfil atualizado');
      onSaved();
    }
  };

  const doResetPass = async () => {
    if (newPass.length < 8) return toast.error('Senha precisa de 8+ caracteres');
    if (await call('reset_password', { new_password: newPass })) {
      toast.success('Senha alterada');
      setNewPass('');
    }
  };

  const sendResetEmail = async () => {
    if (await call('send_reset_email')) toast.success('E-mail de reset enviado');
  };

  const saveLicense = async () => {
    if (await call('set_license', {
      plan_type: plan,
      expires_at: expires ? new Date(expires).toISOString() : null,
      status: licStatus,
    })) {
      toast.success('Licença atualizada');
      onSaved();
    }
  };

  const toggleAdmin = async () => {
    if (await call('toggle_admin', { make_admin: !target.is_admin })) {
      toast.success(target.is_admin ? 'Admin removido' : 'Agora é admin');
      onSaved();
    }
  };

  const deleteUser = async () => {
    if (!confirm(`Excluir permanentemente ${target.display_name || target.user_id}? Esta ação é irreversível.`)) return;
    if (!confirm('Confirmar EXCLUSÃO definitiva?')) return;
    if (await call('delete_user')) {
      toast.success('Usuário excluído');
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-lg font-semibold">Editar Usuário</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-6">
          {/* Perfil */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Perfil</h3>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <button onClick={saveProfile} disabled={busy === 'update_profile'}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {busy === 'update_profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Perfil'}
            </button>
          </section>

          {/* Senha */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Senha</h3>
            <div className="flex gap-2">
              <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)}
                placeholder="Nova senha (mín. 8 caracteres)"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <button onClick={doResetPass} disabled={busy === 'reset_password'}
                className="px-3 py-2 rounded-md bg-secondary text-secondary-foreground text-sm flex items-center gap-1 disabled:opacity-50">
                <KeyRound className="h-4 w-4" /> Definir
              </button>
            </div>
            <button onClick={sendResetEmail} disabled={busy === 'send_reset_email'}
              className="text-xs text-primary hover:underline flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" /> Enviar e-mail de reset
            </button>
          </section>

          {/* Licença */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Licença</h3>
            <div className="grid grid-cols-3 gap-2">
              <select value={plan} onChange={e => setPlan(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
                <option value="lifetime">Vitalício</option>
                <option value="trial">Trial</option>
              </select>
              <input type="date" value={expires} onChange={e => setExpires(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <select value={licStatus} onChange={e => setLicStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="active">Ativa</option>
                <option value="revoked">Revogada</option>
                <option value="expired">Expirada</option>
              </select>
            </div>
            <button onClick={saveLicense} disabled={busy === 'set_license'}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              Salvar Licença
            </button>
          </section>

          {/* Perigo */}
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-destructive uppercase tracking-wide">Zona de Risco</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleAdmin} disabled={busy === 'toggle_admin'}
                className="px-3 py-2 rounded-md border border-border text-sm flex items-center gap-1">
                {target.is_admin ? <><ShieldOff className="h-4 w-4" /> Remover Admin</> : <><ShieldCheck className="h-4 w-4" /> Tornar Admin</>}
              </button>
              <button onClick={deleteUser} disabled={busy === 'delete_user'}
                className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground text-sm flex items-center gap-1">
                <Trash2 className="h-4 w-4" /> Excluir Usuário
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
