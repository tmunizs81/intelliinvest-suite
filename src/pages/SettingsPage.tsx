import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, Key, Shield, Bell, Database, UserPlus,
  Trash2, Copy, RefreshCw, Loader2, Check, X, Download, Upload,
  Send, ChevronDown, ChevronUp, Plus, Crown, User,
  Pause, Play, Snowflake, AlertTriangle, ShieldCheck, Clock, Calendar,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/mockData';
import { toast } from 'sonner';

type SettingsTab = 'general' | 'users' | 'keys' | 'license' | 'family' | 'telegram' | 'backup';

// ─── Serial Key Generator ───
function generateSerialKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = 4;
  const segLen = 4;
  const parts: string[] = [];
  for (let s = 0; s < segments; s++) {
    let seg = '';
    for (let i = 0; i < segLen; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join('-');
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<SettingsTab>('general');

  if (roleLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const tabs = [
    { key: 'general' as const, label: 'Geral', icon: Settings, adminOnly: false },
    { key: 'license' as const, label: 'Licença', icon: ShieldCheck, adminOnly: false },
    { key: 'users' as const, label: 'Usuários', icon: Users, adminOnly: true },
    { key: 'keys' as const, label: 'Chaves', icon: Key, adminOnly: true },
    { key: 'family' as const, label: 'Família', icon: Users, adminOnly: false },
    { key: 'telegram' as const, label: 'Telegram', icon: Bell, adminOnly: false },
    { key: 'backup' as const, label: 'Backup', icon: Database, adminOnly: false },
  ].filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? 'Painel Administrativo' : 'Configurações da conta'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'license' && <LicenseTab />}
      {tab === 'users' && isAdmin && <UsersTab />}
      {tab === 'keys' && isAdmin && <SerialKeysTab />}
      {tab === 'family' && <FamilyTab />}
      {tab === 'telegram' && <TelegramTab />}
      {tab === 'backup' && <BackupTab />}
    </div>
  );
}

// ─── GENERAL TAB ───
function GeneralTab() {
  const { user } = useAuth();
  const { role } = useRole();
  const [license, setLicense] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('serial_keys').select('*').eq('used_by', user.id).eq('status', 'used').limit(1)
      .then(({ data }) => setLicense(data?.[0] || null));
  }, [user]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <User className="h-4 w-4" /> Minha Conta
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase">Email</p>
            <p className="font-mono text-sm">{user?.email}</p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase">Perfil</p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {role === 'admin' ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : <User className="h-3.5 w-3.5" />}
              {role === 'admin' ? 'Administrador' : 'Usuário'}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase">Licença</p>
            <p className="text-sm font-medium">
              {license ? (
                <span className="text-gain">
                  {license.plan_type === 'annual' ? 'Anual' : 'Mensal'} •
                  Expira em {new Date(license.expires_at).toLocaleDateString('pt-BR')}
                </span>
              ) : (
                <span className="text-muted-foreground">Nenhuma licença ativa</span>
              )}
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground uppercase">Membro desde</p>
            <p className="text-sm">{user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}</p>
          </div>
        </div>
      </div>

      {/* Activate License */}
      {!license && <ActivateLicenseCard />}
    </div>
  );
}

