import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/mockData';
import { toast } from 'sonner';

interface Snapshot { snapshot_date: string; total_value: number; total_cost: number }
interface Decision {
  ticker: string; action: string; entry_price: number | null; stop_price: number | null;
  target_price: number | null; status: string; outcome_pct: number | null; rationale: string | null;
  created_at: string; conversation_id: string | null;
}

function computeRisk(snaps: Snapshot[]) {
  if (snaps.length < 5) return null;
  const returns: number[] = [];
  for (let i = 1; i < snaps.length; i++) {
    const p = snaps[i - 1].total_value, c = snaps[i].total_value;
    if (p > 0) returns.push((c - p) / p);
  }
  if (!returns.length) return null;
  const mean = returns.reduce((s, x) => s + x, 0) / returns.length;
  const variance = returns.reduce((s, x) => s + (x - mean) ** 2, 0) / returns.length;
  const annualVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
  const annualRet = (Math.pow(1 + mean, 252) - 1) * 100;
  const rf = 11;
  const sharpe = annualVol > 0 ? (annualRet - rf) / annualVol : 0;
  let peak = snaps[0].total_value, maxDD = 0;
  for (const r of snaps) {
    if (r.total_value > peak) peak = r.total_value;
    const dd = peak > 0 ? (r.total_value - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  const first = snaps[0].total_value, last = snaps[snaps.length - 1].total_value;
  const totalRet = first > 0 ? ((last - first) / first) * 100 : 0;
  return { annualRet, annualVol, sharpe, maxDD: maxDD * 100, totalRet, first, last };
}

export function MonthlyReportButton() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const startISO = start.toISOString().split('T')[0];
      const endISO = now.toISOString().split('T')[0];

      const [snapRes, decRes, convRes] = await Promise.all([
        supabase.from('portfolio_snapshots')
          .select('snapshot_date,total_value,total_cost')
          .eq('user_id', user.id).gte('snapshot_date', startISO).lte('snapshot_date', endISO)
          .order('snapshot_date', { ascending: true }),
        supabase.from('ai_trader_decisions')
          .select('ticker,action,entry_price,stop_price,target_price,status,outcome_pct,rationale,created_at,conversation_id')
          .eq('user_id', user.id).gte('created_at', start.toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('ai_conversations')
          .select('id,title,updated_at,analysis_type')
          .eq('user_id', user.id).eq('analysis_type', 'debate')
          .gte('updated_at', start.toISOString())
          .order('updated_at', { ascending: false }).limit(3),
      ]);

      const snaps = (snapRes.data || []) as Snapshot[];
      const decisions = (decRes.data || []) as Decision[];
      const convs = (convRes.data || []) as { id: string; title: string; updated_at: string }[];

      // Latest debate messages (last assistant reply per conversation)
      const debates: { title: string; content: string; date: string }[] = [];
      for (const c of convs) {
        const { data: msgs } = await supabase.from('ai_messages')
          .select('content,role,created_at').eq('conversation_id', c.id).eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(2);
        const last = (msgs || []).find((m: any) => m.role === 'assistant');
        if (last) debates.push({ title: c.title, content: (last as any).content.slice(0, 2500), date: c.updated_at });
      }

      const risk = computeRisk(snaps);
      const monthLabel = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      const snapshotRows = snaps.map(s => `
        <tr>
          <td>${new Date(s.snapshot_date).toLocaleDateString('pt-BR')}</td>
          <td class="text-right mono">${formatCurrency(s.total_value)}</td>
          <td class="text-right mono">${formatCurrency(s.total_cost)}</td>
          <td class="text-right mono ${(s.total_value - s.total_cost) >= 0 ? 'positive' : 'negative'}">${formatCurrency(s.total_value - s.total_cost)}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#999;padding:16px">Sem snapshots no período.</td></tr>';

      const decRows = decisions.map(d => `
        <tr>
          <td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
          <td><strong>${d.ticker}</strong></td>
          <td>${(d.action || '').toUpperCase()}</td>
          <td class="text-right mono">${d.entry_price ? formatCurrency(d.entry_price) : '—'}</td>
          <td class="text-right mono">${d.stop_price ? formatCurrency(d.stop_price) : '—'}</td>
          <td class="text-right mono">${d.target_price ? formatCurrency(d.target_price) : '—'}</td>
          <td><span class="badge badge-${d.status}">${d.status}</span></td>
          <td class="text-right mono ${(d.outcome_pct || 0) >= 0 ? 'positive' : 'negative'}">${d.outcome_pct != null ? d.outcome_pct.toFixed(2) + '%' : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#999;padding:16px">Nenhuma decisão registrada.</td></tr>';

      const debateBlocks = debates.map(d => `
        <div class="debate">
          <h3>🗣️ ${d.title} <span class="date">${new Date(d.date).toLocaleDateString('pt-BR')}</span></h3>
          <pre>${d.content.replace(/</g, '&lt;')}</pre>
        </div>`).join('') || '<p style="color:#999">Sem análises Bull × Bear no período.</p>';

      const riskBlock = risk ? `
        <div class="summary-grid">
          <div class="summary-card"><div class="label">Retorno período</div><div class="value ${risk.totalRet >= 0 ? 'positive' : 'negative'}">${risk.totalRet.toFixed(2)}%</div></div>
          <div class="summary-card"><div class="label">Retorno anualizado</div><div class="value">${risk.annualRet.toFixed(2)}%</div></div>
          <div class="summary-card"><div class="label">Volatilidade anual</div><div class="value">${risk.annualVol.toFixed(2)}%</div></div>
          <div class="summary-card"><div class="label">Sharpe (rf CDI 11%)</div><div class="value ${risk.sharpe >= 0.5 ? 'positive' : ''}">${risk.sharpe.toFixed(2)}</div></div>
          <div class="summary-card"><div class="label">Max Drawdown</div><div class="value negative">${risk.maxDD.toFixed(2)}%</div></div>
          <div class="summary-card"><div class="label">Patrimônio final</div><div class="value">${formatCurrency(risk.last)}</div></div>
        </div>` : '<p style="color:#999">Histórico insuficiente para calcular métricas de risco (mínimo 5 snapshots).</p>';

      const w = window.open('', '_blank');
      if (!w) { toast.error('Bloqueador de pop-ups impediu abrir o relatório.'); return; }
      w.document.write(`<!DOCTYPE html><html><head><title>Relatório Mensal — ${monthLabel}</title>
        <style>
          *{box-sizing:border-box;margin:0;padding:0}
          body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;background:#fff;padding:40px}
          h1{font-size:26px;color:#0d9488;margin-bottom:4px}
          h2{font-size:18px;margin:28px 0 12px;color:#1a1a2e;border-bottom:2px solid #0d9488;padding-bottom:6px}
          h3{font-size:14px;margin:12px 0 6px;color:#374151}
          .subtitle{color:#666;font-size:13px;margin-bottom:24px}
          .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:12px 0 20px}
          .summary-card{padding:14px;border:1px solid #e5e7eb;border-radius:8px}
          .summary-card .label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px}
          .summary-card .value{font-size:18px;font-weight:700;margin-top:4px}
          .positive{color:#0d9488}.negative{color:#ef4444}
          table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}
          th{background:#f3f4f6;text-align:left;padding:7px 10px;font-weight:600;border-bottom:2px solid #e5e7eb}
          td{padding:6px 10px;border-bottom:1px solid #f0f0f0}
          .text-right{text-align:right}.mono{font-family:'JetBrains Mono',monospace}
          .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;text-transform:uppercase}
          .badge-open{background:#dbeafe;color:#1e40af}
          .badge-triggered{background:#fef3c7;color:#92400e}
          .badge-closed{background:#d1fae5;color:#065f46}
          .debate{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:12px 0;background:#fafafa}
          .debate h3{margin:0 0 8px;color:#0d9488}
          .debate .date{color:#888;font-size:10px;font-weight:400;margin-left:8px}
          .debate pre{white-space:pre-wrap;font-family:'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#333}
          .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#999;text-align:center}
          @media print{body{padding:20px}.no-print{display:none}}
        </style></head><body>
        <h1>📅 Relatório Mensal — ${monthLabel}</h1>
        <p class="subtitle">SimplyNvest • Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}</p>
        <div class="no-print" style="margin-bottom:20px">
          <button onclick="window.print()" style="padding:8px 16px;background:#0d9488;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:600">🖨️ Imprimir / Salvar PDF</button>
        </div>
        <h2>Métricas de Risco</h2>${riskBlock}
        <h2>Evolução Patrimonial</h2>
        <table><thead><tr><th>Data</th><th class="text-right">Patrimônio</th><th class="text-right">Custo</th><th class="text-right">Resultado</th></tr></thead>
        <tbody>${snapshotRows}</tbody></table>
        <h2>Decisões IA Registradas (${decisions.length})</h2>
        <table><thead><tr><th>Data</th><th>Ticker</th><th>Ação</th><th class="text-right">Entrada</th><th class="text-right">Stop</th><th class="text-right">Alvo</th><th>Status</th><th class="text-right">Resultado</th></tr></thead>
        <tbody>${decRows}</tbody></table>
        <h2>Debate Bull × Bear (últimas análises)</h2>${debateBlocks}
        <div class="footer">Documento gerado automaticamente pelo SimplyNvest — não constitui recomendação formal de investimento.</div>
        </body></html>`);
      w.document.close();
    } catch (e: any) {
      toast.error('Falha ao gerar relatório: ' + (e?.message || 'erro'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={generate}
      disabled={loading}
      className="h-9 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm font-medium flex items-center gap-2 hover:bg-primary/20 transition-colors disabled:opacity-60"
      title="Relatório PDF do mês atual: evolução, risco, decisões e debates"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Relatório Mensal
    </button>
  );
}
