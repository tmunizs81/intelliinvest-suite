import { useState, useCallback, createContext, useContext } from 'react';

const PrivacyContext = createContext<{
  privacyMode: boolean;
  togglePrivacy: () => void;
  blurValue: (value: string) => string;
}>({
  privacyMode: false,
  togglePrivacy: () => {},
  blurValue: (v) => v,
});

export function usePrivacyMode() {
  return useContext(PrivacyContext);
}

export function usePrivacyModeProvider() {
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem('privacy-mode') === 'true'; } catch { return false; }
  });

  const togglePrivacy = useCallback(() => {
    setPrivacyMode(prev => {
      const next = !prev;
      localStorage.setItem('privacy-mode', String(next));
      return next;
    });
  }, []);

  const blurValue = useCallback((value: string) => {
    if (!privacyMode) return value;
    return '••••••';
  }, [privacyMode]);

  return { privacyMode, togglePrivacy, blurValue, PrivacyContext };
}

export { PrivacyContext };
