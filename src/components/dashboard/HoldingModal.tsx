import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Loader2, Search, CalendarIcon } from 'lucide-react';
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
  const [yieldRate, setYieldRate] = useState('');
  const [indexerType, setIndexerType] = useState<string>('Pós-fixado');
  const [fixedIncomeSubtype, setFixedIncomeSubtype] = useState<string>('CDB');
  const [propertySubtype, setPropertySubtype] = useState<string>('Casa');
  const [appreciationRate, setAppreciationRate] = useState('');
  const [appreciationPeriod, setAppreciationPeriod] = useState<string>('anual');
  const [propertyPurpose, setPropertyPurpose] = useState<string>('holding');
  const [rentalValue, setRentalValue] = useState('');
  const [maturityDate, setMaturityDate] = useState<Date | undefined>(undefined);
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

  useEffect(() => {
    if (open) {
      setTicker(editData?.ticker || '');
      setName(editData?.name || '');
      setType(editData?.type || 'Ação');
      setQuantity(editData?.quantity?.toString() || '');
      setAvgPrice(editData?.avg_price?.toString() || '');
      setSector(editData?.sector || '');
      setBroker(editData?.broker || '');
      setYieldRate(editData?.yield_rate || '');
      setIndexerType(editData?.indexer_type || 'Pós-fixado');
      setFixedIncomeSubtype(editData?.sector && editData?.type === 'Renda Fixa' ? editData.sector : 'CDB');
      setPropertySubtype(editData?.sector && editData?.type === 'Imóvel' ? editData.sector : 'Casa');
      setAppreciationRate(editData?.type === 'Imóvel' && editData?.yield_rate ? editData.yield_rate : '');
      setAppreciationPeriod(editData?.type === 'Imóvel' && editData?.indexer_type ? editData.indexer_type : 'anual');
      setPropertyPurpose((editData as any)?.property_purpose || 'holding');
      setRentalValue((editData as any)?.rental_value?.toString() || '');
      setMaturityDate(editData?.maturity_date ? new Date(editData.maturity_date) : undefined);
      setError('');
      setSuggestions([]);
      setShowSuggestions(false);
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
    if (query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('ticker-search', {
        body: { query },
      });
      if (!error && data?.results) {
        setSuggestions(data.results);
        setShowSuggestions(data.results.length > 0);
        setSelectedIndex(-1);
      }
    } catch {
      // silent
    } finally {
      setSearching(false);
    }
  }, []);

  const handleTickerChange = (value: string) => {
    const upper = value.toUpperCase();
    setTicker(upper);
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
      };

      if (!data.ticker || !data.name || isNaN(data.quantity) || isNaN(data.avg_price)) {
        setError('Preencha todos os campos obrigatórios');
        setLoading(false);
        return;
      }

      if (editData && onUpdate) {
        await onUpdate(editData.id, data);
      } else {
        await onSave(data);
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
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.symbol}-${s.exchange}-${i}`}
                    type="button"
                    onClick={() => selectSuggestion(s)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0 ${
                      i === selectedIndex ? 'bg-accent/50' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-semibold text-foreground">{s.symbol}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${exchangeBadge(s.exchangeDisplay)}`}>
                          {s.exchangeDisplay}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{s.name}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{s.type}</span>
                  </button>
                ))}
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
                <label className="text-xs font-medium text-muted-foreground">Preço Médio *</label>
                <input
                  type="number" step="0.01" min="0" value={avgPrice} onChange={e => setAvgPrice(e.target.value)} required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="28.50"
                />
              </div>
            </div>
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

          <button
            type="submit" disabled={loading}
            className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {editData ? 'Salvar alterações' : 'Adicionar ativo'}
          </button>
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
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors ${
                value === b ? 'bg-accent/30 font-medium' : ''
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
