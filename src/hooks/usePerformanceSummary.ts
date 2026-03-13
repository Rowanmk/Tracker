import { useMemo } from 'react';

interface PerformanceData {
  team_id: number | string;
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
  currentStaff: { team_id: number | string } | null;
}

export const usePerformanceSummary = ({
  staffPerformance,
  workingDays,
  workingDaysUpToToday,
  selectedMonth,
  selectedYear,
  dashboardMode,
  currentStaff,
}: Params) => {
  return useMemo(() => {
    const today = new Date();
    const isCurrentMonth = selectedMonth === today.getMonth() + 1 && selectedYear === today.getFullYear();

    const delivered = dashboardMode === 'team'
      ? staffPerformance.reduce((s, p) => s + p.total, 0)
      : staffPerformance.find(p => String(p.team_id) === String(currentStaff?.team_id))?.total || 0;

    const target = dashboardMode === 'team'
      ? staffPerformance.reduce((s, p) => s + (p.target || 0), 0)
      : staffPerformance.find(p => String(p.team_id) === String(currentStaff?.team_id))?.target || 0;

    let expected = 0;
    if (target > 0) {
      if (!isCurrentMonth) {
        expected = target;
      } else if (workingDays > 0) {
        expected = (target / workingDays) * workingDaysUpToToday;
      }
    }

    const variance = delivered - expected;

    return {
      delivered,
      target,
      expected: Math.round(expected),
      variance: Math.round(variance),
      statusText: target > 0 ? (variance >= 0 ? `Ahead by ${Math.round(variance)}` : `Behind by ${Math.abs(Math.round(variance))}`) : 'No target',
    };
  }, [staffPerformance, workingDays, workingDaysUpToToday, selectedMonth, selectedYear, dashboardMode, currentStaff]);
};