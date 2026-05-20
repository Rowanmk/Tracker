import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../supabase/client';
import { chartThemes, defaultChartThemeId, type ChartTheme, type ChartThemeId } from '../utils/chartThemes';

interface ChartThemeContextValue {
  theme: ChartTheme;
  setTheme: (themeId: string) => void;
  availableThemes: ChartTheme[];
}

const LOCAL_STORAGE_KEY = 'crew-chart-theme';

const ChartThemeContext = createContext<ChartThemeContextValue | undefined>(undefined);

const getStoredThemeId = (): ChartThemeId | null => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored && stored in chartThemes) {
      return stored as ChartThemeId;
    }
    return null;
  } catch {
    return null;
  }
};

const getThemeById = (themeId: string | null | undefined): ChartTheme => {
  if (themeId && themeId in chartThemes) {
    return chartThemes[themeId as ChartThemeId];
  }
  return chartThemes[defaultChartThemeId];
};

export const ChartThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStaff } = useAuth();
  const [themeId, setThemeIdState] = useState<ChartThemeId>(() => getStoredThemeId() || defaultChartThemeId);
  const lastSyncedStaffThemeRef = useRef<string | null>(null);

  useEffect(() => {
    const storedThemeId = getStoredThemeId();
    if (storedThemeId) {
      setThemeIdState(storedThemeId);
    } else {
      setThemeIdState(defaultChartThemeId);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, defaultChartThemeId);
      } catch {
        return;
      }
    }
  }, []);

  useEffect(() => {
    if (!currentStaff) {
      if (!getStoredThemeId()) {
        setThemeIdState(defaultChartThemeId);
      }
      return;
    }

    const staffTheme = currentStaff.chart_theme && currentStaff.chart_theme in chartThemes
      ? currentStaff.chart_theme
      : null;
    const localTheme = getStoredThemeId();

    if (staffTheme && staffTheme !== localTheme) {
      setThemeIdState(staffTheme as ChartThemeId);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, staffTheme);
      } catch {
        return;
      }
      lastSyncedStaffThemeRef.current = staffTheme;
      return;
    }

    if (!staffTheme && !localTheme) {
      setThemeIdState(defaultChartThemeId);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, defaultChartThemeId);
      } catch {
        return;
      }
    }
  }, [currentStaff]);

  const setTheme = (nextThemeId: string) => {
    if (!(nextThemeId in chartThemes)) return;
    const validThemeId = nextThemeId as ChartThemeId;

    setThemeIdState(validThemeId);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, validThemeId);
    } catch {
      return;
    }

    if (currentStaff?.staff_id) {
      lastSyncedStaffThemeRef.current = validThemeId;
      void supabase
        .from('staff')
        .update({ chart_theme: validThemeId })
        .eq('staff_id', currentStaff.staff_id);
    }
  };

  const value = useMemo<ChartThemeContextValue>(() => ({
    theme: getThemeById(themeId),
    setTheme,
    availableThemes: Object.values(chartThemes),
  }), [themeId]);

  return <ChartThemeContext.Provider value={value}>{children}</ChartThemeContext.Provider>;
};

export const useChartTheme = (): ChartThemeContextValue => {
  const context = useContext(ChartThemeContext);
  if (!context) {
    throw new Error('useChartTheme must be used within a ChartThemeProvider');
  }
  return context;
};