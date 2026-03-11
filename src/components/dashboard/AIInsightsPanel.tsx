import { Brain, AlertTriangle, Lightbulb, BarChart3, Sparkles } from 'lucide-react';
import { type Asset, type AIInsight, formatCurrency, formatPercent } from '@/lib/mockData';
import { useMemo } from 'react';

const iconMap = {
  alert: AlertTriangle,
  recommendation: Lightbulb,
  analysis: BarChart3,
};

const severityStyles = {
  info: 'border-primary/20 gradient-gain',
  warning: 'border-warning/30 bg-warning/5',
  critical: 'border-loss/30 gradient-loss',
};

function InsightCard({ insight }: { insight: AIInsight }) {
  const Icon = iconMap[insight.type];
  return (
    <div className={`rounded-lg border p-4 ${severityStyles[insight.severity]} transition-all hover:scale-[1.01]`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Icon className={`h-4 w-4 ${
            insight.severity === 'warning' ? 'text-warning' :
            insight.severity === 'critical' ? 'text-loss' : 'text-primary'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold truncate">{insight.title}</h3>
            {insight.ticker && (
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{insight.ticker}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
        </div>
      </div>
    </div>
  );
}

interface Props {
  assets: Asset[];
}

export default function AIInsightsPanel({ assets }: Props) {
  // Generate dynamic insights based on real data
  const insights = useMemo<AIInsight[]>(() => {
    const result: AIInsight[] = [];

    // Find top gainer
    const topGainer = assets.reduce((best, a) => a.change24h > best.change24h ? a : best, assets[0]);
    if (topGainer && topGainer.change24h > 0) {
      result.push({
        id: 'gainer',
        type: 'analysis',
        title: `${topGainer.ticker} é o destaque do dia`,
        description: `Alta de ${formatPercent(topGainer.change24h)} hoje. Posição vale ${formatCurrency(topGainer.currentPrice * topGainer.quantity)}.`,
        severity: 'info',
        ticker: topGainer.ticker,
        timestamp: new Date().toISOString(),
      });
    }

    // Find top loser
    const topLoser = assets.reduce((worst, a) => a.change24h < worst.change24h ? a : worst, assets[0]);
    if (topLoser && topLoser.change24h < -1) {
      result.push({
        id: 'loser',
        type: 'alert',
        title: `${topLoser.ticker} em queda acentuada`,
        description: `Variação de ${formatPercent(topLoser.change24h)} hoje. Monitore suportes e considere ajustar stop loss.`,
        severity: 'warning',
        ticker: topLoser.ticker,
        timestamp: new Date().toISOString(),
      });
    }

    // Concentration alert
    const maxAlloc = assets.reduce((best, a) => a.allocation > best.allocation ? a : best, assets[0]);
    if (maxAlloc && maxAlloc.allocation > 20) {
      result.push({
        id: 'concentration',
        type: 'recommendation',
        title: 'Concentração elevada detectada',
        description: `${maxAlloc.ticker} representa ${maxAlloc.allocation.toFixed(1)}% da carteira. Considere diversificar para reduzir risco.`,
        severity: 'warning',
        ticker: maxAlloc.ticker,
        timestamp: new Date().toISOString(),
      });
    }

    // Portfolio performance
    const totalValue = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    const totalCost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
    if (totalReturn > 10) {
      result.push({
        id: 'performance',
        type: 'analysis',
        title: 'Carteira com performance sólida',
        description: `Retorno total de ${formatPercent(totalReturn)} sobre o custo. Patrimônio atual: ${formatCurrency(totalValue)}.`,
        severity: 'info',
        timestamp: new Date().toISOString(),
      });
    }

    // Sector grouping insight
    const sectors = assets.reduce<Record<string, number>>((acc, a) => {
      const s = a.sector || 'Outros';
      acc[s] = (acc[s] || 0) + a.allocation;
      return acc;
    }, {});
    const topSector = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0];
    if (topSector && topSector[1] > 25) {
      result.push({
        id: 'sector',
        type: 'recommendation',
        title: `Exposição alta em ${topSector[0]}`,
        description: `Setor de ${topSector[0]} representa ${topSector[1].toFixed(1)}% da carteira. Diversifique setorialmente para melhor gestão de risco.`,
        severity: 'info',
        timestamp: new Date().toISOString(),
      });
    }

    return result.length > 0 ? result : [{
      id: 'ok',
      type: 'analysis',
      title: 'Carteira equilibrada',
      description: 'Nenhum alerta crítico no momento. Continue monitorando.',
      severity: 'info',
      timestamp: new Date().toISOString(),
    }];
  }, [assets]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden glow-ai animate-fade-in">
      <div className="p-5 border-b border-border flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg gradient-ai flex items-center justify-center">
          <Brain className="h-4 w-4 text-ai-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            IA Insights
            <Sparkles className="h-4 w-4 text-ai" />
          </h2>
          <p className="text-xs text-muted-foreground">Análise em tempo real dos seus ativos</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {insights.map((insight, i) => (
          <div key={insight.id} style={{ animationDelay: `${i * 100}ms` }} className="animate-fade-in">
            <InsightCard insight={insight} />
          </div>
        ))}
      </div>
    </div>
  );
}
