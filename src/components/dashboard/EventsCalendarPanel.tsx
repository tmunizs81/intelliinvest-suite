import { useState, useMemo } from 'react';
import { type Asset } from '@/lib/mockData';
import { Calendar, DollarSign, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CalendarEvent {
  date: Date;
  type: 'dividend' | 'maturity' | 'earnings';
  label: string;
  ticker: string;
}

export default function EventsCalendarPanel({ assets }: { assets: Asset[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const events = useMemo(() => {
    const evts: CalendarEvent[] = [];
    const now = new Date();

    assets.forEach(a => {
      // Simulate quarterly dividend dates
      if (a.type === 'Ação' || a.type === 'FII') {
        for (let m = 0; m < 12; m++) {
          if (m % 3 === 0) {
            const d = new Date(now.getFullYear(), now.getMonth() + m, 15);
            evts.push({ date: d, type: 'dividend', label: `Dividendo estimado`, ticker: a.ticker });
          }
        }
      }
      // Maturity dates for fixed income
      if (a.type === 'Renda Fixa' && (a as any).maturityDate) {
        const md = new Date((a as any).maturityDate);
        evts.push({ date: md, type: 'maturity', label: 'Vencimento', ticker: a.ticker });
      }
      // Simulate quarterly earnings
      if (a.type === 'Ação') {
        for (let q = 0; q < 4; q++) {
          const d = new Date(now.getFullYear(), q * 3 + 1, 20 + Math.floor(Math.random() * 8));
          evts.push({ date: d, type: 'earnings', label: 'Resultado trimestral', ticker: a.ticker });
        }
      }
    });

    return evts;
  }, [assets]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = monthStart.getDay();

  const eventsForDate = (date: Date) => events.filter(e => isSameDay(e.date, date));
  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  const typeConfig = {
    dividend: { icon: DollarSign, color: 'text-gain', bg: 'bg-gain/20', dot: 'bg-gain' },
    maturity: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20', dot: 'bg-amber-400' },
    earnings: { icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/20', dot: 'bg-blue-400' },
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <h4 className="text-sm font-semibold capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
        </h4>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-center text-[9px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-0.5 flex-1">
        {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
        {days.map(day => {
          const dayEvents = eventsForDate(day);
          const hasEvents = dayEvents.length > 0;
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDate(isSelected ? null : day)}
              className={`relative h-8 rounded-md text-[11px] transition-all ${
                isToday(day) ? 'font-bold text-primary' : ''
              } ${isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'} ${
                !isSameMonth(day, currentMonth) ? 'text-muted-foreground/30' : ''
              }`}
            >
              {day.getDate()}
              {hasEvents && (
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <div key={i} className={`h-1 w-1 rounded-full ${typeConfig[e.type].dot}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-3 justify-center">
        {Object.entries(typeConfig).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            <span className="text-[9px] text-muted-foreground capitalize">{type === 'dividend' ? 'Dividendo' : type === 'maturity' ? 'Vencimento' : 'Resultado'}</span>
          </div>
        ))}
      </div>

      {/* Selected date events */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground font-medium">
            {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
          </p>
          {selectedEvents.map((e, i) => {
            const cfg = typeConfig[e.type];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${cfg.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${cfg.color} shrink-0`} />
                <div>
                  <span className="text-xs font-bold">{e.ticker}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">{e.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
