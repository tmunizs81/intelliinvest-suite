import { useState, useCallback } from 'react';
import { type Asset, formatCurrency } from '@/lib/mockData';
import { FileText, Download, Loader2, Printer } from 'lucide-react';

export default function FiscalReportPanel({ assets }: { assets: Asset[] }) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = useCallback(async () => {
    setGenerating(true);
    try {
      const totalInvested = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
      const totalCurrent = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
      const gain = totalCurrent - totalInvested;

      const content = `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Relatório Fiscal - Investimentos</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 12px; }
  h1 { color: #0d9668; border-bottom: 2px solid #0d9668; padding-bottom: 8px; font-size: 20px; }
  h2 { color: #555; margin-top: 24px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  .right { text-align: right; }
  .gain { color: #0d9668; }
  .loss { color: #e53e3e; }
  .summary { background: #f7f7f7; padding: 16px; border-radius: 6px; margin: 16px 0; }
  .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #999; }
</style>
</head><body>
<h1>📊 Relatório Fiscal de Investimentos</h1>
<p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>

<div class="summary">
  <strong>Resumo Patrimonial</strong><br>
  Total Investido: R$ ${totalInvested.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<br>
  Valor Atual: R$ ${totalCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<br>
  Resultado: <span class="${gain >= 0 ? 'gain' : 'loss'}">R$ ${gain.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
</div>

<h2>Posição Detalhada por Ativo</h2>
<table>
  <tr><th>Ticker</th><th>Nome</th><th>Tipo</th><th>Qtd</th><th class="right">PM</th><th class="right">Atual</th><th class="right">Custo Total</th><th class="right">Valor Atual</th><th class="right">Resultado</th></tr>
  ${assets.map(a => {
    const cost = a.avgPrice * a.quantity;
    const val = a.currentPrice * a.quantity;
    const diff = val - cost;
    return `<tr>
      <td><strong>${a.ticker}</strong></td>
      <td>${a.name}</td>
      <td>${a.type}</td>
      <td>${a.quantity}</td>
      <td class="right">R$ ${a.avgPrice.toFixed(2)}</td>
      <td class="right">R$ ${a.currentPrice.toFixed(2)}</td>
      <td class="right">R$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="right">R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td class="right ${diff >= 0 ? 'gain' : 'loss'}">R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('')}
</table>

<h2>Agrupamento por Tipo</h2>
<table>
  <tr><th>Tipo</th><th class="right">Qtd Ativos</th><th class="right">Custo Total</th><th class="right">Valor Atual</th></tr>
  ${Object.entries(assets.reduce((acc, a) => {
    const type = a.type || 'Outros';
    if (!acc[type]) acc[type] = { count: 0, cost: 0, value: 0 };
    acc[type].count++;
    acc[type].cost += a.avgPrice * a.quantity;
    acc[type].value += a.currentPrice * a.quantity;
    return acc;
  }, {} as Record<string, { count: number; cost: number; value: number }>)).map(([type, d]) =>
    `<tr><td>${type}</td><td class="right">${d.count}</td><td class="right">R$ ${d.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td class="right">R$ ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`
  ).join('')}
</table>

<div class="footer">
  <p>Este relatório é informativo e não substitui orientação contábil profissional.</p>
  <p>Gerado automaticamente pelo T2-Simplynvest</p>
</div>
</body></html>`;

      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, '_blank');
      if (printWin) {
        printWin.onload = () => {
          printWin.print();
        };
      }
    } finally {
      setGenerating(false);
    }
  }, [assets]);

  const downloadCSV = useCallback(() => {
    const header = 'Ticker,Nome,Tipo,Quantidade,Preço Médio,Preço Atual,Custo Total,Valor Atual,Resultado\n';
    const rows = assets.map(a => {
      const cost = a.avgPrice * a.quantity;
      const val = a.currentPrice * a.quantity;
      return `${a.ticker},${a.name},${a.type},${a.quantity},${a.avgPrice.toFixed(2)},${a.currentPrice.toFixed(2)},${cost.toFixed(2)},${val.toFixed(2)},${(val - cost).toFixed(2)}`;
    }).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-fiscal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [assets]);

  return (
    <div className="p-4 h-full flex flex-col space-y-4">
      <div className="text-center space-y-2">
        <FileText className="h-10 w-10 mx-auto text-primary opacity-80" />
        <p className="text-sm font-semibold">Relatório Fiscal</p>
        <p className="text-[10px] text-muted-foreground">Gere um relatório formatado da sua carteira para enviar ao contador</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={generatePDF}
          disabled={generating || assets.length === 0}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
        >
          {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5 text-primary" />}
          <span className="text-xs font-medium">Imprimir / PDF</span>
          <span className="text-[9px] text-muted-foreground">Via diálogo de impressão</span>
        </button>
        <button
          onClick={downloadCSV}
          disabled={assets.length === 0}
          className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all disabled:opacity-50"
        >
          <Download className="h-5 w-5 text-primary" />
          <span className="text-xs font-medium">Exportar CSV</span>
          <span className="text-[9px] text-muted-foreground">Excel / Google Sheets</span>
        </button>
      </div>

      {/* Summary preview */}
      {assets.length > 0 && (
        <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Prévia do relatório</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Ativos</p>
              <p className="text-sm font-bold font-mono">{assets.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Investido</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0))}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Valor Atual</p>
              <p className="text-sm font-bold font-mono">{formatCurrency(assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0))}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
