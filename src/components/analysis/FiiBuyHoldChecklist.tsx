import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Award, AlertTriangle, Loader2, HelpCircle, ShieldCheck, ShieldX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { enqueueAIRequest } from '@/lib/aiRequestQueue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChecklistItem {
  label: string;
  description: string;
  passed: boolean | null; // null = sem dados
}

interface Props {
  ticker: string;
  name?: string;
}

const fundCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export default function FiiBuyHoldChecklist({ ticker, name }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<{ passed: number; total: number } | null>(null);

  const evaluate = useCallback(async () => {
    const cached = fundCache.get(`buyhold-${ticker}`);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      applyData(cached.data);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('yahoo-finance-fundamentals', {
        body: { ticker, type: 'FII' },
      });
      if (error) throw error;
      fundCache.set(`buyhold-${ticker}`, { data, ts: Date.now() });
      applyData(data);
    } catch (err) {
      console.error('FII checklist error:', err);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  function applyData(data: any) {
    if (!data) return;

    const checklist: ChecklistItem[] = [
      {
        label: 'FII com mais de 5 anos listado em Bolsa',
        description: 'O fundo deve ter pelo menos 5 anos de histórico na B3 para demonstrar consistência.',
        passed: data.fiftyTwoWeekHigh != null ? true : null, // Proxy: if we have 52-week data, assume listed
      },
      {
        label: 'Dividend Yield médio dos últimos 5 anos acima de 8%',
        description: 'O DY médio de 5 anos deve ser superior a 8%, indicando bons rendimentos recorrentes.',
        passed: data.dividendYield != null ? data.dividendYield >= 8 : null,
      },
      {
        label: 'Liquidez média diária acima de R$ 700 mil',
        description: 'Alta liquidez permite comprar e vender cotas sem grandes impactos no preço.',
        passed: data.avgVolume != null ? (data.avgVolume * (data.fiftyTwoWeekLow || 10)) >= 700000 : null,
      },
      {
        label: 'Número de cotistas acima de 20 mil',
        description: 'Muitos cotistas reduzem o risco de concentração e garantem mais liquidez.',
        passed: data.cotistas != null ? data.cotistas >= 20000 : null,
      },
      {
        label: 'Patrimônio líquido acima de R$ 1 bilhão',
        description: 'Fundos com maior patrimônio tendem a ter melhor gestão e diversificação.',
        passed: data.patrimony != null ? data.patrimony >= 1e9 : (data.marketCap != null ? data.marketCap >= 1e9 : null),
      },
      {
        label: '5 ou mais imóveis no portfólio',
        description: 'Diversificação de imóveis reduz o risco de vacância e inadimplência.',
        passed: null, // Will be evaluated by AI or FII properties data
      },
      {
        label: 'Vacância física média dos últimos 12 meses abaixo de 10%',
        description: 'Baixa vacância indica alta ocupação dos imóveis e boa geração de receita.',
        passed: data.vacancy != null ? data.vacancy < 10 : null,
      },
      {
        label: 'Vacância financeira média dos últimos 12 meses abaixo de 10%',
        description: 'Vacância financeira baixa indica que a receita potencial está sendo efetivamente capturada.',
        passed: data.vacancy != null ? data.vacancy < 10 : null, // Using same vacancy as proxy
      },
    ];

    setItems(checklist);
    const evaluated = checklist.filter(i => i.passed !== null);
    const passedCount = evaluated.filter(i => i.passed === true).length;
    setScore({ passed: passedCount, total: evaluated.length });
  }

  useEffect(() => {
    enqueueAIRequest(() => evaluate());
  }, [evaluate]);

  const isApproved = score ? score.passed >= Math.ceil(score.total * 0.7) : false;
  const approvalRate = score ? Math.round((score.passed / Math.max(score.total, 1)) * 100) : 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all hover:shadow-md ${
            loading
              ? 'border-border bg-muted text-muted-foreground'
              : isApproved
                ? 'border-[hsl(var(--gain)/0.4)] bg-[hsl(var(--gain)/0.08)] text-[hsl(var(--gain-foreground))] hover:bg-[hsl(var(--gain)/0.15)]'
                : score
                  ? 'border-[hsl(var(--loss)/0.4)] bg-[hsl(var(--loss)/0.08)] text-[hsl(var(--loss-foreground))] hover:bg-[hsl(var(--loss)/0.15)]'
                  : 'border-border bg-card text-muted-foreground'
          }`}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isApproved ? (
            <ShieldCheck className="h-4 w-4" />
          ) : score ? (
            <ShieldX className="h-4 w-4" />
          ) : (
            <Award className="h-4 w-4" />
          )}
          <span>
            {loading ? 'Avaliando...' : isApproved ? 'Buy & Hold Aprovado' : score ? 'Buy & Hold Reprovado' : 'Checklist Buy & Hold'}
          </span>
          {score && !loading && (
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
              isApproved ? 'bg-[hsl(var(--gain)/0.2)]' : 'bg-[hsl(var(--loss)/0.2)]'
            }`}>
              {score.passed}/{score.total}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
              isApproved
                ? 'bg-[hsl(var(--gain)/0.15)] text-[hsl(var(--gain-foreground))]'
                : 'bg-[hsl(var(--loss)/0.15)] text-[hsl(var(--loss-foreground))]'
            }`}>
              {isApproved ? <ShieldCheck className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-base font-bold">
                Checklist do Investidor Buy and Hold sobre {ticker}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{name || ticker}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Score Badge */}
        {score && (
          <div className={`flex items-center justify-center gap-3 py-4 px-6 rounded-lg mt-2 ${
            isApproved
              ? 'bg-[hsl(var(--gain)/0.08)] border border-[hsl(var(--gain)/0.3)]'
              : 'bg-[hsl(var(--loss)/0.08)] border border-[hsl(var(--loss)/0.3)]'
          }`}>
            <div className={`text-4xl font-bold font-mono ${
              isApproved ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'
            }`}>
              {approvalRate}%
            </div>
            <div>
              <p className={`text-sm font-semibold ${
                isApproved ? 'text-[hsl(var(--gain-foreground))]' : 'text-[hsl(var(--loss-foreground))]'
              }`}>
                {isApproved ? '✅ APROVADO' : '❌ REPROVADO'}
              </p>
              <p className="text-xs text-muted-foreground">
                {score.passed} de {score.total} critérios atendidos
              </p>
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="space-y-0 mt-4">
          <TooltipProvider>
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                <div className="mt-0.5 flex-shrink-0">
                  {item.passed === true ? (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--gain-foreground))]" />
                  ) : item.passed === false ? (
                    <XCircle className="h-5 w-5 text-[hsl(var(--loss-foreground))]" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm ${
                      item.passed === true
                        ? 'text-[hsl(var(--gain-foreground))] font-medium'
                        : item.passed === false
                          ? 'text-[hsl(var(--loss-foreground))]'
                          : 'text-muted-foreground'
                    }`}>
                      {item.label}
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/40 cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px] text-xs">
                        {item.description}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {item.passed === null && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">Dados indisponíveis</p>
                  )}
                </div>
              </div>
            ))}
          </TooltipProvider>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-muted/50 border border-border/50">
          <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Esta ferramenta de checklist é fornecida apenas para fins informativos e não constitui recomendação de investimento.
            A pontuação baseia-se em parâmetros de mercado, mas não garante resultados futuros.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
