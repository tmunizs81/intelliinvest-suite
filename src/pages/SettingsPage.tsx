import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, Key, Shield, Bell, Database, UserPlus,
  Trash2, Copy, RefreshCw, Loader2, Check, X, Download,
  Send, ChevronDown, ChevronUp, Plus, Crown, User,
  Pause, Play, Snowflake, AlertTriangle, ShieldCheck,
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
      <div className="flex gap-1 bg-muted rounded-lg p-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
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
  const botUsername = 'InvestAI_Bot'; // adjust to your bot's username

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
        // Export holdings as CSV
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
    } catch (err) {
      toast.error('Erro ao exportar dados');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Database className="h-4 w-4" /> Backup Completo
        </h3>
        <p className="text-sm text-muted-foreground">
          Exporte todos os seus dados: carteira, transações, alertas, configurações e membros familiares.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => exportData('json')}
            disabled={exporting}
            className="flex items-center justify-center gap-2 p-4 rounded-lg border border-border bg-muted/30 hover:bg-accent/30 transition-colors"
          >
            <Download className="h-5 w-5 text-primary" />
            <div className="text-left">
              <p className="text-sm font-medium">Backup JSON</p>
              <p className="text-[10px] text-muted-foreground">Todos os dados em formato completo</p>
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

        {exporting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Exportando dados...
          </div>
        )}
      </div>
    </div>
  );
}
