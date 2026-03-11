import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, RefreshCw, Building2, MapPin, Star, AlertTriangle,
  ChevronDown, ChevronUp, Info, Landmark, Tag, Calendar, Percent, Briefcase
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AssetProfile {
  description: string;
  administrator?: string | null;
  manager?: string | null;
  segment?: string | null;
  classification?: string | null;
  listing_date?: string | null;
  admin_fee?: string | null;
  performance_fee?: string | null;
  ticker_exchange?: string | null;
  sections?: Array<{ title: string; content: string }>;
  key_assets?: Array<{ name: string; location?: string; type?: string }>;
  risks?: string[];
  highlights?: string[];
}

interface Props {
  ticker: string;
  name: string;
  type: string;
}

export default function AssetProfilePanel({ ticker, name, type }: Props) {
  const [profile, setProfile] = useState<AssetProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [lastTicker, setLastTicker] = useState(ticker);

  // Reset state when ticker changes
  if (ticker !== lastTicker) {
    setLastTicker(ticker);
    setProfile(null);
    setError(null);
    setLoading(false);
    setExpandedSections(new Set([0]));
    setShowAllAssets(false);
  }

  const fetchProfile = useCallback(async (retries = 3) => {
    setLoading(true);
    setError(null);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
        const { data, error: fnError } = await supabase.functions.invoke('ai-asset-profile', {
          body: { ticker, type, name },
        });
        if (fnError) {
          if (fnError.message?.includes('429') && attempt < retries) continue;
          throw new Error(fnError.message);
        }
        if (data?.error) {
          if ((data.error.includes('Rate limit') || data.error.includes('429')) && attempt < retries) continue;
          throw new Error(data.error);
        }
        setProfile(data);
        if (data.sections) {
          setExpandedSections(new Set(data.sections.map((_: any, i: number) => i)));
        }
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          console.error('AssetProfile error:', err);
          setError(err instanceof Error ? err.message : 'Erro ao buscar perfil');
        }
      }
    }
    setLoading(false);
  }, [ticker, type, name]);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const metaItems = [
    { icon: Landmark, label: 'Administrador', value: profile?.administrator },
    { icon: Briefcase, label: 'Gestor', value: profile?.manager },
    { icon: Tag, label: 'Segmento', value: profile?.segment },
    { icon: Info, label: 'Classificação', value: profile?.classification },
    { icon: Calendar, label: 'Listagem', value: profile?.listing_date },
    { icon: Percent, label: 'Taxa Adm.', value: profile?.admin_fee },
    { icon: Percent, label: 'Taxa Perf.', value: profile?.performance_fee },
    { icon: Building2, label: 'Bolsa', value: profile?.ticker_exchange },
  ].filter(item => item.value);

  const visibleAssets = showAllAssets
    ? profile?.key_assets || []
    : (profile?.key_assets || []).slice(0, 6);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Info className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Sobre {ticker}</h2>
            <p className="text-[10px] text-muted-foreground">Perfil completo com fontes reais</p>
          </div>
        </div>
        <button
          onClick={fetchProfile}
          disabled={loading}
          className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!profile && !loading && !error && (
        <button
          onClick={fetchProfile}
          className="w-full py-10 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-all"
        >
          <Info className="h-10 w-10" />
          <span className="text-sm font-medium">Gerar resumo completo do ativo</span>
          <span className="text-[11px] text-muted-foreground">Dados do StatusInvest, Investidor10 e IA</span>
        </button>
      )}

      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Coletando dados e gerando resumo...</p>
          <p className="text-[10px] text-muted-foreground">Buscando StatusInvest, Investidor10...</p>
        </div>
      )}

      {error && (
        <div className="p-4">
          <p className="text-sm text-loss">⚠️ {error}</p>
        </div>
      )}

      {profile && (
        <div className="divide-y divide-border">
          {/* Description */}
          <div className="p-4">
            <p className="text-sm leading-relaxed text-foreground">{profile.description}</p>
          </div>

          {/* Meta info grid */}
          {metaItems.length > 0 && (
            <div className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {metaItems.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/40">
                      <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-xs font-medium truncate">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Highlights */}
          {profile.highlights && profile.highlights.length > 0 && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Star className="h-3 w-3 text-primary" /> Destaques
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {profile.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-gain/5 border border-gain/10">
                    <span className="text-gain text-xs mt-0.5">✓</span>
                    <span className="text-xs text-foreground">{h}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections (accordion) */}
          {profile.sections && profile.sections.length > 0 && (
            <div>
              {profile.sections.map((section, i) => (
                <div key={i} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => toggleSection(i)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm font-semibold">{section.title}</span>
                    {expandedSections.has(i) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {expandedSections.has(i) && (
                    <div className="px-4 pb-4 prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Key Assets */}
          {profile.key_assets && profile.key_assets.length > 0 && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary" /> Composição ({profile.key_assets.length} ativos)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {visibleAssets.map((asset, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                    <Building2 className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{asset.name}</p>
                      <div className="flex items-center gap-2">
                        {asset.location && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" /> {asset.location}
                          </span>
                        )}
                        {asset.type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{asset.type}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {profile.key_assets.length > 6 && (
                <button
                  onClick={() => setShowAllAssets(!showAllAssets)}
                  className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {showAllAssets ? (
                    <>
                      <ChevronUp className="h-3 w-3" /> Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" /> Ver todos ({profile.key_assets.length})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Risks */}
          {profile.risks && profile.risks.length > 0 && (
            <div className="p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-loss" /> Riscos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {profile.risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-loss/5 border border-loss/10">
                    <AlertTriangle className="h-3 w-3 text-loss mt-0.5 shrink-0" />
                    <span className="text-xs text-foreground">{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
