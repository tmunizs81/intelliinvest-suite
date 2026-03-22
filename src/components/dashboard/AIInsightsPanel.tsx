import { Brain, AlertTriangle, Lightbulb, BarChart3, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { AISkeletonPanel } from '@/components/ui/ai-skeleton';
import { type Asset, type AIInsight, formatCurrency, formatPercent } from '@/lib/mockData';
import { useAIInsights } from '@/hooks/useAIInsights';
import { useEffect, useMemo } from 'react';

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
  const Icon = iconMap[insight.type] || BarChart3;
  return (
    <div className={`rounded-lg border p-4 ${severityStyles[insight.severity] || severityStyles.info} transition-all hover:scale-[1.01]`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Icon className={`h-4 w-4 ${
            insight.severity === 'warning' ? 'text-warning' :
            insight.severity === 'critical' ? 'text-loss' : 'text-primary'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold">{insight.title}</h3>
            {insight.ticker && (
              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded shrink-0">{insight.ticker}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
        </div>
      </div>
    </div>
  );
}

// Fallback insights when AI hasn't loaded yet
function generateFallbackInsights(assets: Asset[]): AIInsight[] {
  if (assets.length === 0 || assets.every(a => a.currentPrice === 0)) return [];
  const result: AIInsight[] = [];

  const topGainer = assets.reduce((best, a) => a.change24h > best.change24h ? a : best, assets[0]);
  if (topGainer && topGainer.change24h > 0) {
    result.push({
      id: 'fb-gainer', type: 'analysis',
      title: `${topGainer.ticker} lidera as altas`,
      description: `Alta de ${formatPercent(topGainer.change24h)} hoje.`,
      severity: 'info', ticker: topGainer.ticker, timestamp: new Date().toISOString(),
    });
  }

  const topLoser = assets.reduce((w, a) => a.change24h < w.change24h ? a : w, assets[0]);
  if (topLoser && topLoser.change24h < -0.5) {
    result.push({
      id: 'fb-loser', type: 'alert',
      title: `${topLoser.ticker} em queda`,
      description: `Variação de ${formatPercent(topLoser.change24h)} hoje.`,
      severity: 'warning', ticker: topLoser.ticker, timestamp: new Date().toISOString(),
    });
  }

  return result;
}

interface Props {
  assets: Asset[];
}

export default function AIInsightsPanel({ assets }: Props) {
  const { insights: aiInsights, summary, loading, error, lastGenerated, generateInsights } = useAIInsights();

  // Auto-generate on first load when assets are available
  useEffect(() => {
    if (assets.length > 0 && assets.some(a => a.currentPrice > 0) && !lastGenerated && !loading) {
      generateInsights(assets);
    }
  }, [assets, lastGenerated, loading, generateInsights]);

  const fallbackInsights = useMemo(() => generateFallbackInsights(assets), [assets]);
  const displayInsights = aiInsights.length > 0 ? aiInsights : fallbackInsights;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden glow-ai animate-fade-in">
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg gradient-ai flex items-center justify-center">
              <Brain className="h-4 w-4 text-ai-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                IA Insights
                <Sparkles className="h-4 w-4 text-ai" />
              </h2>
              <p className="text-xs text-muted-foreground">
                {aiInsights.length > 0 ? 'Google Gemini • Análise personalizada' : 'Análise em tempo real'}
              </p>
            </div>
          </div>
          <button
            onClick={() => generateInsights(assets)}
            disabled={loading || assets.every(a => a.currentPrice === 0)}
            className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-ai hover:border-ai/30 transition-all disabled:opacity-50"
            title="Gerar novos insights com IA"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {summary && (
          <div className="mt-3 px-3 py-2 rounded-md bg-ai/5 border border-ai/10">
            <p className="text-xs text-ai-foreground font-medium">{summary}</p>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {loading && aiInsights.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="relative">
              <Brain className="h-8 w-8 text-ai animate-pulse" />
              <Sparkles className="h-4 w-4 text-ai absolute -top-1 -right-1 animate-bounce" />
            </div>
            <p className="text-sm text-muted-foreground">Gemini analisando sua carteira...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-loss/20 bg-loss/5 p-3 text-xs text-loss-foreground">
            ⚠️ {error}
          </div>
        )}

        {displayInsights.map((insight, i) => (
          <div key={insight.id} style={{ animationDelay: `${i * 80}ms` }} className="animate-fade-in">
            <InsightCard insight={insight} />
          </div>
        ))}

        {lastGenerated && (
          <p className="text-[10px] text-muted-foreground text-center pt-2">
            Gerado em {lastGenerated.toLocaleTimeString('pt-BR')} via Google Gemini
          </p>
        )}
      </div>
    </div>
  );
}
