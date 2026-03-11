import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Loader2, X, Minimize2, Maximize2, Sparkles, History, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type Asset } from '@/lib/mockData';
import ReactMarkdown from 'react-markdown';

type Message = { role: 'user' | 'assistant'; content: string };
type Conversation = { id: string; title: string; updated_at: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portfolio-chat`;

const quickQuestions = [
  'Qual meu ativo mais rentável?',
  'Resuma minha carteira',
  'Devo rebalancear?',
  'Qual o risco da minha carteira?',
];

export default function DashboardChatbot({ assets }: { assets: Asset[] }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .is('analysis_type', null)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => { if (open && user) loadConversations(); }, [open, user, loadConversations]);

  const loadConversation = async (convId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      setActiveConvId(convId);
      setShowHistory(false);
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!user) return;
    await supabase.from('ai_conversations').delete().eq('id', convId).eq('user_id', user.id);
    if (activeConvId === convId) { setActiveConvId(null); setMessages([]); }
    loadConversations();
  };

  const newChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const portfolio = assets.map(a => ({
    ticker: a.ticker, name: a.name, type: a.type,
    quantity: a.quantity, avgPrice: a.avgPrice,
    currentPrice: a.currentPrice, change24h: a.change24h,
    allocation: a.allocation, sector: a.sector,
  }));

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    // Create conversation if needed
    let convId = activeConvId;
    if (!convId && user) {
      const title = text.length > 60 ? text.slice(0, 57) + '...' : text;
      const { data } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user.id, title })
        .select('id')
        .single();
      if (data) {
        convId = data.id;
        setActiveConvId(convId);
      }
    }

    // Save user message
    if (convId && user) {
      await supabase.from('ai_messages').insert({
        conversation_id: convId, user_id: user.id, role: 'user', content: text.trim(),
      });
    }

    let assistantSoFar = '';

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, portfolio }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Erro ao conectar' }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: 'assistant', content: assistantSoFar }];
              });
            }
          } catch {}
        }
      }

      // Save assistant message
      if (convId && user && assistantSoFar) {
        await supabase.from('ai_messages').insert({
          conversation_id: convId, user_id: user.id, role: 'assistant', content: assistantSoFar,
        });
        await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        loadConversations();
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err instanceof Error ? err.message : 'Erro desconhecido'}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-all flex items-center justify-center group"
      >
        <MessageSquare className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-ai flex items-center justify-center">
          <Sparkles className="h-2.5 w-2.5 text-white" />
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed z-50 flex flex-col bg-card border border-border rounded-xl shadow-2xl transition-all ${
      maximized
        ? 'inset-4 md:inset-8'
        : 'bottom-6 right-6 w-[380px] h-[520px] max-h-[80vh]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Assistente IA</p>
            <p className="text-[10px] text-muted-foreground">
              {activeConvId ? 'Conversa salva' : 'Nova conversa'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={newChat} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50" title="Nova conversa">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className={`h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent/50 ${showHistory ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} title="Histórico">
            <History className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMaximized(!maximized)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50">
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => { setOpen(false); setMaximized(false); }} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* History sidebar */}
      {showHistory && (
        <div className="border-b border-border max-h-48 overflow-y-auto p-2 space-y-1 bg-muted/30">
          {conversations.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-3">Nenhuma conversa salva</p>
          ) : conversations.map(c => (
            <div key={c.id} className={`flex items-center justify-between group px-2 py-1.5 rounded-md hover:bg-accent/50 cursor-pointer ${activeConvId === c.id ? 'bg-accent/50' : ''}`}>
              <button onClick={() => loadConversation(c.id)} className="flex-1 text-left min-w-0">
                <p className="text-[11px] font-medium truncate">{c.title}</p>
                <p className="text-[9px] text-muted-foreground">{new Date(c.updated_at).toLocaleDateString('pt-BR')}</p>
              </button>
              <button onClick={() => deleteConversation(c.id)} className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-loss transition-all">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center">Olá! Como posso ajudar com seus investimentos?</p>
            <div className="grid grid-cols-2 gap-2">
              {quickQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs p-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : msg.content}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Pergunte sobre sua carteira..."
            className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground"
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:opacity-90 transition-all"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
