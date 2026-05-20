import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../supabase/client';
import { chartThemes, type ChartTheme, type ChartThemeId } from '../utils/chartThemes';

const STORAGE_KEY = 'crew-chart-theme';
const DEFAULT_THEME_ID: ChartThemeId = 'crew-classic';

interface ChartThemeContextValue {
  theme: ChartTheme;
  setTheme: (themeId: string) => void;
  availableThemes: ChartTheme[];
}

const ChartThemeContext = createContext<ChartThemeContextValue | undefined>(undefined);

const resolveThemeId = (themeId: string | null | undefined): ChartThemeId => {
  if (themeId && themeId in chartThemes) {
    return themeId as ChartThemeId;
  }
  return DEFAULT_THEME_ID;
};

export const ChartThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStaff } = useAuth();
  const [themeId, setThemeId] = useState<ChartThemeId>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_THEME_ID;
    }
    return resolveThemeId(window.localStorage.getItem(STORAGE_KEY));
  });

  const syncedStaffIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const resolved = resolveThemeId(stored);
    setThemeId(resolved);
  }, []);

  useEffect(() => {
    if (!currentStaff) return;

    const staffThemeId = resolveThemeId(currentStaff.chart_theme ?? null);
    const localThemeId =
      typeof window !== 'undefined' ? resolveThemeId(window.localStorage.getItem(STORAGE_KEY)) : DEFAULT_THEME_ID;

    if (syncedStaffIdRef.current !== currentStaff.staff_id || staffThemeId !== localThemeId) {
      syncedStaffIdRef.current = currentStaff.staff_id;
      setThemeId(staffThemeId);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, staffThemeId);
      }
      return;
    }

    syncedStaffIdRef.current = currentStaff.staff_id;
  }, [currentStaff]);

  const setTheme = (nextThemeId: string) => {
    const resolvedThemeId = resolveThemeId(nextThemeId);

    setThemeId(resolvedThemeId);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, resolvedThemeId);
    }

    if (!currentStaff?.staff_id) {
      return;
    }

    void supabase
      .from('staff')
      .update({ chart_theme: resolvedThemeId })
      .eq('staff_id', currentStaff.staff_id);
  };

  const value = useMemo<ChartThemeContextValue>(
    () => ({
      theme: chartThemes[themeId],
      setTheme,
      availableThemes: Object.values(chartThemes),
    }),
    [themeId]
  );

  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
};

export const useChartTheme = (): ChartThemeContextValue => {
  const context = useContext(ChartThemeContext);
  if (!context) {
    throw new Error('useChartTheme must be used within a ChartThemeProvider');
  }
  return context;
};