import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import { Loader2, FileSpreadsheet, Code, Link2, Copy, Check, Webhook } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  assets: Asset[];
}

export default function IntegrationsPanel({ assets }: Props) {
  return (
    <div className="p-4 space-y-4">
      <GoogleSheetsExport assets={assets} />
      <NotionEmbed />
      <WebhookConfig />
    </div>
  );
}

function GoogleSheetsExport({ assets }: { assets: Asset[] }) {
  const [loading, setLoading] = useState(false);

  const exportToCSV = () => {
    setLoading(true);
    try {
      const headers = ['Ticker', 'Nome', 'Tipo', 'Quantidade', 'Preço Médio', 'Preço Atual', 'Variação', 'Valor Total', 'Alocação'];
      const rows = assets.map(a => [
        a.ticker, a.name, a.type, a.quantity,
        a.avgPrice.toFixed(2), a.currentPrice.toFixed(2),
        a.change24h.toFixed(2) + '%',
        (a.currentPrice * a.quantity).toFixed(2),
        a.allocation.toFixed(1) + '%',
      ]);
      const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `carteira-simplynvest-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado! Importe no Google Sheets via Arquivo → Importar');
    } catch {
      toast.error('Erro ao exportar');
    }
    setLoading(false);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">Google Sheets</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Exporte sua carteira em CSV compatível com Google Sheets</p>
      <button onClick={exportToCSV} disabled={loading || assets.length === 0}
        className="w-full py-2 rounded-md bg-green-600/10 border border-green-600/20 text-sm font-medium text-green-600 hover:bg-green-600/20 disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Exportar CSV para Sheets
      </button>
    </div>
  );
}

function NotionEmbed() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const embedUrl = `${window.location.origin}/embed/portfolio?uid=${user?.id || ''}`;

  const copyEmbed = () => {
    const embedCode = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" style="border-radius:12px;border:1px solid #333"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success('Código embed copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4 text-foreground" />
        <span className="text-sm font-medium">Notion / Obsidian</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Copie o código embed para inserir um resumo da carteira em suas notas</p>
      <button onClick={copyEmbed}
        className="w-full py-2 rounded-md bg-muted border border-border text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 flex items-center justify-center gap-2">
        {copied ? <Check className="h-4 w-4 text-gain" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copiado!' : 'Copiar Código Embed'}
      </button>
    </div>
  );
}

function WebhookConfig() {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const saveWebhook = async () => {
    if (!user || !url.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('telegram_settings').upsert({
        user_id: user.id,
        bot_token: url.trim(), // reusing field for webhook URL storage
        enabled: true,
      }, { onConflict: 'user_id' });
      if (error) throw error;
      toast.success('Webhook salvo!');
    } catch {
      toast.error('Erro ao salvar webhook');
    }
    setSaving(false);
  };

  const testWebhook = async () => {
    if (!url.trim()) return;
    setTesting(true);
    try {
      const resp = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          message: 'Teste de webhook do T2-Simplynvest',
        }),
      });
      toast.success(resp.ok ? 'Webhook respondeu com sucesso!' : `Webhook respondeu com status ${resp.status}`);
    } catch {
      toast.error('Falha ao conectar ao webhook');
    }
    setTesting(false);
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Webhook className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Webhook Customizável</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Configure um webhook para integrar com Zapier, n8n, Make, etc.</p>
      <input
        value={url} onChange={e => setUrl(e.target.value)}
        placeholder="https://hooks.zapier.com/..."
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex gap-2">
        <button onClick={testWebhook} disabled={testing || !url.trim()}
          className="flex-1 py-2 rounded-md border border-border text-xs font-medium hover:bg-accent disabled:opacity-50 flex items-center justify-center gap-1">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Testar
        </button>
        <button onClick={saveWebhook} disabled={saving || !url.trim()}
          className="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar
        </button>
      </div>
    </div>
  );
}
