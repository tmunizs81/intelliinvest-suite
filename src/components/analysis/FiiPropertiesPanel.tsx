import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, RefreshCw, Building2, MapPin, ChevronDown, ChevronUp, Ruler, Map
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Property {
  name: string;
  state: string;
  city?: string;
  type?: string;
  area_m2?: number | null;
  address?: string;
}

interface FiiPropertiesData {
  fund_name: string;
  total_properties?: number;
  total_area?: number | null;
  properties: Property[];
}

interface Props {
  ticker: string;
}

const STATE_COLORS: Record<string, string> = {
  SP: 'hsl(var(--primary))',
  RJ: 'hsl(var(--accent))',
  MG: 'hsl(var(--secondary))',
  PR: '#6366f1',
  RS: '#f59e0b',
  SC: '#10b981',
  BA: '#ef4444',
  PE: '#8b5cf6',
  CE: '#14b8a6',
  GO: '#f97316',
  DF: '#ec4899',
  ES: '#84cc16',
  MT: '#06b6d4',
  MS: '#a855f7',
  PA: '#e11d48',
  AM: '#0ea5e9',
  MA: '#d946ef',
  AL: '#65a30d',
};

function getStateColor(state: string, index: number) {
  return STATE_COLORS[state] || `hsl(${(index * 47) % 360}, 60%, 55%)`;
}

function formatArea(area: number) {
  return area.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FiiPropertiesPanel({ ticker }: Props) {
  const [data, setData] = useState<FiiPropertiesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [lastTicker, setLastTicker] = useState(ticker);

  if (ticker !== lastTicker) {
    setLastTicker(ticker);
    setData(null);
    setError(null);
    setLoading(false);
    setShowAll(false);
  }

  const fetchProperties = useCallback(async (retries = 3) => {
    setLoading(true);
    setError(null);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        const { data: result, error: fnError } = await supabase.functions.invoke('fii-properties', {
          body: { ticker },
        });
        if (fnError) {
          if (fnError.message?.includes('429') && attempt < retries) continue;
          throw new Error(fnError.message);
        }
        if (result?.error) {
          if ((String(result.error).includes('Rate limit') || String(result.error).includes('429')) && attempt < retries) continue;
          throw new Error(result.error);
        }
        setData(result);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt === retries) {
          setError(err instanceof Error ? err.message : 'Erro ao buscar imóveis');
        }
      }
    }
    setLoading(false);
  }, [ticker]);

  // State distribution for chart
  const stateDistribution = data ? (() => {
    const map: Record<string, number> = {};
    data.properties.forEach(p => {
      map[p.state] = (map[p.state] || 0) + 1;
    });
    return Object.entries(map)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
  })() : [];

  const visibleProperties = showAll ? (data?.properties || []) : (data?.properties || []).slice(0, 6);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Lista de Imóveis</h2>
            <p className="text-[10px] text-muted-foreground">Propriedades do fundo — fonte: Investidor10 / StatusInvest</p>
          </div>
        </div>
        <button onClick={fetchProperties} disabled={loading}
          className="h-7 w-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {!data && !loading && !error && (
        <button onClick={fetchProperties}
          className="w-full py-10 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground transition-all">
          <Map className="h-10 w-10" />
          <span className="text-sm font-medium">Carregar lista de imóveis do {ticker}</span>
          <span className="text-[11px] text-muted-foreground">Dados coletados do Investidor10 e StatusInvest</span>
        </button>
      )}

      {loading && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Coletando lista de imóveis...</p>
        </div>
      )}

      {error && <div className="p-4"><p className="text-sm text-loss">⚠️ {error}</p></div>}

      {data && (
        <div>
          {/* Chart + State Distribution */}
          <div className="p-4 flex flex-col sm:flex-row items-center gap-6">
            {/* Donut Chart */}
            <div className="w-48 h-48 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stateDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="count"
                    nameKey="state"
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {stateDistribution.map((entry, i) => (
                      <Cell key={entry.state} fill={getStateColor(entry.state, i)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} imóveis`, name]}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* State bars */}
            <div className="flex-1 space-y-2 w-full">
              {stateDistribution.map((s, i) => {
                const maxCount = stateDistribution[0]?.count || 1;
                const pct = (s.count / maxCount) * 100;
                return (
                  <div key={s.state} className="flex items-center gap-3">
                    <span className="text-xs font-semibold w-24 text-right">{s.state}</span>
                    <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: getStateColor(s.state, i),
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono font-semibold w-8">{s.count}</span>
                  </div>
                );
              })}
              {data.total_area && data.total_area > 0 && (
                <div className="pt-2 border-t border-border mt-2">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Ruler className="h-3 w-3" /> Área total: <strong className="text-foreground">{formatArea(data.total_area)} m²</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Properties Grid */}
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visibleProperties.map((prop, i) => (
                <div key={i} className="rounded-lg border border-border p-4 hover:border-primary/30 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{prop.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground">
                          {prop.city ? `${prop.city}, ` : ''}{prop.state}
                        </span>
                      </div>
                      {prop.type && (
                        <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {prop.type}
                        </span>
                      )}
                      {prop.area_m2 && prop.area_m2 > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Ruler className="h-2.5 w-2.5" />
                          Área bruta locável: <strong>{formatArea(prop.area_m2)} m²</strong>
                        </p>
                      )}
                      {prop.address && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={prop.address}>
                          📍 {prop.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.properties.length > 6 && (
              <button
                onClick={() => setShowAll(!showAll)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-primary hover:underline py-2"
              >
                {showAll ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Mostrar menos</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Ver todos os {data.properties.length} imóveis</>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
