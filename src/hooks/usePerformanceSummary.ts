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

    let expectedRaw = 0;
    if (target > 0 && workingDays > 0) {
      expectedRaw = (target / workingDays) * Math.min(workingDaysUpToToday, workingDays);
    }

    const varianceRaw = delivered - expectedRaw;
    const expected = Math.round(expectedRaw);
    const variance = Math.round(varianceRaw);

    return {
      delivered,
      target,
      expected,
      expectedRaw,
      variance,
      varianceRaw,
      statusText: target > 0 ? (varianceRaw >= 0 ? `Ahead by ${Math.round(varianceRaw)}` : `Behind by ${Math.abs(Math.round(varianceRaw))}`) : 'No target',
    };
  }, [staffPerformance, workingDays, workingDaysUpToToday, selectedMonth, selectedYear, dashboardMode, currentStaff, teamTarget]);
};