import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useAITrader, type AnalysisType, type Conversation } from '@/hooks/useAITrader';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import {
  Brain, Send, Trash2, Square, Loader2, Sparkles,
  TrendingUp, ShoppingCart, PieChart, Globe, Shield,
  PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose,
  Wallet, ArrowUpRight, ArrowDownRight,
  Plus, MessageSquare, Clock, MoreVertical, X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const analysisOptions: { type: AnalysisType; label: string; icon: React.ElementType; description: string; prompt: string }[] = [
  {
    type: 'position-trades', label: 'Position Trades', icon: TrendingUp,
    description: 'Sugestões de operações de médio/longo prazo',
    prompt: 'Analise minha carteira e sugira os melhores position trades para o momento atual. Quero entradas, stops, alvos e justificativa completa.',
  },
  {
    type: 'buy-sell', label: 'Compra & Venda', icon: ShoppingCart,
    description: 'O que comprar e vender agora',
    prompt: 'O que devo comprar e o que devo vender na minha carteira agora? Analise cada ativo e me dê recomendações claras com justificativa.',
  },
  {
    type: 'portfolio-review', label: 'Revisão da Carteira', icon: PieChart,
    description: 'Análise completa de diversificação e risco',
    prompt: 'Faça uma revisão completa da minha carteira. Analise diversificação, correlações, riscos e sugira melhorias na alocação.',
  },
  {
    type: 'macro-analysis', label: 'Análise Macro', icon: Globe,
    description: 'Cenário econômico e impacto na carteira',
    prompt: 'Analise o cenário macroeconômico atual e como ele impacta minha carteira. Considere Selic, inflação, dólar e cenário global.',
  },
  {
    type: 'risk-management', label: 'Gestão de Risco', icon: Shield,
    description: 'Análise de risco e proteção do patrimônio',
    prompt: 'Analise o risco da minha carteira. Identifique concentrações perigosas, sugira stops e dimensionamento adequado das posições.',
  },
];

const analysisLabels: Record<string, string> = {
  'position-trades': 'Position Trade',
  'buy-sell': 'Compra & Venda',
  'portfolio-review': 'Revisão',
  'macro-analysis': 'Macro',
  'risk-management': 'Risco',
};

// --- History Sidebar ---
function HistorySidebar({ conversations, activeId, open, onToggle, onSelect, onDelete, onNewChat }: {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  if (!open) return null;

  const grouped = groupByDate(conversations);

  return (
    <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="px-3 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Histórico</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
            title="Nova conversa"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground">Nenhuma conversa ainda</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Suas análises serão salvas aqui</p>
          </div>
        ) : (
          <div className="py-2">
            {grouped.map(({ label, items }) => (
              <div key={label}>
                <p className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  {label}
                </p>
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative mx-2 mb-0.5 rounded-lg px-3 py-2 cursor-pointer transition-all ${
                      conv.id === activeId
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-accent/50'
                    }`}
                    onClick={() => onSelect(conv.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{conv.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {conv.analysisType && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-ai/10 text-ai font-medium">
                              {analysisLabels[conv.analysisType] || conv.analysisType}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {conv.updatedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === conv.id ? null : conv.id); }}
                        className="h-6 w-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-loss transition-all shrink-0"
                      >
                        {menuOpen === conv.id ? <X className="h-3 w-3" /> : <MoreVertical className="h-3 w-3" />}
                      </button>
                    </div>
                    {menuOpen === conv.id && (
                      <div className="mt-1.5 flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(conv.id); setMenuOpen(null); }}
                          className="text-[10px] text-loss hover:underline flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir conversa
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function groupByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Hoje', items: [] },
    { label: 'Ontem', items: [] },
    { label: 'Últimos 7 dias', items: [] },
    { label: 'Mais antigos', items: [] },
  ];

  for (const conv of conversations) {
    const d = conv.updatedAt;
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter(g => g.items.length > 0);
}

// --- Portfolio Sidebar ---
function PortfolioSidebar({ assets, open, onToggle }: { assets: Asset[]; open: boolean; onToggle: () => void }) {
  const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const cost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const gain = total - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  if (!open) return null;

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Minha Carteira</span>
        </div>
        <button onClick={onToggle} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all">
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mini Donut Chart */}
      <MiniAllocationChart assets={assets} total={total} />

      <div className="px-4 py-3 border-b border-border space-y-2 shrink-0">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Patrimônio</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(total)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lucro/Prejuízo</p>
          <p className={`text-sm font-mono font-semibold ${gain >= 0 ? 'text-gain' : 'text-loss'}`}>
            {formatCurrency(gain)} ({formatPercent(gainPct)})
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-2 py-2 space-y-0.5">
          {assets.sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity)).map((asset) => {
            const profit = (asset.currentPrice - asset.avgPrice) * asset.quantity;
            const profitPct = asset.avgPrice > 0 ? ((asset.currentPrice - asset.avgPrice) / asset.avgPrice) * 100 : 0;
            const isPositive = asset.change24h >= 0;
            return (
              <div key={asset.ticker} className="rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono">{asset.ticker}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      asset.type === 'Ação' ? 'bg-primary/10 text-primary' :
                      asset.type === 'FII' ? 'bg-ai/10 text-ai' :
                      asset.type === 'Cripto' ? 'bg-warning/10 text-warning' :
                      asset.type === 'ETF' ? 'bg-secondary text-secondary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>{asset.type}</span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                    {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {formatPercent(asset.change24h)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{asset.name}</span>
                  <span className="text-xs font-mono">{formatCurrency(asset.currentPrice)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{asset.quantity}un • {asset.allocation.toFixed(1)}%</span>
                  <span className={`text-[10px] font-mono ${profitPct >= 0 ? 'text-gain' : 'text-loss'}`}>
                    {formatCurrency(profit)} ({formatPercent(profitPct)})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">{assets.length} ativos • Yahoo Finance</p>
      </div>
    </div>
  );
}

// --- Main Component ---
export default function AITrader() {
  const { assets, loading: portfolioLoading } = usePortfolio();
  const {
    messages, isLoading, loadingHistory, error,
    conversations, activeConversationId,
    sendMessage, newChat, stopGeneration,
    loadConversation, deleteConversation,
  } = useAITrader();
  const [input, setInput] = useState('');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [portfolioOpen, setPortfolioOpen] = useState(true);
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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
    <div className="h-screen flex bg-background">
      {/* History Sidebar */}
      <HistorySidebar
        conversations={conversations}
        activeId={activeConversationId}
        open={historyOpen}
        onToggle={() => setHistoryOpen(false)}
        onSelect={loadConversation}
        onDelete={deleteConversation}
        onNewChat={newChat}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-border bg-card px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!historyOpen && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all mr-1"
                  title="Histórico"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              )}
              <div className="h-9 w-9 rounded-xl gradient-ai flex items-center justify-center">
                <Brain className="h-4.5 w-4.5 text-ai-foreground" />
              </div>
              <div>
                <h1 className="text-base font-bold flex items-center gap-2">
                  InvestAI Pro Trader
                  <Sparkles className="h-3.5 w-3.5 text-ai" />
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  {assets.length > 0 ? `${assets.length} ativos na carteira` : 'Carregando...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={newChat}
                className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/30 flex items-center gap-1.5 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova
              </button>
              {!portfolioOpen && assets.length > 0 && (
                <button
                  onClick={() => setPortfolioOpen(true)}
                  className="h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 flex items-center gap-1.5 transition-all"
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                  Carteira
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-ai" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6 py-12">
              <div className="max-w-2xl w-full space-y-8">
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-2xl gradient-ai flex items-center justify-center mx-auto">
                    <Brain className="h-8 w-8 text-ai-foreground" />
                  </div>
                  <h2 className="text-2xl font-bold">Seu Trader Profissional com IA</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Análises de mercado, sugestões de trades, gestão de risco e muito mais.
                    Baseado na sua carteira real com dados do Yahoo Finance.
                  </p>
                </div>

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
                      <p className="text-xs text-muted-foreground leading-relaxed">{option.description}</p>
                    </button>
                  ))}
                </div>

                {assets.length === 0 && !portfolioLoading && (
                  <p className="text-sm text-muted-foreground text-center">⚠️ Adicione ativos na carteira para análises personalizadas</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-card border border-border rounded-bl-md'
                  }`}>
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
                    <button onClick={stopGeneration} className="h-8 w-8 rounded-lg bg-loss/10 text-loss hover:bg-loss/20 flex items-center justify-center transition-colors" title="Parar">
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button onClick={() => handleSend()} disabled={!input.trim()} className="h-8 w-8 rounded-lg bg-ai text-ai-foreground hover:opacity-90 flex items-center justify-center transition-all disabled:opacity-30" title="Enviar">
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Powered by Google Gemini • Dados reais via Yahoo Finance
            </p>
          </div>
        </div>
      </div>

      {/* Portfolio Sidebar */}
      {assets.length > 0 && (
        <PortfolioSidebar assets={assets} open={portfolioOpen} onToggle={() => setPortfolioOpen(!portfolioOpen)} />
      )}
    </div>
  );
}
