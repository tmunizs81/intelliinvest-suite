import { useState } from 'react';
import { X, Loader2, Send, MessageCircle, Bot, Bell, Brain, BarChart3, Shield, Newspaper, Target, Wallet } from 'lucide-react';
import type { TelegramSettings } from '@/hooks/useAlerts';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: TelegramSettings;
  onSave: (settings: TelegramSettings) => Promise<void>;
}

const features = [
  { icon: Wallet, label: 'Resumo Diário', desc: 'Patrimônio, variação e top ativos às 18h' },
  { icon: BarChart3, label: 'Relatório Semanal', desc: 'Evolução semanal com gráfico' },
  { icon: Bell, label: 'Stop Loss / Take Profit', desc: 'Alertas de preço em tempo real' },
  { icon: Target, label: 'Dividendos', desc: 'Aviso de dividendos próximos' },
  { icon: Brain, label: 'Chat com IA', desc: '/perguntar [sua dúvida]' },
  { icon: Newspaper, label: 'Breaking News', desc: 'Notícias dos seus ativos via IA' },
  { icon: Shield, label: 'Segurança', desc: 'Alertas de login e licença' },
  { icon: Bot, label: 'Comandos Rápidos', desc: '/carteira /cotacao /ranking /saude' },
];

export default function TelegramSettingsModal({ open, onClose, settings, onSave }: Props) {
  const [chatId, setChatId] = useState(settings.chat_id || '');
  const [enabled, setEnabled] = useState(settings.enabled);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = async () => {
    setLoading(true);
    await onSave({ bot_token: null, chat_id: chatId || null, enabled });
    setLoading(false);
    onClose();
  };

  const handleTest = async () => {
    if (!chatId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { error } = await supabase.functions.invoke('telegram-test', {
        body: { chatId },
      });
      setTestResult(error ? `❌ Erro: ${error.message}` : '✅ Mensagem enviada com sucesso!');
    } catch {
      setTestResult('❌ Falha na conexão');
    }
    setTesting(false);
  };

  const handleGenerateLink = async () => {
    setLinking(true);
    try {
      // Generate a random code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Save link code to telegram_settings
      const { error } = await supabase
        .from('telegram_settings')
        .upsert({
          user_id: user.id,
          link_code: code,
          enabled: true,
        }, { onConflict: 'user_id' });

      if (error) throw error;
      setLinkCode(code);
    } catch {
      setTestResult('❌ Erro ao gerar link');
    }
    setLinking(false);
  };

  const botLink = linkCode ? `https://t.me/T2SimplynvestBot?start=${linkCode}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] rounded-lg border border-border bg-card shadow-xl animate-fade-in overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Telegram Bot</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Features grid */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">🤖 Funcionalidades do Bot</h3>
            <div className="grid grid-cols-2 gap-2">
              {features.map((f) => (
                <div key={f.label} className="rounded-lg border border-border bg-muted/30 p-2.5 flex items-start gap-2">
                  <f.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Link via bot */}
          <div className="rounded-md bg-primary/5 border border-primary/20 p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">📱 Vincular pelo Bot (Recomendado)</p>
            <p className="text-xs text-muted-foreground">
              Clique abaixo para gerar um link de vinculação. Abra no Telegram e clique "Start".
            </p>
            {botLink ? (
              <div className="space-y-2">
                <a
                  href={botLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 text-center"
                >
                  🤖 Abrir no Telegram
                </a>
                <p className="text-[10px] text-muted-foreground text-center">
                  Código: <span className="font-mono text-primary">{linkCode}</span>
                </p>
              </div>
            ) : (
              <button
                onClick={handleGenerateLink}
                disabled={linking}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Gerar Link de Vinculação
              </button>
            )}
          </div>

          {/* Manual config */}
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              ⚙️ Configuração manual (avançado)
            </summary>
            <div className="mt-3 space-y-3">
              <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">Como obter seu Chat ID:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Abra o Telegram e busque <span className="font-mono text-primary">@userinfobot</span></li>
                  <li>Envie qualquer mensagem e copie seu <b>Chat ID</b></li>
                </ol>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Chat ID</label>
                <input value={chatId} onChange={e => setChatId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="123456789" />
              </div>
            </div>
          </details>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary" />
            <span className="text-sm text-foreground">Ativar notificações via Telegram</span>
          </label>

          {testResult && (
            <div className={`rounded-md p-3 text-sm ${testResult.startsWith('✅') ? 'bg-gain/10 border border-gain/20 text-gain-foreground' : 'bg-loss/10 border border-loss/20 text-loss-foreground'}`}>
              {testResult}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleTest} disabled={testing || !chatId}
              className="flex-1 rounded-md border border-border bg-muted py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 flex items-center justify-center gap-2">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Testar
            </button>
            <button onClick={handleSave} disabled={loading}
              className="flex-1 rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
