import { useState } from 'react';
import { X, Loader2, Send, MessageCircle } from 'lucide-react';
import type { TelegramSettings } from '@/hooks/useAlerts';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: TelegramSettings;
  onSave: (settings: TelegramSettings) => Promise<void>;
}

export default function TelegramSettingsModal({ open, onClose, settings, onSave }: Props) {
  const [botToken, setBotToken] = useState(settings.bot_token || '');
  const [chatId, setChatId] = useState(settings.chat_id || '');
  const [enabled, setEnabled] = useState(settings.enabled);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!open) return null;

  const handleSave = async () => {
    setLoading(true);
    await onSave({ bot_token: botToken || null, chat_id: chatId || null, enabled });
    setLoading(false);
    onClose();
  };

  const handleTest = async () => {
    if (!botToken || !chatId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ InvestAI - Teste de conexão\n\nSeu bot Telegram está configurado corretamente!',
          parse_mode: 'HTML',
        }),
      });
      const data = await resp.json();
      setTestResult(data.ok ? '✅ Mensagem enviada com sucesso!' : `❌ Erro: ${data.description}`);
    } catch (err) {
      setTestResult('❌ Falha na conexão');
    }
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Configurar Telegram</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-md bg-muted/50 border border-border p-3 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Como configurar:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Abra o Telegram e busque <span className="font-mono text-primary">@BotFather</span></li>
              <li>Envie <span className="font-mono">/newbot</span> e siga as instruções</li>
              <li>Copie o <b>Token</b> do bot gerado</li>
              <li>Inicie conversa com seu bot e envie qualquer mensagem</li>
              <li>Acesse <span className="font-mono">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span></li>
              <li>Copie o <b>Chat ID</b> do resultado</li>
            </ol>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Bot Token</label>
            <input value={botToken} onChange={e => setBotToken(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="123456789:ABCdef..." type="password" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Chat ID</label>
            <input value={chatId} onChange={e => setChatId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="123456789" />
          </div>

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
            <button onClick={handleTest} disabled={testing || !botToken || !chatId}
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
