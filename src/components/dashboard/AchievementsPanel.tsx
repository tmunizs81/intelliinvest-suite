import { useState, useEffect, useMemo } from 'react';
import { type Asset } from '@/lib/mockData';
import { Trophy, Star, TrendingUp, Shield, Target, Zap, Award, Medal, Crown, Gem, Lock } from 'lucide-react';

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: typeof Trophy;
  condition: (ctx: AchievementContext) => boolean;
  tier: 'bronze' | 'silver' | 'gold';
}

interface AchievementContext {
  assetsCount: number;
  sectorsCount: number;
  totalInvested: number;
  hasFII: boolean;
  hasStock: boolean;
  hasFixedIncome: boolean;
  hasCrypto: boolean;
  memberDays: number;
}

const achievements: Achievement[] = [
  { id: 'first-asset', title: 'Primeiro Passo', description: 'Adicione seu primeiro ativo', icon: Star, tier: 'bronze', condition: ctx => ctx.assetsCount >= 1 },
  { id: '5-assets', title: 'Carteira Iniciante', description: 'Tenha 5 ativos na carteira', icon: TrendingUp, tier: 'bronze', condition: ctx => ctx.assetsCount >= 5 },
  { id: '10-assets', title: 'Investidor Dedicado', description: 'Tenha 10 ativos na carteira', icon: Award, tier: 'silver', condition: ctx => ctx.assetsCount >= 10 },
  { id: '20-assets', title: 'Carteira Robusta', description: 'Tenha 20 ativos na carteira', icon: Crown, tier: 'gold', condition: ctx => ctx.assetsCount >= 20 },
  { id: 'diversified-3', title: 'Diversificador', description: 'Invista em 3+ setores', icon: Shield, tier: 'bronze', condition: ctx => ctx.sectorsCount >= 3 },
  { id: 'diversified-5', title: 'Multi-Setor', description: 'Invista em 5+ setores', icon: Shield, tier: 'silver', condition: ctx => ctx.sectorsCount >= 5 },
  { id: 'has-fii', title: 'Renda Passiva', description: 'Adicione um FII à carteira', icon: Target, tier: 'bronze', condition: ctx => ctx.hasFII },
  { id: 'has-all', title: 'Estrategista Total', description: 'Tenha Ações, FIIs e Renda Fixa', icon: Gem, tier: 'gold', condition: ctx => ctx.hasStock && ctx.hasFII && ctx.hasFixedIncome },
  { id: '10k', title: 'Marca dos R$10k', description: 'Invista R$10.000+', icon: Zap, tier: 'bronze', condition: ctx => ctx.totalInvested >= 10000 },
  { id: '100k', title: 'Centenário', description: 'Invista R$100.000+', icon: Medal, tier: 'silver', condition: ctx => ctx.totalInvested >= 100000 },
  { id: '1m', title: 'Milionário', description: 'Invista R$1.000.000+', icon: Trophy, tier: 'gold', condition: ctx => ctx.totalInvested >= 1000000 },
  { id: '30-days', title: '30 Dias Investindo', description: 'Membro há 30+ dias', icon: Star, tier: 'bronze', condition: ctx => ctx.memberDays >= 30 },
];

const tierConfig = {
  bronze: { bg: 'bg-amber-700/10', border: 'border-amber-700/20', text: 'text-amber-600', label: '🥉 Bronze' },
  silver: { bg: 'bg-slate-400/10', border: 'border-slate-400/20', text: 'text-slate-400', label: '🥈 Prata' },
  gold: { bg: 'bg-amber-400/10', border: 'border-amber-400/20', text: 'text-amber-400', label: '🥇 Ouro' },
};

export default function AchievementsPanel({ assets }: { assets: Asset[] }) {
  const [memberDays, setMemberDays] = useState(0);

  useEffect(() => {
    const created = localStorage.getItem('member-since');
    if (!created) {
      localStorage.setItem('member-since', new Date().toISOString());
      setMemberDays(0);
    } else {
      setMemberDays(Math.floor((Date.now() - new Date(created).getTime()) / 86400000));
    }
  }, []);

  const ctx = useMemo<AchievementContext>(() => {
    const sectors = new Set(assets.map(a => a.sector || a.type));
    return {
      assetsCount: assets.length,
      sectorsCount: sectors.size,
      totalInvested: assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0),
      hasFII: assets.some(a => a.type === 'FII'),
      hasStock: assets.some(a => a.type === 'Ação'),
      hasFixedIncome: assets.some(a => a.type === 'Renda Fixa'),
      hasCrypto: assets.some(a => a.type === 'Cripto'),
      memberDays,
    };
  }, [assets, memberDays]);

  const unlocked = achievements.filter(a => a.condition(ctx));
  const locked = achievements.filter(a => !a.condition(ctx));

  return (
    <div className="p-4 h-full flex flex-col space-y-4 overflow-auto">
      {/* Stats */}
      <div className="flex items-center gap-4 justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold font-mono text-primary">{unlocked.length}</p>
          <p className="text-[10px] text-muted-foreground">Desbloqueadas</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="text-center">
          <p className="text-2xl font-bold font-mono text-muted-foreground">{achievements.length}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="text-center">
          <p className="text-2xl font-bold font-mono text-warning">{Math.round((unlocked.length / achievements.length) * 100)}%</p>
          <p className="text-[10px] text-muted-foreground">Progresso</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(unlocked.length / achievements.length) * 100}%` }}
        />
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">🏆 Conquistadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unlocked.map(a => {
              const cfg = tierConfig[a.tier];
              const Icon = a.icon;
              return (
                <div key={a.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${cfg.border} ${cfg.bg}`}>
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.text}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground">{a.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">🔒 Bloqueadas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {locked.map(a => (
              <div key={a.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-muted/20 opacity-60">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