function ActivateLicenseCard() {
  const { user } = useAuth();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const activate = async () => {
    if (!user || !key.trim()) return;
    setLoading(true);
    try {
      // Find the key
      const { data: keyData, error: findErr } = await supabase
        .from('serial_keys')
        .select('*')
        .eq('key', key.trim().toUpperCase())
        .eq('status', 'active')
        .single();

      if (findErr || !keyData) {
        toast.error('Chave inválida ou já utilizada');
        setLoading(false);
        return;
      }

      const now = new Date();
      const expiresAt = new Date(now);
      if (keyData.plan_type === 'annual') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

      const { error: updateErr } = await supabase
        .from('serial_keys')
        .update({
          status: 'used',
          used_by: user.id,
          activated_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .eq('id', keyData.id);

      if (updateErr) throw updateErr;
      toast.success(`Licença ${keyData.plan_type === 'annual' ? 'anual' : 'mensal'} ativada com sucesso!`);
      setKey('');
      window.location.reload();
    } catch (err) {
      toast.error('Erro ao ativar licença');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-5 space-y-3">
      <h3 className="font-semibold flex items-center gap-2">
        <Key className="h-4 w-4 text-primary" /> Ativar Licença
      </h3>
      <p className="text-sm text-muted-foreground">Insira sua chave de ativação para desbloquear o sistema.</p>
      <div className="flex gap-2">
        <input
          value={key}
          onChange={e => setKey(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono tracking-wider placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={activate}
          disabled={loading || key.length < 10}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Ativar
        </button>
      </div>
    </div>
  );
}

// ─── LICENSE TAB ───
function LicenseTab() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [license, setLicense] = useState<any>(null);
  const [allLicenses, setAllLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (isAdmin) {
      const { data: keys } = await supabase
        .from('serial_keys')
        .select('*')
        .in('status', ['used', 'paused', 'frozen'])
        .order('activated_at', { ascending: false });
      const { data: profiles } = await supabase.from('profiles').select('*');
      const merged = (keys || []).map(k => ({
        ...k,
        profile: (profiles || []).find((p: any) => p.user_id === k.used_by),
      }));
      setAllLicenses(merged);
    } else {
      const { data } = await supabase
        .from('serial_keys')
        .select('*')
        .eq('used_by', user.id)
        .in('status', ['used', 'paused', 'frozen'])
        .limit(1);
      setLicense(data?.[0] || null);
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateLicenseStatus = async (keyId: string, newStatus: string) => {
    const actionName = newStatus === 'paused' ? 'pausar' : newStatus === 'frozen' ? 'congelar' : newStatus === 'revoked' ? 'revogar' : 'reativar';
    if (!confirm(`Deseja ${actionName} esta licença?`)) return;
    setActionLoading(keyId);
    try {
      // Find the license to get the user_id
      const targetLicense = allLicenses.find(l => l.id === keyId);
      const { error } = await supabase.from('serial_keys').update({ status: newStatus }).eq('id', keyId);
      if (error) throw error;
      const pastName = newStatus === 'paused' ? 'pausada' : newStatus === 'frozen' ? 'congelada' : newStatus === 'revoked' ? 'revogada' : 'reativada';
      toast.success(`Licença ${pastName} com sucesso`);

      // Send Telegram notification
      if (targetLicense?.used_by) {
        supabase.functions.invoke('telegram-license-notify', {
          body: { userId: targetLicense.used_by, newStatus },
        }).then(({ data }) => {
          if (data?.telegram && data?.delivered) {
            toast.success('Notificação enviada via Telegram');
          }
        }).catch(() => { /* silent */ });
      }

      await loadData();
    } catch {
      toast.error('Erro ao atualizar licença');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteLicense = async (keyId: string) => {
    if (!confirm('Tem certeza que deseja DELETAR permanentemente esta licença? Esta ação não pode ser desfeita.')) return;
    setActionLoading(keyId);
    try {
      const { error } = await supabase.from('serial_keys').delete().eq('id', keyId);
      if (error) throw error;
      toast.success('Licença deletada permanentemente');
      await loadData();
    } catch {
      toast.error('Erro ao deletar licença');
    } finally {
      setActionLoading(null);
    }
  };

  const statusConfig: Record<string, { label: string; badge: string; icon: any; description: string }> = {
    used: { label: 'Ativa', badge: 'bg-gain/10 text-gain', icon: Check, description: 'Sua licença está ativa e funcionando normalmente.' },
    paused: { label: 'Pausada', badge: 'bg-amber-500/10 text-amber-400', icon: Pause, description: 'Sua licença foi pausada pelo administrador. Entre em contato para mais informações.' },
    frozen: { label: 'Congelada', badge: 'bg-blue-500/10 text-blue-400', icon: Snowflake, description: 'Sua licença foi congelada pelo administrador. O acesso pode ser limitado.' },
    revoked: { label: 'Revogada', badge: 'bg-destructive/10 text-destructive', icon: X, description: 'Sua licença foi revogada. Você não tem acesso ao sistema.' },
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  // ── User view ──
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Minha Licença
          </h3>
          {license ? (() => {
            const cfg = statusConfig[license.status] || statusConfig.used;
            const StatusIcon = cfg.icon;
            const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
            const isExpiringSoon = expiresAt && (expiresAt.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;
            return (
              <div className="space-y-4">
                {license.status !== 'used' && (
                  <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                    license.status === 'paused' ? 'border-amber-500/30 bg-amber-500/5' :
                    license.status === 'frozen' ? 'border-blue-500/30 bg-blue-500/5' :
                    'border-destructive/30 bg-destructive/5'
                  }`}>
                    <AlertTriangle className={`h-5 w-5 shrink-0 ${
                      license.status === 'paused' ? 'text-amber-400' :
                      license.status === 'frozen' ? 'text-blue-400' : 'text-destructive'
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{cfg.label}</p>
                      <p className="text-xs text-muted-foreground">{cfg.description}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Status</p>
                    <p className="text-sm font-medium mt-1 flex items-center gap-2">
                      <StatusIcon className="h-4 w-4" />
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>{cfg.label}</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Plano</p>
                    <p className="text-sm font-medium mt-1">{license.plan_type === 'annual' ? 'Anual' : 'Mensal'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Chave</p>
                    <p className="text-sm font-mono tracking-wider mt-1">{license.key}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase">Ativada em</p>
                    <p className="text-sm mt-1">{license.activated_at ? new Date(license.activated_at).toLocaleDateString('pt-BR') : '—'}</p>
                  </div>
                  <div className={`rounded-lg p-4 ${isExpiringSoon ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-muted/30'}`}>
                    <p className="text-xs text-muted-foreground uppercase">Expira em</p>
                    <p className={`text-sm font-medium mt-1 ${isExpiringSoon ? 'text-amber-400' : ''}`}>
                      {expiresAt ? expiresAt.toLocaleDateString('pt-BR') : '—'}
                      {isExpiringSoon && <span className="text-xs ml-2">(expirando em breve!)</span>}
                    </p>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="text-center py-8">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma licença ativa encontrada.</p>
              <p className="text-xs text-muted-foreground mt-1">Vá para a aba Geral para ativar uma chave de licença.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Admin view ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Gerenciar Licenças de Usuários
        </h3>
        <p className="text-xs text-muted-foreground">{allLicenses.length} licença(s)</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Ativas</p>
          <p className="text-xl font-bold font-mono text-gain">{allLicenses.filter(l => l.status === 'used').length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Pausadas</p>
          <p className="text-xl font-bold font-mono text-amber-400">{allLicenses.filter(l => l.status === 'paused').length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Congeladas</p>
          <p className="text-xl font-bold font-mono text-blue-400">{allLicenses.filter(l => l.status === 'frozen').length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{allLicenses.length}</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {allLicenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma licença em uso</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-3 font-medium text-xs">Usuário</th>
                  <th className="text-left p-3 font-medium text-xs">Chave</th>
                  <th className="text-left p-3 font-medium text-xs">Plano</th>
                  <th className="text-left p-3 font-medium text-xs">Status</th>
                  <th className="text-left p-3 font-medium text-xs">Expira em</th>
                  <th className="text-right p-3 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {allLicenses.map(l => {
                  const cfg = statusConfig[l.status] || statusConfig.used;
                  const isLoading = actionLoading === l.id;
                  return (
                    <tr key={l.id} className="border-b border-border/30 hover:bg-accent/20">
                      <td className="p-3">
                        <p className="font-medium text-sm">{l.profile?.display_name || '—'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{l.used_by?.slice(0, 8)}...</p>
                      </td>
                      <td className="p-3 font-mono text-xs tracking-wider">{l.key}</td>
                      <td className="p-3 text-xs">{l.plan_type === 'annual' ? 'Anual' : 'Mensal'}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{cfg.label}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {l.expires_at ? new Date(l.expires_at).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {l.status === 'used' && (
                                <>
                                  <button onClick={() => updateLicenseStatus(l.id, 'paused')} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" title="Pausar">
                                    <Pause className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => updateLicenseStatus(l.id, 'frozen')} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10" title="Congelar">
                                    <Snowflake className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {(l.status === 'paused' || l.status === 'frozen') && (
                                <button onClick={() => updateLicenseStatus(l.id, 'used')} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-gain hover:bg-gain/10" title="Reativar">
                                  <Play className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button onClick={() => updateLicenseStatus(l.id, 'revoked')} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Revogar">
                                <X className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deleteLicense(l.id)} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Deletar">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── USERS TAB (Admin) ───
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [newChatId, setNewChatId] = useState('');
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');
    const { data: keys } = await supabase.from('serial_keys').select('*').eq('status', 'used');
    const { data: tgSettings } = await supabase.from('telegram_settings').select('*');

    const merged = (profiles || []).map(p => {
      const userRoles = (roles || []).filter((r: any) => r.user_id === p.user_id);
      const userKey = (keys || []).find((k: any) => k.used_by === p.user_id);
      const userTg = (tgSettings || []).find((t: any) => t.user_id === p.user_id);
      return {
        ...p,
        roles: userRoles.map((r: any) => r.role),
        license: userKey,
        telegram: userTg,
      };
    });

    setUsers(merged);
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const createUser = async () => {
    if (!newEmail || !newPassword) return;
    setCreating(true);
    try {
      // Create user via edge function (admin-create-user)
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newEmail,
          password: newPassword,
          displayName: newName,
          role: newRole,
          telegramChatId: newChatId || undefined,
        },
      });
      if (error) throw error;
      toast.success(`Usuário ${newEmail} criado com sucesso`);
      setShowCreate(false);
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      setNewRole('user');
      setNewChatId('');
      await loadUsers();
    } catch (err) {
      toast.error('Erro ao criar usuário. Verifique os dados.');
    } finally {
      setCreating(false);
    }
  };

  const toggleRole = async (userId: string, currentRoles: string[]) => {
    const isCurrentAdmin = currentRoles.includes('admin');
    if (isCurrentAdmin) {
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', 'admin');
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role: 'admin' });
    }
    await loadUsers();
    toast.success(isCurrentAdmin ? 'Permissão admin removida' : 'Permissão admin concedida');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield className="h-4 w-4" /> Gestão de Usuários
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-primary/20 bg-card p-5 space-y-3">
          <h4 className="text-sm font-semibold">Criar Novo Usuário</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" type="email" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha (min 6 chars)" type="password" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="border-t border-border pt-3 mt-1">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Telegram (opcional - resumo diário)
            </p>
            <input value={newChatId} onChange={e => setNewChatId(e.target.value)} placeholder="Chat ID do Telegram (ex: 123456789)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono" />
            <p className="text-xs text-muted-foreground mt-1.5">
              Informe o Chat ID para o usuário receber resumos diários via bot central do sistema.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={createUser} disabled={creating} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Criar
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-md border border-border text-sm">Cancelar</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium text-xs">Nome</th>
                <th className="text-left p-3 font-medium text-xs">Perfil</th>
                <th className="text-left p-3 font-medium text-xs">Licença</th>
                <th className="text-left p-3 font-medium text-xs">Telegram</th>
                <th className="text-left p-3 font-medium text-xs">Membro desde</th>
                <th className="text-right p-3 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-accent/20">
                  <td className="p-3">
                    <p className="font-medium">{u.display_name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{u.user_id}</p>
                  </td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      u.roles.includes('admin') ? 'bg-amber-500/10 text-amber-400' : 'bg-muted text-muted-foreground'
                    }`}>
                      {u.roles.includes('admin') ? 'Admin' : 'Usuário'}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.license ? (
                      <span className="text-xs text-gain">
                        {u.license.plan_type === 'annual' ? 'Anual' : 'Mensal'}
                        {u.license.expires_at && ` • ${new Date(u.license.expires_at).toLocaleDateString('pt-BR')}`}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem licença</span>
                    )}
                  </td>
                  <td className="p-3">
                    {u.telegram?.enabled ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gain/10 text-gain flex items-center gap-1 w-fit">
                        <Bell className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Desativado</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggleRole(u.user_id, u.roles)}
                      className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/50 transition-colors"
                    >
                      {u.roles.includes('admin') ? 'Remover Admin' : 'Tornar Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── SERIAL KEYS TAB (Admin) ───
function SerialKeysTab() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genPlan, setGenPlan] = useState<'monthly' | 'annual'>('monthly');
  const [genCount, setGenCount] = useState(1);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('serial_keys').select('*').order('created_at', { ascending: false });
    setKeys(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const generateKeys = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const newKeys = [];
      for (let i = 0; i < genCount; i++) {
        newKeys.push({
          key: generateSerialKey(),
          plan_type: genPlan,
          status: 'active',
          created_by: user.id,
        });
      }
      const { error } = await supabase.from('serial_keys').insert(newKeys);
      if (error) throw error;
      toast.success(`${genCount} chave(s) gerada(s) com sucesso`);
      await loadKeys();
    } catch (err) {
      toast.error('Erro ao gerar chaves');
    } finally {
      setGenerating(false);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('Chave copiada!');
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Revogar esta chave?')) return;
    await supabase.from('serial_keys').update({ status: 'revoked' }).eq('id', id);
    await loadKeys();
    toast.success('Chave revogada');
  };

  const statusBadge: Record<string, string> = {
    active: 'bg-gain/10 text-gain',
    used: 'bg-primary/10 text-primary',
    expired: 'bg-muted text-muted-foreground',
    revoked: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Key className="h-4 w-4" /> Gerar Chaves de Licença
        </h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-muted-foreground">Plano</label>
            <select value={genPlan} onChange={e => setGenPlan(e.target.value as any)} className="block rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Quantidade</label>
            <input type="number" min={1} max={50} value={genCount} onChange={e => setGenCount(Number(e.target.value))} className="block w-20 rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" />
          </div>
          <button
            onClick={generateKeys}
            disabled={generating}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Gerar
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{keys.length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Disponíveis</p>
          <p className="text-xl font-bold font-mono text-gain">{keys.filter(k => k.status === 'active').length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Utilizadas</p>
          <p className="text-xl font-bold font-mono text-primary">{keys.filter(k => k.status === 'used').length}</p>
        </div>
        <div className="rounded-lg bg-card border border-border p-4">
          <p className="text-xs text-muted-foreground">Revogadas</p>
          <p className="text-xl font-bold font-mono text-destructive">{keys.filter(k => k.status === 'revoked').length}</p>
        </div>
      </div>

      {/* Keys table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left p-3 font-medium text-xs">Chave</th>
                  <th className="text-left p-3 font-medium text-xs">Plano</th>
                  <th className="text-left p-3 font-medium text-xs">Status</th>
                  <th className="text-left p-3 font-medium text-xs">Expira em</th>
                  <th className="text-right p-3 font-medium text-xs">Ações</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} className="border-b border-border/30 hover:bg-accent/20">
                    <td className="p-3 font-mono text-xs tracking-wider">{k.key}</td>
                    <td className="p-3 text-xs">{k.plan_type === 'annual' ? 'Anual' : 'Mensal'}</td>
                    <td className="p-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge[k.status] || ''}`}>
                        {k.status === 'active' ? 'Disponível' : k.status === 'used' ? 'Utilizada' : k.status === 'revoked' ? 'Revogada' : 'Expirada'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {k.expires_at ? new Date(k.expires_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => copyKey(k.key)} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent" title="Copiar">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        {k.status === 'active' && (
                          <button onClick={() => revokeKey(k.id)} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Revogar">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FAMILY TAB ───
function FamilyTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .or(`owner_id.eq.${user.id},member_id.eq.${user.id}`);
    setMembers(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const invite = async () => {
    if (!user || !email.trim()) return;
    setInviting(true);
    try {
      const { error } = await supabase.from('family_members').insert({
        owner_id: user.id,
        invited_email: email.trim().toLowerCase(),
        status: 'pending',
      });
      if (error) throw error;
      toast.success(`Convite enviado para ${email}`);
      setEmail('');
      await loadMembers();
    } catch (err) {
      toast.error('Erro ao enviar convite. Email já convidado?');
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (id: string) => {
    if (!confirm('Remover este membro?')) return;
    await supabase.from('family_members').delete().eq('id', id);
    await loadMembers();
    toast.success('Membro removido');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Compartilhamento Familiar
        </h3>
        <p className="text-sm text-muted-foreground">
          Convide familiares para visualizar sua carteira de investimentos.
        </p>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@familiar.com"
            type="email"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={invite}
            disabled={inviting || !email.trim()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Convidar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          Nenhum membro familiar adicionado
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left p-3 font-medium text-xs">Email</th>
                <th className="text-left p-3 font-medium text-xs">Status</th>
                <th className="text-right p-3 font-medium text-xs">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-border/30">
                  <td className="p-3">{m.invited_email}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.status === 'active' ? 'bg-gain/10 text-gain' : m.status === 'pending' ? 'bg-amber-500/10 text-amber-400' : 'bg-muted text-muted-foreground'
                    }`}>
                      {m.status === 'active' ? 'Ativo' : m.status === 'pending' ? 'Pendente' : 'Revogado'}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {m.owner_id === user?.id && (
                      <button onClick={() => removeMember(m.id)} className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── TELEGRAM TAB ───
function TelegramTab() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [settings, setSettings] = useState<any>(null);
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('telegram_settings').select('*').eq('user_id', user.id).maybeSingle();
    if (data) {
      setSettings(data);
      setChatId(data.chat_id || '');
      setEnabled(data.enabled || false);
      setLinkCode(data.link_code || null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Poll for auto-link when code is active
  useEffect(() => {
    if (!linkCode || !user) return;
    setPolling(true);
    const interval = setInterval(async () => {
      const { data } = await supabase.from('telegram_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (data && data.chat_id && !data.link_code) {
        setSettings(data);
        setChatId(data.chat_id);
        setEnabled(data.enabled);
        setLinkCode(null);
        setPolling(false);
        clearInterval(interval);
        toast.success('🎉 Telegram vinculado automaticamente!');
      }
    }, 3000);
    return () => { clearInterval(interval); setPolling(false); };
  }, [linkCode, user]);

  const generateLinkCode = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      if (settings) {
        await supabase.from('telegram_settings').update({ link_code: code }).eq('id', settings.id);
      } else {
        await supabase.from('telegram_settings').insert({
          user_id: user.id,
          link_code: code,
          enabled: false,
        });
      }
      setLinkCode(code);
      toast.success('Código gerado! Envie ao bot no Telegram.');
    } catch {
      toast.error('Erro ao gerar código');
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (settings) {
        await supabase.from('telegram_settings').update({ chat_id: chatId, enabled }).eq('id', settings.id);
      } else {
        await supabase.from('telegram_settings').insert({ user_id: user.id, chat_id: chatId, enabled });
      }
      toast.success('Configurações salvas');
      await loadSettings();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!chatId) { toast.error('Chat ID não configurado'); return; }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('telegram-test', { body: { chatId } });
      if (error) throw error;
      toast.success('Mensagem de teste enviada!');
    } catch {
      toast.error('Falha ao enviar.');
    } finally {
      setTesting(false);
    }
  };

  const setupWebhook = async () => {
    setSettingWebhook(true);
    try {
      const { error } = await supabase.functions.invoke('telegram-setup-webhook');
      if (error) throw error;
      toast.success('Webhook ativado!');
    } catch {
      toast.error('Erro ao configurar webhook');
    } finally {
      setSettingWebhook(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const isLinked = !!chatId;
  const botUsername = 'SimplyNvest_Bot'; // adjust to your bot's username

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" /> Configuração do Telegram
        </h3>

        {/* Status */}
        <div className={`rounded-lg p-4 flex items-center gap-3 ${isLinked ? 'bg-gain/10 border border-gain/20' : 'bg-muted/30 border border-border'}`}>
          <div className={`h-3 w-3 rounded-full ${isLinked ? 'bg-gain animate-pulse' : 'bg-muted-foreground'}`} />
          <div>
            <p className={`text-sm font-medium ${isLinked ? 'text-gain' : 'text-muted-foreground'}`}>
              {isLinked ? '✅ Telegram vinculado' : 'Telegram não vinculado'}
            </p>
            {isLinked && <p className="text-xs text-muted-foreground">Chat ID: {chatId}</p>}
          </div>
        </div>

        {/* Auto-link section */}
        {!isLinked && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">Vincular automaticamente</p>
            <p className="text-xs text-muted-foreground">
              Clique no botão abaixo para gerar um código. Depois, envie-o ao bot no Telegram e sua conta será vinculada automaticamente.
            </p>

            {linkCode ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Envie esta mensagem ao bot:</span>
                </div>
                <div className="rounded-lg bg-background border border-border p-3 flex items-center justify-between">
                  <code className="text-sm font-mono text-primary font-bold">/start {linkCode}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(`/start ${linkCode}`); toast.success('Copiado!'); }}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-accent/50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <a
                  href={`https://t.me/${botUsername}?start=${linkCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[hsl(200,80%,50%)] text-white text-sm font-medium hover:opacity-90"
                >
                  <Send className="h-4 w-4" />
                  Abrir no Telegram
                </a>
                {polling && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Aguardando vinculação...
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={generateLinkCode}
                disabled={generating}
                className="px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Vincular Telegram
              </button>
            )}
          </div>
        )}

        {/* If linked, show controls */}
        {isLinked && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Notificações ativas</label>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Você receberá:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>📊 Resumo diário da carteira com variação e patrimônio</li>
                <li>🤖 Insights da IA sobre seus ativos</li>
                <li>💰 Alertas de pagamento de dividendos e proventos</li>
                <li>📈 Indicações de compra e venda</li>
                <li>⚠️ Alertas de preço atingidos</li>
              </ul>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">🔐 Comandos do Bot</p>
              <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                <li><span className="text-primary">/senha</span> — Alterar senha</li>
                <li><span className="text-primary">/ajuda</span> — Ver comandos</li>
              </ul>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar
              </button>
              <button onClick={testConnection} disabled={testing} className="px-4 py-2 rounded-md border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent/50 disabled:opacity-50">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Testar
              </button>
              {isAdmin && (
                <button onClick={setupWebhook} disabled={settingWebhook} className="px-4 py-2 rounded-md border border-border text-sm font-medium flex items-center gap-2 hover:bg-accent/50 disabled:opacity-50">
                  {settingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Ativar Webhook
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BACKUP TAB ───
function BackupTab() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    if (!user) return;
    setLoadingBackups(true);
    const { data } = await supabase
      .from('backups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setBackups(data || []);
    setLoadingBackups(false);
  }, [user]);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  const createManualBackup = async () => {
    if (!user) return;
    setCreatingBackup(true);
    try {
      const { data, error } = await supabase.functions.invoke('daily-backup', {
        body: { userId: user.id },
      });
      if (error) throw error;
      toast.success('Backup criado com sucesso!');
      await loadBackups();
    } catch {
      toast.error('Erro ao criar backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadBackup = async (backup: any) => {
    try {
      const { data, error } = await supabase.storage.from('backups').download(backup.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date(backup.created_at).toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup baixado');
    } catch {
      toast.error('Erro ao baixar backup');
    }
  };

  const restoreBackup = async (backup: any) => {
    if (!user) return;
    if (!confirm('⚠️ ATENÇÃO: A restauração substituirá TODOS os seus dados atuais (carteira, transações, alertas) pelos dados do backup selecionado. Esta ação não pode ser desfeita. Deseja continuar?')) return;
    setRestoring(backup.id);
    try {
      const { data: fileData, error: dlErr } = await supabase.storage.from('backups').download(backup.file_path);
      if (dlErr) throw dlErr;
      const text = await fileData.text();
      const backupData = JSON.parse(text);

      // Delete existing data
      await Promise.all([
        supabase.from('holdings').delete().eq('user_id', user.id),
        supabase.from('transactions').delete().eq('user_id', user.id),
        supabase.from('alerts').delete().eq('user_id', user.id),
        supabase.from('ai_messages').delete().eq('user_id', user.id),
      ]);
      // Delete conversations after messages
      await supabase.from('ai_conversations').delete().eq('user_id', user.id);

      // Restore data (strip ids to let DB generate new ones, keep user_id)
      if (backupData.holdings?.length) {
        const rows = backupData.holdings.map((h: any) => ({
          user_id: user.id, ticker: h.ticker, name: h.name, type: h.type,
          quantity: h.quantity, avg_price: h.avg_price, sector: h.sector,
        }));
        const { error } = await supabase.from('holdings').insert(rows);
        if (error) console.error('Holdings restore error:', error);
      }

      if (backupData.transactions?.length) {
        const rows = backupData.transactions.map((t: any) => ({
          user_id: user.id, ticker: t.ticker, name: t.name, type: t.type,
          operation: t.operation, quantity: t.quantity, price: t.price,
          total: t.total, fees: t.fees, date: t.date, notes: t.notes,
          is_daytrade: t.is_daytrade,
        }));
        const { error } = await supabase.from('transactions').insert(rows);
        if (error) console.error('Transactions restore error:', error);
      }

      if (backupData.alerts?.length) {
        const rows = backupData.alerts.map((a: any) => ({
          user_id: user.id, name: a.name, ticker: a.ticker,
          alert_type: a.alert_type, target_value: a.target_value,
          current_value: a.current_value, status: a.status,
          notify_telegram: a.notify_telegram,
        }));
        const { error } = await supabase.from('alerts').insert(rows);
        if (error) console.error('Alerts restore error:', error);
      }

      if (backupData.aiConversations?.length) {
        // Create a mapping from old IDs to new IDs for conversations
        const convMap: Record<string, string> = {};
        for (const c of backupData.aiConversations) {
          const { data: newConv, error } = await supabase.from('ai_conversations').insert({
            user_id: user.id, title: c.title, analysis_type: c.analysis_type,
          }).select('id').single();
          if (newConv) convMap[c.id] = newConv.id;
          if (error) console.error('Conversation restore error:', error);
        }

        if (backupData.aiMessages?.length) {
          const rows = backupData.aiMessages
            .filter((m: any) => convMap[m.conversation_id])
            .map((m: any) => ({
              user_id: user.id, conversation_id: convMap[m.conversation_id],
              role: m.role, content: m.content,
            }));
          if (rows.length) {
            const { error } = await supabase.from('ai_messages').insert(rows);
            if (error) console.error('Messages restore error:', error);
          }
        }
      }

      toast.success('Dados restaurados com sucesso! Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao restaurar backup');
    } finally {
      setRestoring(null);
    }
  };

  const deleteBackup = async (backup: any) => {
    if (!confirm('Deseja excluir este backup permanentemente?')) return;
    setDeletingBackup(backup.id);
    try {
      await supabase.storage.from('backups').remove([backup.file_path]);
      await supabase.from('backups').delete().eq('id', backup.id);
      toast.success('Backup excluído');
      await loadBackups();
    } catch {
      toast.error('Erro ao excluir backup');
    } finally {
      setDeletingBackup(null);
    }
  };

  const exportData = async (format: 'json' | 'csv') => {
    if (!user) return;
    setExporting(true);
    try {
      const [holdingsRes, transactionsRes, alertsRes, telegramRes, familyRes] = await Promise.all([
        supabase.from('holdings').select('*').eq('user_id', user.id),
        supabase.from('transactions').select('*').eq('user_id', user.id),
        supabase.from('alerts').select('*').eq('user_id', user.id),
        supabase.from('telegram_settings').select('*').eq('user_id', user.id),
        supabase.from('family_members').select('*').eq('owner_id', user.id),
      ]);
      const backup = {
        exportDate: new Date().toISOString(),
        user: { email: user.email, id: user.id },
        holdings: holdingsRes.data || [],
        transactions: transactionsRes.data || [],
        alerts: alertsRes.data || [],
        telegramSettings: telegramRes.data || [],
        familyMembers: familyRes.data || [],
      };
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `investai-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = ['ticker', 'name', 'type', 'quantity', 'avg_price', 'sector'];
        const rows = (backup.holdings as any[]).map(h => headers.map(k => h[k] ?? '').join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `investai-holdings-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Backup exportado em ${format.toUpperCase()}`);
    } catch {
      toast.error('Erro ao exportar dados');
    } finally {
      setExporting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Auto backup info */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Backup Automático Diário</p>
          <p className="text-xs text-muted-foreground mt-1">
            Um backup completo dos seus dados é criado automaticamente todos os dias às 23:00. 
            Os últimos 30 backups são mantidos.
          </p>
        </div>
      </div>

      {/* Manual backup + export */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="h-4 w-4" /> Backup e Exportação
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={createManualBackup}
            disabled={creatingBackup}
            className="flex items-center justify-center gap-2 p-4 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            {creatingBackup ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
            <div className="text-left">
              <p className="text-sm font-medium">Backup Agora</p>
              <p className="text-[10px] text-muted-foreground">Criar backup manual</p>
            </div>
          </button>
          <button
            onClick={() => exportData('json')}
            disabled={exporting}
            className="flex items-center justify-center gap-2 p-4 rounded-lg border border-border bg-muted/30 hover:bg-accent/30 transition-colors"
          >
            <Download className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium">Exportar JSON</p>
              <p className="text-[10px] text-muted-foreground">Download local</p>
            </div>
          </button>
          <button
            onClick={() => exportData('csv')}
            disabled={exporting}
            className="flex items-center justify-center gap-2 p-4 rounded-lg border border-border bg-muted/30 hover:bg-accent/30 transition-colors"
          >
            <Download className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium">Exportar CSV</p>
              <p className="text-[10px] text-muted-foreground">Carteira em planilha</p>
            </div>
          </button>
        </div>
      </div>

      {/* Backup history */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Histórico de Backups
          </h3>
          <button onClick={loadBackups} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>

        {loadingBackups ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum backup encontrado.</p>
            <p className="text-xs text-muted-foreground mt-1">Clique em "Backup Agora" para criar seu primeiro backup.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {backups.map((b) => (
              <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    b.backup_type === 'auto' ? 'bg-primary/10 text-primary' : 'bg-accent text-accent-foreground'
                  }`}>
                    {b.backup_type === 'auto' ? <Clock className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {new Date(b.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.backup_type === 'auto' ? 'Automático' : 'Manual'} • {formatBytes(b.size_bytes || 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => downloadBackup(b)}
                    className="px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 flex items-center gap-1"
                    title="Baixar"
                  >
                    <Download className="h-3 w-3" /> Baixar
                  </button>
                  <button
                    onClick={() => restoreBackup(b)}
                    disabled={restoring === b.id}
                    className="px-2.5 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                    title="Restaurar"
                  >
                    {restoring === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Restaurar
                  </button>
                  <button
                    onClick={() => deleteBackup(b)}
                    disabled={deletingBackup === b.id}
                    className="px-2 py-1.5 text-xs rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    title="Excluir"
                  >
                    {deletingBackup === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore from file */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" /> Restaurar de Arquivo
        </h3>
        <p className="text-sm text-muted-foreground">
          Faça upload de um arquivo JSON de backup exportado anteriormente para restaurar seus dados.
        </p>
        <RestoreFromFile />
      </div>
    </div>
  );
}

function RestoreFromFile() {
  const { user } = useAuth();
  const [restoring, setRestoring] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!confirm('⚠️ ATENÇÃO: A restauração substituirá TODOS os seus dados atuais. Deseja continuar?')) {
      e.target.value = '';
      return;
    }

    setRestoring(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      // Validate it's a valid backup
      if (!backupData.holdings && !backupData.transactions) {
        toast.error('Arquivo de backup inválido');
        return;
      }

      // Delete existing data
      await Promise.all([
        supabase.from('holdings').delete().eq('user_id', user.id),
        supabase.from('transactions').delete().eq('user_id', user.id),
        supabase.from('alerts').delete().eq('user_id', user.id),
      ]);

      if (backupData.holdings?.length) {
        const rows = backupData.holdings.map((h: any) => ({
          user_id: user.id, ticker: h.ticker, name: h.name, type: h.type,
          quantity: h.quantity, avg_price: h.avg_price, sector: h.sector,
        }));
        await supabase.from('holdings').insert(rows);
      }

      if (backupData.transactions?.length) {
        const rows = backupData.transactions.map((t: any) => ({
          user_id: user.id, ticker: t.ticker, name: t.name, type: t.type,
          operation: t.operation, quantity: t.quantity, price: t.price,
          total: t.total, fees: t.fees, date: t.date, notes: t.notes,
          is_daytrade: t.is_daytrade,
        }));
        await supabase.from('transactions').insert(rows);
      }

      if (backupData.alerts?.length) {
        const rows = backupData.alerts.map((a: any) => ({
          user_id: user.id, name: a.name, ticker: a.ticker,
          alert_type: a.alert_type, target_value: a.target_value,
          current_value: a.current_value, status: a.status,
          notify_telegram: a.notify_telegram,
        }));
        await supabase.from('alerts').insert(rows);
      }

      toast.success('Dados restaurados com sucesso! Recarregando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast.error('Erro ao restaurar backup. Verifique se o arquivo é válido.');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <label className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors ${restoring ? 'opacity-50 pointer-events-none' : ''}`}>
        {restoring ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Restaurando...</span>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Clique para selecionar arquivo JSON</span>
          </>
        )}
        <input type="file" accept=".json" onChange={handleFile} className="hidden" disabled={restoring} />
      </label>
    </div>
  );
}
