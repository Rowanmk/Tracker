import { useMemo } from 'react';

interface StaffPerformance {
  staff_id: number;
  total: number;
  target?: number;
}

interface Params {
  staffPerformance: StaffPerformance[];
  workingDays: number;
  workingDaysUpToToday: number;
  selectedMonth: number;
  selectedYear: number;
  dashboardMode: 'team' | 'individual';
  currentStaff: { staff_id: number } | null;
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
    const isCurrentMonth =
      selectedMonth === today.getMonth() + 1 &&
      selectedYear === today.getFullYear();

    const delivered =
      dashboardMode === 'team'
        ? staffPerformance.reduce((s, p) => s + p.total, 0)
        : staffPerformance.find(p => p.staff_id === currentStaff?.staff_id)?.total || 0;

    const target =
      dashboardMode === 'team'
        ? staffPerformance.reduce((s, p) => s + (p.target || 0), 0)
        : staffPerformance.find(p => p.staff_id === currentStaff?.staff_id)?.target || 0;

    let expected = 0;

    if (target > 0) {
      if (!isCurrentMonth) {
        expected = target;
      } else if (workingDays > 0) {
        expected = (target / workingDays) * workingDaysUpToToday;
      }
    }

    const variance = delivered - expected;

    let statusText = 'No target set';
    if (target > 0) {
      if (Math.abs(variance) < 0.5) statusText = 'On track';
      else if (variance > 0) statusText = `Ahead by ${Math.round(variance)} items`;
      else statusText = `Behind by ${Math.abs(Math.round(variance))} items`;
    }

    return {
      delivered,
      target,
      expected: Math.round(expected),
      variance: Math.round(variance),
      statusText,
    };
  }, [
    staffPerformance,
    workingDays,
    workingDaysUpToToday,
    selectedMonth,
    selectedYear,
    dashboardMode,
    currentStaff,
  ]);
};
