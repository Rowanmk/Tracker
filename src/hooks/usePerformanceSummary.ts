import { useMemo } from 'react';

interface PerformanceData {
  staff_id: number;
  total: number;
  target?: number;
}

interface Params {
  staffPerformance: PerformanceData[];
  workingDays: number;
  workingDaysUpToToday: number;
  selectedMonth: number;
  selectedYear: number;
  dashboardMode: 'team' | 'individual';
  currentStaff: { staff_id: number } | null;
  teamTarget?: number;
}

export const usePerformanceSummary = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  selectedMonth,
  selectedYear,
  dashboardMode,
  currentStaff,
  teamTarget,
}: Params) => {
  return useMemo(() => {
    const delivered = dashboardMode === 'individual' && currentStaff
      ? staffPerformance.find(p => p.staff_id === currentStaff.staff_id)?.total || 0
      : staffPerformance.reduce((s, p) => s + p.total, 0);

    const target = teamTarget !== undefined ? teamTarget : 0;

    // Always use the passed workingDays and workingDaysUpToToday directly.
    // These already account for bank holidays, weekends, playback position,
    // and whether the month is current/past/future — computed in Dashboard.tsx.
    let expected = 0;
    if (target > 0 && workingDays > 0) {
      expected = (target / workingDays) * Math.min(workingDaysUpToToday, workingDays);
    }

    const variance = delivered - expected;

    return {
      delivered,
      target,
      expected: Math.round(expected),
      variance: Math.round(variance),
      statusText: target > 0 ? (variance >= 0 ? `Ahead by ${Math.round(variance)}` : `Behind by ${Math.abs(Math.round(variance))}`) : 'No target',
    };
  }, [staffPerformance, workingDays, workingDaysUpToToday, selectedMonth, selectedYear, dashboardMode, currentStaff, teamTarget]);
};