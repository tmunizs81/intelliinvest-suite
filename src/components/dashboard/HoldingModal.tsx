import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Plus, Loader2, Search, CalendarIcon, ClipboardPaste, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import type { HoldingRow } from '@/hooks/usePortfolio';
import { type Asset } from '@/lib/mockData';
import { classifyAssetType } from '@/lib/assetClassification';
import AICopilotSignal from './AICopilotSignal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { BROKER_CATALOGS, searchBrokerCatalogs, inferBrokerFromTicker, isTickerInBroker, brokersForTicker, type UnifiedSearchResult } from '@/lib/brokerCatalogs';
import { BrokerLogo } from '@/lib/brokerLogos';
import { getRule, learnRule } from '@/lib/tickerMappingRules';
import { detectUCITS } from '@/lib/ucitsDetector';

function toResult(r: UnifiedSearchResult): SearchResult {
  return { symbol: r.symbol, name: r.name, type: r.type, exchange: r.exchange, exchangeDisplay: r.exchangeDisplay };
}

function searchBrokerLocal(query: string, brokerFilter?: string | null): SearchResult[] {
  if (brokerFilter) {
    const cat = BROKER_CATALOGS.find(c => c.broker === brokerFilter);
    if (!cat) return [];
    const q = query.trim().toUpperCase();
    const list = q
      ? cat.assets.filter(a => a.ticker.toUpperCase().includes(q) || a.name.toUpperCase().includes(q))
      : cat.assets.slice(0, 30);
    return list.slice(0, 30).map(a => toResult({
      symbol: a.ticker, name: a.name, type: '', exchange: '', exchangeDisplay: cat.broker, broker: cat.broker,
    } as UnifiedSearchResult));
  }
  return searchBrokerCatalogs(query, 10).map(toResult);
}

const TYPES = ['Ação', 'FII', 'ETF', 'ETF Internacional', 'REIT', 'BDR', 'Internacional', 'Cripto', 'Renda Fixa', 'Imóvel'] as const;

const FIXED_INCOME_SUBTYPES = ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Pré', 'Debênture', 'CRA', 'CRI', 'LC', 'Outro'] as const;

const PROPERTY_SUBTYPES = ['Casa', 'Apartamento', 'Terreno', 'Lote', 'Galpão', 'Sala Comercial', 'Prédio Comercial', 'Chácara', 'Fazenda', 'Outro'] as const;

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  exchangeDisplay: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (holding: Omit<HoldingRow, 'id'>) => Promise<void>;
  editData?: (HoldingRow & { yield_rate?: string | null; indexer_type?: string | null; maturity_date?: string | null }) | null;
  onUpdate?: (id: string, data: Partial<HoldingRow>) => Promise<void>;
  assets?: Asset[];
}

