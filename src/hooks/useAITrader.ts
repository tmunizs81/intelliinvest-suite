import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type Asset } from '@/lib/mockData';
import { toast } from '@/hooks/use-toast';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export type Conversation = {
  id: string;
  title: string;
  analysisType: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AnalysisType = 'position-trades' | 'buy-sell' | 'portfolio-review' | 'macro-analysis' | 'risk-management' | 'free';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-trader`;

export function useAITrader() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (data) {
      setConversations(data.map((c: any) => ({
        id: c.id,
        title: c.title,
        analysisType: c.analysis_type,
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
      })));
    }
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Load messages for a conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    if (!user) return;
    setLoadingHistory(true);
    setActiveConversationId(conversationId);
    setError(null);

    const { data } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
      })));
    }
    setLoadingHistory(false);
  }, [user]);

  // Save a message to DB
  const saveMessage = useCallback(async (conversationId: string, role: string, content: string) => {
    if (!user) return;
    await supabase.from('ai_messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role,
      content,
    });
  }, [user]);

  // Create a new conversation
  const createConversation = useCallback(async (title: string, analysisType?: string): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({
        user_id: user.id,
        title: title.slice(0, 80),
        analysis_type: analysisType || null,
      })
      .select('id')
      .single();

    if (error || !data) return null;
    await loadConversations();
    return data.id;
  }, [user, loadConversations]);

  // Update conversation title
  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    if (!user) return;
    await supabase
      .from('ai_conversations')
      .update({ title: title.slice(0, 80) })
      .eq('id', id)
      .eq('user_id', user.id);
    await loadConversations();
  }, [user, loadConversations]);

  // Delete conversation
  const deleteConversation = useCallback(async (id: string) => {
    if (!user) return;
    await supabase
      .from('ai_conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
    await loadConversations();
  }, [user, activeConversationId, loadConversations]);

  const sendMessage = useCallback(async (
    input: string,
    assets: Asset[],
    analysisType: AnalysisType = 'free',
  ) => {
    if (!user) return;

    // Create conversation if needed
    let convId = activeConversationId;
    if (!convId) {
      const title = input.length > 60 ? input.slice(0, 57) + '...' : input;
      convId = await createConversation(title, analysisType !== 'free' ? analysisType : undefined);
      if (!convId) {
        setError('Erro ao criar conversa');
        return;
      }
      setActiveConversationId(convId);
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    // Save user message
    await saveMessage(convId, 'user', input);

    const portfolio = assets.map(a => ({
      ticker: a.ticker, name: a.name, type: a.type,
      quantity: a.quantity, avgPrice: a.avgPrice,
      currentPrice: a.currentPrice, change24h: a.change24h,
      allocation: a.allocation, sector: a.sector,
    }));

    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role, content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantContent = "";

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          portfolio,
          analysisType: analysisType !== 'free' ? analysisType : undefined,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${resp.status}`);
      }

      // Check if using fallback provider
      const aiProvider = resp.headers.get("x-ai-provider");
      if (aiProvider === "groq") {
        toast({ title: "⚡ IA alternativa ativa", description: "Usando modelo alternativo (Groq).", duration: 5000 });
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      const assistantId = `assistant-${Date.now()}`;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === assistantId) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: assistantId, role: 'assistant' as const, content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => prev.map((m, i) =>
                i === prev.length - 1 && m.role === 'assistant' ? { ...m, content: assistantContent } : m
              ));
            }
          } catch { /* ignore */ }
        }
      }

      // Save assistant message and update conversation
      if (assistantContent && convId) {
        await saveMessage(convId, 'assistant', assistantContent);
        // Update timestamp
        await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
        await loadConversations();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('AI Trader error:', err);
      setError(err.message || 'Erro ao comunicar com a IA');
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [user, messages, activeConversationId, createConversation, saveMessage, loadConversations]);

  const newChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
  }, []);

  return {
    messages, isLoading, loadingHistory, error,
    conversations, activeConversationId,
    sendMessage, newChat, stopGeneration,
    loadConversation, deleteConversation,
    updateConversationTitle,
  };
}
