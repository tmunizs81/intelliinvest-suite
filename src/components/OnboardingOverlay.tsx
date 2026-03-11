import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, LayoutDashboard, PlusCircle, BarChart3, Brain } from 'lucide-react';

interface Step {
  title: string;
  description: string;
  icon: typeof Sparkles;
  target?: string;
}

const steps: Step[] = [
  {
    title: 'Bem-vindo ao T2-Simplynvest!',
    description: 'Este é seu painel de controle inteligente de investimentos. Vamos fazer um tour rápido para você aproveitar ao máximo.',
    icon: Sparkles,
  },
  {
    title: 'Dashboard Personalizável',
    description: 'Seu dashboard é composto por widgets que você pode reorganizar. Clique em "Editar Layout" para arrastar e redimensionar os painéis.',
    icon: LayoutDashboard,
  },
  {
    title: 'Adicione seus Ativos',
    description: 'Vá em "Meus Ativos" no menu lateral para adicionar suas ações, FIIs, ETFs e criptos. Você também pode importar extratos da B3.',
    icon: PlusCircle,
  },
  {
    title: 'Análises com IA',
    description: 'Use o Chatbot flutuante (canto inferior direito), Health Score, Rebalanceamento e Backtesting — tudo powered by IA.',
    icon: Brain,
  },
  {
    title: 'Relatórios e Impostos',
    description: 'Acompanhe dividendos, calcule impostos (DARF) e gere relatórios detalhados. Tudo automático!',
    icon: BarChart3,
  },
];

const STORAGE_KEY = 'onboarding-completed';

export default function OnboardingOverlay() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      setTimeout(() => setShow(true), 1500);
    }
  }, []);

  const close = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const next = () => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else close();
  };

  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  if (!show) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <button onClick={close}
          className="absolute top-4 right-4 h-7 w-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
          <X className="h-4 w-4" />
        </button>

        <div className="p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{current.title}</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{current.description}</p>
          </div>
        </div>

        <div className="px-8 pb-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              }`} />
            ))}
          </div>

          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={prev}
                className="h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all">
                <ChevronLeft className="h-4 w-4" /> Voltar
              </button>
            )}
            <button onClick={next}
              className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 flex items-center gap-1 transition-all">
              {step === steps.length - 1 ? 'Começar!' : 'Próximo'}
              {step < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="px-8 pb-4 text-center">
          <button onClick={close} className="text-xs text-muted-foreground hover:text-foreground transition-all">
            Pular tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
