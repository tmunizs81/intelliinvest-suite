import { Brain, AlertTriangle, Lightbulb, BarChart3, Sparkles } from 'lucide-react';
import { mockInsights, type AIInsight } from '@/lib/mockData';

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

export default function AIInsightsPanel() {
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
          <p className="text-xs text-muted-foreground">Análise em tempo real por inteligência artificial</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {mockInsights.map((insight, i) => (
          <div key={insight.id} style={{ animationDelay: `${i * 100}ms` }} className="animate-fade-in">
            <InsightCard insight={insight} />
          </div>
        ))}
      </div>
    </div>
  );
}
