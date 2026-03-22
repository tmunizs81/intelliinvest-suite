import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { useAIRateLimit } from '@/hooks/useAIRateLimit';
import { checkAIProviderFallback } from '@/lib/aiProviderToast';
import { Shield, Loader2, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { AIScoreSkeleton } from '@/components/ui/ai-skeleton';

interface RiskAnalysis {
  riskScore: number;
  riskLevel: string;
  concentrationRisk: string;
  diversificationScore: number;
  topRisks: Array<{ risk: string; severity: string; mitigation: string }>;
  suggestions: string[];
  summary: string;
}

interface Props {
  assets: Asset[];
}

const severityColors: Record<string, string> = {
  alta: 'text-loss bg-loss/10',
  média: 'text-warning bg-warning/10',
  baixa: 'text-gain bg-gain/10',
};

const riskLevelColors: Record<string, string> = {
  Conservador: 'text-gain',
  Moderado: 'text-warning',
  Arrojado: 'text-orange-400',
  Agressivo: 'text-loss',
};

export default function AIRiskPanel({ assets }: Props) {
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const { canCall, recordCall } = useAIRateLimit();

  const analyze = async () => {
    if (!canCall() || assets.length === 0) return;
    recordCall();
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-risk-analysis', {
        body: { assets },
      });
      if (error) throw error;
      checkAIProviderFallback(data);
      setAnalysis(data);
    } catch {
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-loss/10 flex items-center justify-center">
            <Shield className="h-3.5 w-3.5 text-loss" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Análise de Risco IA</h3>
            <p className="text-[10px] text-muted-foreground">Concentração e diversificação</p>
          </div>
        </div>
        {analysis && (
          <button onClick={analyze} disabled={loading} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center hover:bg-accent">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!analysis && !loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Shield className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">
              Analise os riscos da sua carteira com IA
            </p>
            <button
              onClick={analyze}
              disabled={assets.length === 0}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              Analisar Riscos
            </button>
          </div>
        )}

        {loading && (
          <AIScoreSkeleton />
        )}

        {analysis && !loading && (
          <div className="space-y-4">
            {/* Score gauges */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Risco Geral</p>
                <p className={`text-2xl font-bold font-mono ${
                  analysis.riskScore <= 3 ? 'text-gain' :
                  analysis.riskScore <= 6 ? 'text-warning' : 'text-loss'
                }`}>{analysis.riskScore}/10</p>
                <p className={`text-[10px] font-medium ${riskLevelColors[analysis.riskLevel] || 'text-foreground'}`}>
                  {analysis.riskLevel}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Diversificação</p>
                <p className={`text-2xl font-bold font-mono ${
                  analysis.diversificationScore >= 7 ? 'text-gain' :
                  analysis.diversificationScore >= 4 ? 'text-warning' : 'text-loss'
                }`}>{analysis.diversificationScore}/10</p>
                <p className={`text-[10px] font-medium ${
                  analysis.concentrationRisk === 'Baixo' ? 'text-gain' :
                  analysis.concentrationRisk === 'Médio' ? 'text-warning' : 'text-loss'
                }`}>
                  Concentração: {analysis.concentrationRisk}
                </p>
              </div>
            </div>

            {/* Summary */}
            <p className="text-xs text-muted-foreground leading-relaxed">{analysis.summary}</p>

            {/* Top Risks */}
            {analysis.topRisks && analysis.topRisks.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Principais Riscos</p>
                {analysis.topRisks.map((risk, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-muted/30 space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                      <span className="text-xs font-medium flex-1">{risk.risk}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${severityColors[risk.severity] || ''}`}>
                        {risk.severity}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground pl-5">💡 {risk.mitigation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {analysis.suggestions && analysis.suggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sugestões</p>
                {analysis.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-gain shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
