import { useMemo } from 'react';
import { calculateRunRateDelta } from '../utils/runRate';

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
    const isIndividualView = dashboardMode === 'individual' && currentStaff;

    const delivered = isIndividualView
      ? staffPerformance.find((performance) => performance.staff_id === currentStaff.staff_id)?.total || 0
      : staffPerformance.reduce((sum, performance) => sum + performance.total, 0);

    const fallbackTarget = isIndividualView
      ? staffPerformance.find((performance) => performance.staff_id === currentStaff.staff_id)?.target || 0
      : staffPerformance.reduce((sum, performance) => sum + (performance.target || 0), 0);

    const target = teamTarget !== undefined ? teamTarget : fallbackTarget;

    const runRate = calculateRunRateDelta(delivered, target, workingDays, workingDaysUpToToday);

    return {
      delivered,
      target,
      expected: runRate.roundedExpected,
      expectedRaw: runRate.expectedRaw,
      variance: runRate.variance,
      varianceRaw: runRate.variance,
      statusText:
        target > 0
          ? runRate.variance >= 0
            ? `Ahead by ${runRate.variance}`
            : `Behind by ${Math.abs(runRate.variance)}`
          : 'No target',
    };
  }, [staffPerformance, workingDays, workingDaysUpToToday, selectedMonth, selectedYear, dashboardMode, currentStaff, teamTarget]);
};