export default function HoldingModal({ open, onClose, onSave, editData, onUpdate, assets = [] }: Props) {
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('Ação');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [sector, setSector] = useState('');
  const [broker, setBroker] = useState('');
  /** Sugestão de corretora — NUNCA aplicada automaticamente (evita ligar o ativo à corretora errada). */
  const [brokerSuggestion, setBrokerSuggestion] = useState<string | null>(null);
  const [yieldRate, setYieldRate] = useState('');
  const [indexerType, setIndexerType] = useState<string>('Pós-fixado');
  const [fixedIncomeSubtype, setFixedIncomeSubtype] = useState<string>('CDB');
  const [propertySubtype, setPropertySubtype] = useState<string>('Casa');
  const [appreciationRate, setAppreciationRate] = useState('');
  const [appreciationPeriod, setAppreciationPeriod] = useState<string>('anual');
  const [propertyPurpose, setPropertyPurpose] = useState<string>('holding');
  const [rentalValue, setRentalValue] = useState('');
  const [maturityDate, setMaturityDate] = useState<Date | undefined>(undefined);
  const [purchaseCurrency, setPurchaseCurrency] = useState<'BRL' | 'USD' | 'EUR'>('BRL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Nova UX: filtro por corretora, cola-lista e confirmação UCITS
  const [brokerFilter, setBrokerFilter] = useState<string | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteProgress, setPasteProgress] = useState<{ done: number; total: number } | null>(null);
  const [ucitsAck, setUcitsAck] = useState(false);
  const ucitsHint = useMemo(() => detectUCITS(ticker, name), [ticker, name]);

  // Corretoras que o usuário já usa — dão preferência ao auto-preencher tickers ambíguos
  const preferredBrokers = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a: any) => { if (a?.broker) set.add(a.broker); });
    return Array.from(set);
  }, [assets]);

  // Aviso de mismatch: broker escolhido mas ticker fora do catálogo curado dele
  const brokerMismatch = useMemo(() => {
    if (!ticker || !broker) return null;
    const cat = BROKER_CATALOGS.find(c => c.broker === broker);
    if (!cat) return null; // corretora livre (não é catálogo curado) — não valida
    if (isTickerInBroker(ticker, broker)) return null;
    const alt = brokersForTicker(ticker);
    return { alt };
  }, [ticker, broker]);

  useEffect(() => {
    if (open) {
      setTicker(editData?.ticker || '');
      setName(editData?.name || '');
      setType(editData?.type || 'Ação');
      setQuantity(editData?.quantity?.toString() || '');
      setAvgPrice(editData?.avg_price?.toString() || '');
      setSector(editData?.sector || '');
      setBroker(editData?.broker || '');
      setBrokerSuggestion(null);
      setYieldRate(editData?.yield_rate || '');
      setIndexerType(editData?.indexer_type || 'Pós-fixado');
      setFixedIncomeSubtype(editData?.sector && editData?.type === 'Renda Fixa' ? editData.sector : 'CDB');
      setPropertySubtype(editData?.sector && editData?.type === 'Imóvel' ? editData.sector : 'Casa');
      setAppreciationRate(editData?.type === 'Imóvel' && editData?.yield_rate ? editData.yield_rate : '');
      setAppreciationPeriod(editData?.type === 'Imóvel' && editData?.indexer_type ? editData.indexer_type : 'anual');
      setPropertyPurpose((editData as any)?.property_purpose || 'holding');
      setRentalValue((editData as any)?.rental_value?.toString() || '');
      setMaturityDate(editData?.maturity_date ? new Date(editData.maturity_date) : undefined);
      const pc = ((editData as any)?.purchase_currency || 'BRL').toUpperCase();
      setPurchaseCurrency((['BRL', 'USD', 'EUR'].includes(pc) ? pc : 'BRL') as 'BRL' | 'USD' | 'EUR');
      setError('');
      setSuggestions([]);
      setShowSuggestions(false);
      setBrokerFilter(null);
      setPasteMode(false);
      setPasteText('');
      setPasteProgress(null);
      setUcitsAck(false);
    }
  }, [open, editData]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchTickers = useCallback(async (query: string) => {
    if (query.length < 1 && !brokerFilter) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearching(true);
    const local = searchBrokerLocal(query, brokerFilter);
    if (local.length) {
      setSuggestions(local);
      setShowSuggestions(true);
    }
    // Se um filtro de corretora está ativo, não consulta remotos
    if (brokerFilter) {
      setSearching(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('ticker-search', {
        body: { query },
      });
      if (!error && data?.results) {
        const seen = new Set(local.map(r => r.symbol.toUpperCase()));
        const remote: SearchResult[] = (data.results as SearchResult[]).filter(
          r => !seen.has(r.symbol.toUpperCase())
        );
        const merged = [...local, ...remote];
        setSuggestions(merged);
        setShowSuggestions(merged.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }, [brokerFilter]);


  const handleTickerChange = (value: string) => {
    const upper = value.toUpperCase();
    setTicker(upper);
    setUcitsAck(false);
    // Regra aprendida: o tipo é aplicado, a corretora vira apenas sugestão explícita
    const rule = getRule(upper);
    if (rule) {
      if (rule.broker && !broker) setBrokerSuggestion(rule.broker);
      if (rule.type) setType(rule.type);
    }
    // Auto-classify type as user types
    if (upper.length >= 2) {
      const detected = classifyAssetType(upper);
      if (detected === 'Cripto') setType('Cripto');
      else if (detected === 'FII') setType('FII');
      else if (detected === 'ETF') setType('ETF');
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTickers(value), 300);
  };

  const selectSuggestion = (s: SearchResult) => {
    setTicker(s.symbol);
    setName(s.name);
    // Auto-detect type using classifyAssetType first, then exchange hints
    const classified = classifyAssetType(s.symbol);
    const irishExchanges = ['ISE', 'LSE', 'AMS', 'MIL', 'FRA', 'ETR', 'PAR', 'SWX'];
    const usExchanges = ['NMS', 'NYQ', 'NGM', 'ASE'];

    if (classified === 'Cripto') {
      setType('Cripto');
    } else if (s.type === 'ETF' && irishExchanges.includes(s.exchange)) {
      setType('ETF Internacional');
    } else if (s.type === 'ETF' || classified === 'ETF') {
      setType('ETF');
    } else if (classified === 'FII') {
      setType('FII');
    } else if (classified === 'BDR') {
      setType('Ação'); // BDRs displayed as Ação in the dropdown
    } else if (classified === 'Renda Fixa') {
      setType('Renda Fixa');
    } else if (s.exchange === 'SAO' || s.exchange === 'BSP') {
      setType(classified);
    } else if (usExchanges.includes(s.exchange) || irishExchanges.includes(s.exchange)) {
      setType('Ação');
    } else {
      setType(classified !== 'Internacional' ? classified : (s.type || 'Ação'));
    }
    // Auto-set sector from exchange
    if (irishExchanges.includes(s.exchange)) {
      setSector('ETF Internacional');
    }
    // Auto-set broker from unified broker catalogs (only if unambiguous or preferido)
    if (!broker) {
      const inferred = inferBrokerFromTicker(s.symbol, { preferredBrokers });
      if (inferred) setBroker(inferred);
    }
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isFixedIncome = type === 'Renda Fixa';
      const isProperty = type === 'Imóvel';
      const data: any = {
        ticker: isProperty ? `IMOVEL-${name.trim().substring(0, 10).toUpperCase().replace(/\s/g, '')}` : ticker.toUpperCase().trim(),
        name: name.trim(),
        type,
        quantity: isProperty ? 1 : parseFloat(quantity),
        avg_price: parseFloat(avgPrice),
        sector: isFixedIncome ? fixedIncomeSubtype : isProperty ? propertySubtype : (sector.trim() || null),
        broker: broker.trim() || null,
        yield_rate: isFixedIncome ? yieldRate.trim() || null : isProperty ? appreciationRate.trim() || null : null,
        indexer_type: isFixedIncome ? indexerType : isProperty ? appreciationPeriod : null,
        maturity_date: isFixedIncome && maturityDate ? format(maturityDate, 'yyyy-MM-dd') : null,
        property_purpose: isProperty ? propertyPurpose : null,
        rental_value: isProperty && propertyPurpose === 'aluguel' ? parseFloat(rentalValue) || null : null,
        purchase_currency: (isFixedIncome || isProperty) ? 'BRL' : purchaseCurrency,
      };

      if (!data.ticker || !data.name || isNaN(data.quantity) || isNaN(data.avg_price)) {
        setError('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }

      // Bloqueio de confirmação UCITS
      if (!editData && ucitsHint.isUcits && !ucitsAck) {
        setError('Confirme abaixo que este é um ETF irlandês UCITS antes de salvar.');
        setLoading(false);
        return;
      }

      if (editData && onUpdate) {
        await onUpdate(editData.id, data);
      } else {
        await onSave(data);
      }
      // Aprende mapeamento ticker → broker/type
      if (!isProperty && data.broker) {
        learnRule(data.ticker, { broker: data.broker, type: data.type });
      }
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao salvar';
      if (msg.includes('holdings_user_id_ticker_broker_key') || msg.includes('duplicate key')) {
        setError(`Você já possui "${ticker.toUpperCase().trim()}" nesta mesma corretora. Edite o ativo existente ou use outra corretora.`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Import em massa por cola-lista dentro do próprio modal.
  const handlePasteImport = async () => {
    setError('');
    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setError('Cole ao menos uma linha: TICKER QTD [PREÇO] [CORRETORA]'); return; }
    const parsed = lines.map((line) => {
      const parts = line.split(/[\s,;\t]+/).filter(Boolean);
      const [tk, qtd, price, ...rest] = parts;
      return {
        ticker: (tk || '').toUpperCase(),
        quantity: parseFloat((qtd || '0').replace(',', '.')),
        price: price ? parseFloat(price.replace(',', '.')) : NaN,
        broker: rest.length ? rest.join(' ') : '',
      };
    }).filter((p) => p.ticker && p.quantity > 0 && !isNaN(p.price));

    if (!parsed.length) { setError('Nenhuma linha válida. Formato esperado: TICKER QTD PREÇO [CORRETORA]'); return; }

    setLoading(true);
    setPasteProgress({ done: 0, total: parsed.length });
    let failures = 0;
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      const rule = getRule(p.ticker);
      const resolvedBroker = (p.broker || rule?.broker || inferBrokerFromTicker(p.ticker, { preferredBrokers }) || '').trim();
      const resolvedType = rule?.type || classifyAssetType(p.ticker) || 'Ação';
      try {
        await onSave({
          ticker: p.ticker,
          name: p.ticker,
          type: resolvedType,
          quantity: p.quantity,
          avg_price: p.price,
          sector: null,
          broker: resolvedBroker || null,
        } as any);
        if (resolvedBroker) learnRule(p.ticker, { broker: resolvedBroker, type: resolvedType });
      } catch {
        failures++;
      }
      setPasteProgress({ done: i + 1, total: parsed.length });
    }
    setLoading(false);
    if (failures) {
      setError(`${failures} linha(s) falharam. As demais foram adicionadas.`);
    } else {
      onClose();
    }
  };

  const exchangeBadge = (exchange: string) => {
    const colors: Record<string, string> = {
      B3: 'bg-primary/10 text-primary',
      'Euronext Dublin': 'bg-emerald-500/10 text-emerald-400',
      London: 'bg-blue-500/10 text-blue-400',
      NASDAQ: 'bg-violet-500/10 text-violet-400',
      NYSE: 'bg-amber-500/10 text-amber-400',
      XETRA: 'bg-rose-500/10 text-rose-400',
    };
    return colors[exchange] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold">{editData ? 'Editar Ativo' : 'Adicionar Ativo'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
          )}

          {/* Toggle: cadastro individual vs cola-lista */}
          {!editData && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPasteMode(false)}
                  className={`px-2.5 py-1 text-xs rounded ${!pasteMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  Individual
                </button>
                <button type="button" onClick={() => setPasteMode(true)}
                  className={`px-2.5 py-1 text-xs rounded inline-flex items-center gap-1 ${pasteMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <ClipboardPaste className="h-3 w-3" /> Colar lista
                </button>
              </div>
              {!pasteMode && (
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  <span className="text-[10px] text-muted-foreground mr-1">Só corretora:</span>
                  <button type="button" onClick={() => setBrokerFilter(null)}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${!brokerFilter ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    Todas
                  </button>
                  {BROKER_CATALOGS.map((c) => (
                    <button key={c.broker} type="button" onClick={() => { setBrokerFilter(c.broker); searchTickers(ticker); }}
                      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${brokerFilter === c.broker ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                      <BrokerLogo broker={c.broker} size={12} />
                      {c.broker}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {pasteMode && !editData && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Uma linha por ativo: <code className="font-mono">TICKER QTD PREÇO [CORRETORA]</code>.
                Corretora e tipo são auto-preenchidos por regras aprendidas e catálogos.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={8}
                placeholder={`PETR4 100 32.50\nCSPX.L 8 550 Avenue\nAAPL 10 190`}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {pasteProgress && (
                <p className="text-xs text-muted-foreground">
                  Progresso: {pasteProgress.done}/{pasteProgress.total}
                </p>
              )}
              <button
                type="button"
                onClick={handlePasteImport}
                disabled={loading || !pasteText.trim()}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
                Importar lista
              </button>
            </div>
          )}

          {!pasteMode && (
          <>


          {/* Ticker with autocomplete - hidden for Imóvel */}
          {type !== 'Imóvel' && (
          <div className="relative">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ticker *</label>
              <div className="relative">
                <input
                  ref={inputRef}
                  value={ticker}
                  onChange={e => handleTickerChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onKeyDown={handleKeyDown}
                  required
                  autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                  placeholder="Digite o ticker (ex: CSPX, PETR4, AAPL)"
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {!searching && ticker.length > 0 && (
                  <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-y-auto"
              >
                {suggestions.map((s, i) => {
                  const inferred = inferBrokerFromTicker(s.symbol, { preferredBrokers });
                  return (
                  <button
                    key={`${s.symbol}-${s.exchange}-${i}`}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0 ${
                      i === selectedIndex ? 'bg-accent/50' : ''
                    }`}
                  >
                    {inferred ? (
                      <BrokerLogo broker={inferred} size={22} />
                    ) : (
                      <span className="w-[22px] h-[22px] shrink-0 rounded-sm bg-muted" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-semibold text-foreground">{s.symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${exchangeBadge(s.exchangeDisplay)}`}>
                          {s.exchangeDisplay}
                        </span>
                        {inferred && (
                          <span className="text-[10px] text-muted-foreground">· {inferred}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.name}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.type}</span>
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo *</label>
              <select
                value={type} onChange={e => {
                  const newType = e.target.value;
                  setType(newType);
                  if ((newType === 'Renda Fixa' || newType === 'Imóvel') && !quantity) setQuantity('1');
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {type !== 'Renda Fixa' && type !== 'Imóvel' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Setor</label>
                <input
                  value={sector} onChange={e => setSector(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Tecnologia, Saúde..."
                />
              </div>
            )}
            {type === 'Renda Fixa' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Subtipo *</label>
                <select
                  value={fixedIncomeSubtype}
                  onChange={e => setFixedIncomeSubtype(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {FIXED_INCOME_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {type === 'Imóvel' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Tipo de Imóvel *</label>
                <select
                  value={propertySubtype}
                  onChange={e => setPropertySubtype(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PROPERTY_SUBTYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <BrokerAutocomplete value={broker} onChange={setBroker} />

          {brokerMismatch && type !== 'Renda Fixa' && type !== 'Imóvel' && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-500 dark:text-amber-400 space-y-1.5">
              <p>
                <strong>{ticker}</strong> não consta no catálogo curado de <strong>{broker}</strong>.
                Confirme se você realmente possui este ativo nessa corretora antes de salvar.
              </p>
              {brokerMismatch.alt.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="opacity-70">Sugestões:</span>
                  {brokerMismatch.alt.map(b => (
                    <button key={b} type="button" onClick={() => setBroker(b)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-[10px]">
                      <BrokerLogo broker={b} size={12} /> {b}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}



          {/* Campos de Renda Fixa */}
          {type === 'Renda Fixa' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Indexador *</label>
                  <select
                    value={indexerType}
                    onChange={e => setIndexerType(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="Pré-fixado">Pré-fixado</option>
                    <option value="Pós-fixado">Pós-fixado</option>
                    <option value="IPCA+">IPCA+</option>
                    <option value="CDI">CDI</option>
                    <option value="CDI+">CDI+</option>
                    <option value="Selic">Selic</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Rentabilidade</label>
                  <input
                    value={yieldRate}
                    onChange={e => setYieldRate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={indexerType === 'Pré-fixado' ? '12.5% a.a.' : indexerType === 'IPCA+' ? 'IPCA + 6.5%' : '110% CDI'}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data de Vencimento</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-ring',
                        !maturityDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      {maturityDate ? format(maturityDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione a data'}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={maturityDate}
                      onSelect={setMaturityDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}

          {/* Campos de Imóvel */}
          {type === 'Imóvel' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Finalidade *</label>
                  <select
                    value={propertyPurpose}
                    onChange={e => setPropertyPurpose(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="holding">Patrimônio (Holding)</option>
                    <option value="aluguel">Alugado</option>
                  </select>
                </div>
                {propertyPurpose === 'aluguel' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Valor do Aluguel (R$/mês) *</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={rentalValue}
                      onChange={e => setRentalValue(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="2500.00"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Valorização (%) *</label>
                  <input
                    value={appreciationRate}
                    onChange={e => setAppreciationRate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={appreciationPeriod === 'mensal' ? 'Ex: 0.5' : 'Ex: 6.0'}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Período</label>
                  <select
                    value={appreciationPeriod}
                    onChange={e => setAppreciationPeriod(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {type === 'Imóvel' ? 'Descrição / Endereço *' : 'Nome *'}
            </label>
            <input
              value={name} onChange={e => setName(e.target.value)} required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={type === 'Imóvel' ? 'Ex: Apartamento Centro SP' : 'Nome do ativo (preenchido automaticamente)'}
            />
          </div>

          {type === 'Renda Fixa' || type === 'Imóvel' ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {type === 'Imóvel' ? 'Valor do Imóvel *' : 'Valor Investido *'}
              </label>
              <input
                type="number" step="0.01" min="0" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={type === 'Imóvel' ? '350000.00' : '10000.00'}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Quantidade *</label>
                  <input
                    type="number" step="any" min="0.00001" value={quantity} onChange={e => setQuantity(e.target.value)} required
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Preço Médio * <span className="text-[10px] text-muted-foreground/70">({purchaseCurrency})</span>
                  </label>
                  <input
                    type="number" step="0.0001" min="0" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} required
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={purchaseCurrency === 'BRL' ? '28,50' : purchaseCurrency === 'USD' ? '51.60' : '48,20'}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Moeda de compra *</label>
                <div className="inline-flex w-full rounded-md border border-input bg-background p-0.5">
                  {(['BRL', 'USD', 'EUR'] as const).map((c) => {
                    const active = purchaseCurrency === c;
                    const sym = c === 'BRL' ? 'R$' : c === 'USD' ? 'US$' : '€';
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPurchaseCurrency(c)}
                        aria-pressed={active}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-[6px] px-2 py-1.5 text-xs font-semibold transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span className="font-mono">{sym}</span>
                        {c}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground/80">
                  Selecione a moeda em que você <strong>comprou</strong> este ativo. Usada para calcular o custo em reais na cotação atual.
                </p>
              </div>
            </>
          )}


          {/* AI Copilot Signal */}
          {ticker && quantity && avgPrice && !editData && (
            <AICopilotSignal
              ticker={ticker}
              name={name}
              type={type}
              quantity={parseFloat(quantity) || 0}
              avgPrice={parseFloat(avgPrice) || 0}
              assets={assets}
            />
          )}

          {/* UCITS banner + confirmação */}
          {ucitsHint.isUcits && !editData && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-400">
                    ETF irlandês UCITS detectado{ucitsHint.kind === 'acc' ? ' (acumulação)' : ucitsHint.kind === 'dist' ? ' (distribuição)' : ''}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {ucitsHint.reason}. Ativos UCITS têm tributação e reinvestimento próprios — confirme antes de salvar.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ucitsAck} onChange={(e) => setUcitsAck(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-500" />
                <span>Confirmo que este ativo é um ETF UCITS irlandês.</span>
              </label>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editData ? 'Salvar alterações' : 'Adicionar ativo'}
          </button>
          </>
          )}
        </form>
      </div>
    </div>
  );
}

const BROKERS = [
  'XP Investimentos', 'Clear Corretora', 'Rico Investimentos', 'BTG Pactual',
  'Itaú Corretora', 'Bradesco Corretora', 'Banco do Brasil Investimentos',
  'NuInvest', 'Genial Investimentos', 'Modal Mais', 'Ágora Investimentos',
  'Toro Investimentos', 'Guide Investimentos', 'Órama', 'Warren',
  'Mercado Bitcoin', 'Binance', 'Foxbit', 'NovaDAX', 'Coinbase',
  'Terra Investimentos', 'Safra Corretora', 'Santander Corretora',
  'Avenue Securities', 'Nomad', 'Stake', 'Passfolio',
  'Interactive Brokers', 'Charles Schwab', 'TD Ameritrade',
  'XTB', 'Webull', 'eToro', 'DEGIRO', 'Trading 212',
];

function BrokerAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? BROKERS.filter(b => b.toLowerCase().includes(value.toLowerCase()))
    : BROKERS;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-xs font-medium text-muted-foreground">Corretora</label>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Digite para buscar..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(b => (
            <button
              key={b}
              type="button"
              onClick={() => { onChange(b); setOpen(false); }}
              className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${
                value === b ? 'bg-accent/30 font-medium' : ''
              }`}
            >
              <BrokerLogo broker={b} size={14} />
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
