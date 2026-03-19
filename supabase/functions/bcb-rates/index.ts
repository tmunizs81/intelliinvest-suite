import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// BCB Series IDs
// 432 = Taxa Selic Meta (% a.a.)
// 4389 = Taxa CDI (% a.a.)
// 13522 = IPCA acumulado 12 meses (% a.a.)
const SERIES = {
  SELIC: 432,
  CDI: 4389,
  IPCA: 13522,
};

async function fetchBCBSeries(seriesId: number): Promise<number | null> {
  try {
    // BCB API: last value of the series
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados/ultimos/1?formato=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.error(`BCB API error for series ${seriesId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const val = parseFloat(String(data[0].valor).replace(',', '.'));
      return isNaN(val) ? null : val;
    }
    return null;
  } catch (err) {
    console.error(`BCB fetch error for series ${seriesId}:`, err);
    return null;
  }
}

// In-memory cache (persists across warm invocations)
let cachedRates: { selic: number; cdi: number; ipca: number; updatedAt: string } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const now = Date.now();

    // Return cached if fresh
    if (cachedRates && (now - cacheTimestamp) < CACHE_TTL) {
      return new Response(JSON.stringify({ rates: cachedRates, source: 'cache' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all three in parallel
    const [selic, cdi, ipca] = await Promise.all([
      fetchBCBSeries(SERIES.SELIC),
      fetchBCBSeries(SERIES.CDI),
      fetchBCBSeries(SERIES.IPCA),
    ]);

    const rates = {
      selic: selic ?? 14.25,
      cdi: cdi ?? 14.15,
      ipca: ipca ?? 5.0,
      updatedAt: new Date().toISOString(),
    };

    cachedRates = rates;
    cacheTimestamp = now;

    return new Response(JSON.stringify({ rates, source: 'bcb' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('BCB rates error:', err);
    // Return fallback rates
    const fallback = {
      selic: 14.25,
      cdi: 14.15,
      ipca: 5.0,
      updatedAt: new Date().toISOString(),
    };
    return new Response(JSON.stringify({ rates: fallback, source: 'fallback' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
