/**
 * Preferências de exibição de logos de corretoras.
 *
 * - overrides: URL/data URL customizada por corretora (substitui favicon padrão)
 * - meta: metadados de cada override (formato, dims, tamanho, updated_at)
 * - density: 'full' mostra logo + nome do broker; 'compact' apenas ícone.
 *
 * Persistência híbrida:
 *  - localStorage (imediato, funciona offline)
 *  - Supabase (tabela broker_logo_overrides, sync entre dispositivos)
 *
 * Emite `broker-logo-settings-changed` para hooks reagirem.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { purgeBrokerLogoCache } from './brokerLogos';

const OVERRIDES_KEY = 'broker-logo-overrides.v1';
const META_KEY = 'broker-logo-meta.v1';
const DENSITY_KEY = 'broker-logo-density.v1';
const EVENT = 'broker-logo-settings-changed';

export type LogoDensity = 'full' | 'compact';

export interface LogoMeta {
  format?: string;
  width?: number;
  height?: number;
  size_bytes?: number;
  version?: string;
  updated_at?: string;
}

/**
 * Otimiza server-side (decode + resize + re-encode) e devolve URL versionada.
 * Fallback silencioso para o data URL original em caso de erro.
 */
export async function optimizeLogoOnBackend(dataUrl: string): Promise<{
  dataUrl: string; format: string; width: number; height: number; size_bytes: number; version: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('optimize-broker-logo', { body: { dataUrl } });
    if (error || !data?.dataUrl) throw error ?? new Error('no data');
    return data;
  } catch (e) {
    console.warn('[broker-logo] optimize fallback', e);
    const version = Date.now().toString(36);
    return {
      dataUrl,
      format: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/png',
      width: 128, height: 128,
      size_bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4),
      version,
    };
  }
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function getLogoOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return safeParse(localStorage.getItem(OVERRIDES_KEY), {} as Record<string, string>);
}

export function getLogoMeta(): Record<string, LogoMeta> {
  if (typeof window === 'undefined') return {};
  return safeParse(localStorage.getItem(META_KEY), {} as Record<string, LogoMeta>);
}

function writeOverrides(map: Record<string, string>) {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
}
function writeMeta(map: Record<string, LogoMeta>) {
  localStorage.setItem(META_KEY, JSON.stringify(map));
}

/** Grava override local + backend. Passa null para remover. */
export async function setLogoOverride(broker: string, url: string | null, meta?: LogoMeta) {
  const map = getLogoOverrides();
  const metaMap = getLogoMeta();
  const b = broker.trim();
  if (!url) {
    delete map[b];
    delete metaMap[b];
  } else {
    map[b] = url.trim();
    metaMap[b] = { ...(meta || {}), updated_at: new Date().toISOString() };
  }
  writeOverrides(map);
  writeMeta(metaMap);
  window.dispatchEvent(new Event(EVENT));

  // Sync backend (best-effort — não bloqueia UI)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!url) {
      await supabase.from('broker_logo_overrides').delete()
        .eq('user_id', user.id).eq('broker', b);
    } else {
      await supabase.from('broker_logo_overrides').upsert({
        user_id: user.id,
        broker: b,
        url: url.trim(),
        format: meta?.format ?? null,
        width: meta?.width ?? null,
        height: meta?.height ?? null,
        size_bytes: meta?.size_bytes ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,broker' });
    }
  } catch (e) {
    console.warn('[broker-logo] backend sync failed', e);
  }
}

/** Carrega overrides do backend e mescla com localStorage. */
export async function syncOverridesFromBackend(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('broker_logo_overrides')
      .select('broker,url,format,width,height,size_bytes,updated_at')
      .eq('user_id', user.id);
    if (error || !data) return;
    const map: Record<string, string> = {};
    const metaMap: Record<string, LogoMeta> = {};
    for (const row of data) {
      map[row.broker] = row.url;
      metaMap[row.broker] = {
        format: row.format ?? undefined,
        width: row.width ?? undefined,
        height: row.height ?? undefined,
        size_bytes: row.size_bytes ?? undefined,
        updated_at: row.updated_at ?? undefined,
      };
    }
    writeOverrides(map);
    writeMeta(metaMap);
    window.dispatchEvent(new Event(EVENT));
  } catch (e) {
    console.warn('[broker-logo] initial sync failed', e);
  }
}

export function getLogoDensity(): LogoDensity {
  if (typeof window === 'undefined') return 'full';
  return (localStorage.getItem(DENSITY_KEY) as LogoDensity) || 'full';
}

export function setLogoDensity(d: LogoDensity) {
  localStorage.setItem(DENSITY_KEY, d);
  window.dispatchEvent(new Event(EVENT));
}

/** Hook — re-renderiza consumidores quando prefs mudam em qualquer lugar. */
export function useBrokerLogoSettings() {
  const [state, setState] = useState(() => ({
    overrides: getLogoOverrides(),
    meta: getLogoMeta(),
    density: getLogoDensity(),
  }));
  useEffect(() => {
    const handler = () => setState({
      overrides: getLogoOverrides(),
      meta: getLogoMeta(),
      density: getLogoDensity(),
    });
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    // Sync inicial do backend
    syncOverridesFromBackend();
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return state;
}
