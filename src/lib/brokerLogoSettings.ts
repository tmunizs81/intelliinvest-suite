/**
 * Preferências locais para exibição de logos de corretoras.
 * - overrides: URL customizada por corretora (substitui favicon padrão)
 * - density: 'full' mostra logo + nome do broker abaixo do ticker;
 *            'compact' mostra apenas o ícone.
 *
 * Persistido em localStorage. Emite `broker-logo-settings-changed`
 * (window event) para hooks reagirem sem re-render manual.
 */
import { useEffect, useState } from 'react';

const OVERRIDES_KEY = 'broker-logo-overrides.v1';
const DENSITY_KEY = 'broker-logo-density.v1';
const EVENT = 'broker-logo-settings-changed';

export type LogoDensity = 'full' | 'compact';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function getLogoOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return safeParse(localStorage.getItem(OVERRIDES_KEY), {} as Record<string, string>);
}

export function setLogoOverride(broker: string, url: string | null) {
  const map = getLogoOverrides();
  if (!url) delete map[broker];
  else map[broker] = url.trim();
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
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
    density: getLogoDensity(),
  }));
  useEffect(() => {
    const handler = () => setState({
      overrides: getLogoOverrides(),
      density: getLogoDensity(),
    });
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return state;
}
