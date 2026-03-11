import { type Asset, formatCurrency } from './mockData';

/**
 * Export data as CSV and trigger download
 */
export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const csv = BOM + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPortfolioCSV(assets: Asset[]) {
  const headers = ['Ticker', 'Nome', 'Tipo', 'Quantidade', 'Preço Médio', 'Preço Atual', 'Total', 'Resultado', 'Resultado %', 'Alocação %'];
  const rows = assets.map(a => {
    const total = a.currentPrice * a.quantity;
    const cost = a.avgPrice * a.quantity;
    const profit = total - cost;
    const profitPct = a.avgPrice > 0 ? ((a.currentPrice - a.avgPrice) / a.avgPrice) * 100 : 0;
    return [
      a.ticker,
      a.name,
      a.type,
      a.quantity.toString(),
      a.avgPrice.toFixed(2),
      a.currentPrice.toFixed(2),
      total.toFixed(2),
      profit.toFixed(2),
      profitPct.toFixed(2),
      a.allocation.toFixed(1),
    ];
  });
  exportCSV(`carteira_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
}

export function exportTransactionsCSV(transactions: any[]) {
  const headers = ['Data', 'Ticker', 'Nome', 'Tipo', 'Operação', 'Quantidade', 'Preço', 'Total', 'Taxas', 'Day Trade', 'Notas'];
  const rows = transactions.map(t => [
    t.date,
    t.ticker,
    t.name,
    t.type,
    t.operation === 'buy' ? 'Compra' : 'Venda',
    t.quantity.toString(),
    t.price.toFixed(2),
    t.total.toFixed(2),
    t.fees.toFixed(2),
    t.is_daytrade ? 'Sim' : 'Não',
    t.notes || '',
  ]);
  exportCSV(`transacoes_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
}
