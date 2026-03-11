import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAITrader, type AnalysisType } from '@/hooks/useAITrader';
import {
  Brain, Send, Trash2, Square, Loader2, Sparkles,
  TrendingUp, ShoppingCart, PieChart, Globe, Shield, MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const analysisOptions: { type: AnalysisType; label: string; icon: React.ElementType; description: string; prompt: string }[] = [
  {
    type: 'position-trades',
    label: 'Position Trades',
    icon: TrendingUp,
    description: 'Sugestões de operações de médio/longo prazo',
    prompt: 'Analise minha carteira e sugira os melhores position trades para o momento atual. Quero entradas, stops, alvos e justificativa completa.',
  },
  {
    type: 'buy-sell',
    label: 'Compra & Venda',
    icon: ShoppingCart,
    description: 'O que comprar e vender agora',
    prompt: 'O que devo comprar e o que devo vender na minha carteira agora? Analise cada ativo e me dê recomendações claras com justificativa.',
  },
  {
    type: 'portfolio-review',
    label: 'Revisão da Carteira',
    icon: PieChart,
    description: 'Análise completa de diversificação e risco',
    prompt: 'Faça uma revisão completa da minha carteira. Analise diversificação, correlações, riscos e sugira melhorias na alocação.',
  },
  {
    type: 'macro-analysis',
    label: 'Análise Macro',
    icon: Globe,
    description: 'Cenário econômico e impacto na carteira',
    prompt: 'Analise o cenário macroeconômico atual e como ele impacta minha carteira. Considere Selic, inflação, dólar e cenário global.',
  },
  {
    type: 'risk-management',
    label: 'Gestão de Risco',
    icon: Shield,
    description: 'Análise de risco e proteção do patrimônio',
    prompt: 'Analise o risco da minha carteira. Identifique concentrações perigosas, sugira stops e dimensionamento adequado das posições.',
  },
];

export default function AITrader() {
  const { assets, loading: portfolioLoading } = usePortfolio();
  const { messages, isLoading, error, sendMessage, clearChat, stopGeneration } = useAITrader();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (text?: string, type?: AnalysisType) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;
    sendMessage(msg, assets, type || 'free');
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (option: typeof analysisOptions[number]) => {
    handleSend(option.prompt, option.type);
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
  };

  return (
    <div className="h-[calc(100vh)] flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-ai flex items-center justify-center">
              <Brain className="h-5 w-5 text-ai-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                InvestAI Pro Trader
                <Sparkles className="h-4 w-4 text-ai" />
              </h1>
              <p className="text-xs text-muted-foreground">
                Trader profissional com IA • {assets.length > 0 ? `${assets.length} ativos na carteira` : 'Carregando carteira...'}
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-loss/30 flex items-center gap-1.5 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 py-12">
            <div className="max-w-2xl w-full space-y-8">
              {/* Welcome */}
              <div className="text-center space-y-3">
                <div className="h-16 w-16 rounded-2xl gradient-ai flex items-center justify-center mx-auto">
                  <Brain className="h-8 w-8 text-ai-foreground" />
                </div>
                <h2 className="text-2xl font-bold">
                  Seu Trader Profissional com IA
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Análises de mercado, sugestões de trades, gestão de risco e muito mais.
                  Baseado na sua carteira real com dados do Yahoo Finance.
                </p>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysisOptions.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleQuickAction(option)}
                    disabled={isLoading || portfolioLoading || assets.length === 0}
                    className="group p-4 rounded-xl border border-border bg-card hover:border-ai/40 hover:bg-ai/5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-ai/10 flex items-center justify-center group-hover:bg-ai/20 transition-colors">
                        <option.icon className="h-4 w-4 text-ai" />
                      </div>
                      <span className="text-sm font-semibold">{option.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>

              {assets.length === 0 && !portfolioLoading && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    ⚠️ Adicione ativos na sua carteira para análises personalizadas
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-card border border-border rounded-bl-md'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_p]:text-sm [&_li]:text-sm [&_strong]:text-foreground [&_em]:text-muted-foreground [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <p className={`text-[10px] mt-2 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-ai" />
                    <span className="text-sm">Analisando...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-loss/30 bg-loss/5 px-4 py-2 text-xs text-loss-foreground">
          ⚠️ {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder={assets.length > 0
                  ? "Pergunte sobre seus investimentos, peça análises, sugestões de trades..."
                  : "Adicione ativos na carteira para análises personalizadas..."
                }
                rows={1}
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ai/30 focus:border-ai/50 transition-all"
                disabled={isLoading}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {isLoading ? (
                  <button
                    onClick={stopGeneration}
                    className="h-8 w-8 rounded-lg bg-loss/10 text-loss hover:bg-loss/20 flex items-center justify-center transition-colors"
                    title="Parar geração"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    className="h-8 w-8 rounded-lg bg-ai text-ai-foreground hover:opacity-90 flex items-center justify-center transition-all disabled:opacity-30"
                    title="Enviar"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Powered by Google Gemini • Dados reais via Yahoo Finance • Não constitui recomendação de investimento
          </p>
        </div>
      </div>
    </div>
  );
}
