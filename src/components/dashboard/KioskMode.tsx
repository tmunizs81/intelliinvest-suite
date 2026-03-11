import { useState, useEffect, useCallback } from 'react';
import { X, Maximize, Pause, Play } from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import AllocationChart from './AllocationChart';
import PerformanceChart from './PerformanceChart';

interface Props {
  assets: Asset[];
  onClose: () => void;
}

const SLIDES = ['summary', 'allocation', 'performance', 'top5'] as const;
const INTERVAL = 8000;

export default function KioskMode({ assets, onClose }: Props) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const cost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const gain = total - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  const top5 = [...assets]
    .sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))
    .slice(0, 5);

  const nextSlide = useCallback(() => {
    setCurrentSlide(prev => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(nextSlide, INTERVAL);
    return () => clearInterval(timer);
  }, [paused, nextSlide]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') setCurrentSlide(prev => (prev - 1 + SLIDES.length) % SLIDES.length);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, nextSlide]);

  const slide = SLIDES[currentSlide];

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <img src="/pwa-icon-192.png" alt="T2" className="h-8 w-8 rounded-lg" />
          <span className="text-xl font-bold">T2-<span className="text-primary">Simplynvest</span></span>
          <span className="text-xs text-muted-foreground ml-4">Modo Kiosk</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={() => setPaused(!paused)} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button onClick={onClose} className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8 animate-fade-in" key={currentSlide}>
        {slide === 'summary' && (
          <div className="text-center space-y-8">
            <div>
              <p className="text-muted-foreground text-lg mb-2">Patrimônio Total</p>
              <p className="text-7xl font-bold font-mono tracking-tight">{formatCurrency(total)}</p>
            </div>
            <div className="flex items-center justify-center gap-12">
              <div>
                <p className="text-muted-foreground text-sm">Lucro/Prejuízo</p>
                <p className={`text-4xl font-bold font-mono ${gain >= 0 ? 'text-gain' : 'text-loss'}`}>{formatCurrency(gain)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Rentabilidade</p>
                <p className={`text-4xl font-bold font-mono ${gainPct >= 0 ? 'text-gain' : 'text-loss'}`}>{formatPercent(gainPct)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Ativos</p>
                <p className="text-4xl font-bold font-mono">{assets.length}</p>
              </div>
            </div>
          </div>
        )}

        {slide === 'allocation' && (
          <div className="w-full max-w-3xl">
            <h2 className="text-2xl font-bold mb-4 text-center">Alocação da Carteira</h2>
            <AllocationChart assets={assets} />
          </div>
        )}

        {slide === 'performance' && (
          <div className="w-full max-w-4xl">
            <h2 className="text-2xl font-bold mb-4 text-center">Performance por Ativo</h2>
            <PerformanceChart assets={assets} />
          </div>
        )}

        {slide === 'top5' && (
          <div className="w-full max-w-2xl space-y-4">
            <h2 className="text-2xl font-bold text-center mb-6">Top 5 Posições</h2>
            {top5.map((a, i) => {
              const value = a.currentPrice * a.quantity;
              const pnl = (a.currentPrice - a.avgPrice) * a.quantity;
              const pnlPct = a.avgPrice > 0 ? ((a.currentPrice - a.avgPrice) / a.avgPrice) * 100 : 0;
              return (
                <div key={a.ticker} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-muted-foreground w-8">#{i + 1}</span>
                    <div>
                      <p className="font-bold font-mono text-lg">{a.ticker}</p>
                      <p className="text-sm text-muted-foreground">{a.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold font-mono text-lg">{formatCurrency(value)}</p>
                    <p className={`text-sm font-mono ${pnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                      {formatCurrency(pnl)} ({formatPercent(pnlPct)})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide indicators */}
      <div className="flex items-center justify-center gap-2 pb-4">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={`h-2 rounded-full transition-all ${i === currentSlide ? 'w-8 bg-primary' : 'w-2 bg-muted-foreground/30'}`}
          />
        ))}
      </div>
    </div>
  );
}
