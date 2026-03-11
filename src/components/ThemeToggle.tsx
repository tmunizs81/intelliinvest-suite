import { Moon, Sun, Palette } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';

const themes = [
  { id: 'emerald', label: 'Esmeralda', primary: '160 84%', accent: '160' },
  { id: 'ocean', label: 'Oceano', primary: '210 90%', accent: '210' },
  { id: 'royal', label: 'Royal', primary: '270 70%', accent: '270' },
  { id: 'gold', label: 'Dourado', primary: '38 92%', accent: '38' },
] as const;

type ThemeId = typeof themes[number]['id'];

function applyTheme(themeId: ThemeId) {
  const root = document.documentElement;
  const theme = themes.find(t => t.id === themeId) || themes[0];

  const isDark = !root.classList.contains('light');
  const lightness = isDark ? '39%' : '35%';
  const fgLightness = isDark ? '6%' : '100%';
  const ringVal = `${theme.primary} ${lightness}`;

  root.style.setProperty('--primary', ringVal);
  root.style.setProperty('--primary-foreground', `${theme.primary.split(' ')[0]} 20% ${fgLightness}`);
  root.style.setProperty('--ring', ringVal);
  root.style.setProperty('--gain', `${theme.primary} ${isDark ? '39%' : '32%'}`);
  root.style.setProperty('--gain-foreground', `${theme.primary} ${isDark ? '80%' : '25%'}`);
  root.style.setProperty('--gain-bg', `${theme.primary} ${isDark ? '39%' : '90%'}`);
  root.style.setProperty('--chart-line', ringVal);
  root.style.setProperty('--chart-area', `${theme.primary} ${isDark ? '39%' : '90%'}`);
  root.style.setProperty('--glow-primary', ringVal);
  root.style.setProperty('--sidebar-primary', ringVal);
  root.style.setProperty('--sidebar-primary-foreground', `${theme.primary.split(' ')[0]} 20% ${fgLightness}`);
  root.style.setProperty('--sidebar-ring', ringVal);
  localStorage.setItem('color-theme', themeId);
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [showPalette, setShowPalette] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeId>('emerald');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      setIsDark(false);
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
    const savedTheme = localStorage.getItem('color-theme') as ThemeId | null;
    if (savedTheme && themes.some(t => t.id === savedTheme)) {
      setActiveTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  // Close on click outside - with delayed registration to avoid immediate trigger
  useEffect(() => {
    if (!showPalette) return;
    
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setShowPalette(false);
      }
    };
    
    // Delay registration so the current click event doesn't immediately close it
    timer = setTimeout(() => {
      document.addEventListener('click', handler, true);
    }, 10);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler, true);
    };
  }, [showPalette]);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    setTimeout(() => applyTheme(activeTheme), 50);
  };

  const selectTheme = (id: ThemeId) => {
    setActiveTheme(id);
    applyTheme(id);
    setShowPalette(false);
  };

  const themeColors: Record<ThemeId, string> = {
    emerald: 'bg-emerald-500',
    ocean: 'bg-blue-500',
    royal: 'bg-purple-500',
    gold: 'bg-amber-500',
  };

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={toggleDark}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
        title={isDark ? 'Modo claro' : 'Modo escuro'}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button
        ref={buttonRef}
        onClick={() => setShowPalette(prev => !prev)}
        className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all"
        title="Escolher tema"
      >
        <Palette className="h-4 w-4" />
      </button>
      {showPalette && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl shadow-lg p-3 z-[9999] w-44 animate-fade-in"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Paleta de Cores</p>
          <div className="space-y-1">
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => selectTheme(t.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTheme === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <div className={`h-3.5 w-3.5 rounded-full ${themeColors[t.id]}`} />
                {t.label}
                {activeTheme === t.id && <span className="ml-auto text-[10px]">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
