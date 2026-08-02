import { useState, useEffect } from 'react';

export type CalendarPosition = 'tab' | 'top';
export type CalendarMode = 'compact' | 'full';

const LS_POS = 'calendar:position:v1';
const LS_MODE = 'calendar:mode:v1';

export function useCalendarSettings() {
  const [position, setPosition] = useState<CalendarPosition>(() => {
    return (localStorage.getItem(LS_POS) as CalendarPosition) || 'tab';
  });
  
  const [mode, setMode] = useState<CalendarMode>(() => {
    return (localStorage.getItem(LS_MODE) as CalendarMode) || 'compact';
  });

  useEffect(() => {
    localStorage.setItem(LS_POS, position);
  }, [position]);

  useEffect(() => {
    localStorage.setItem(LS_MODE, mode);
  }, [mode]);

  return {
    position,
    setPosition,
    mode,
    setMode
  };
}
