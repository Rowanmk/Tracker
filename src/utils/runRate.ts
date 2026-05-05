import type { FinancialYear } from './financialYear';

export const clampWorkingDaysElapsed = (workingDays: number, workingDaysElapsed: number) =>
  Math.max(0, Math.min(workingDaysElapsed, workingDays));

export const calculateExpectedRaw = (
  target: number,
  workingDays: number,
  workingDaysElapsed: number
) => {
  if (target <= 0 || workingDays <= 0) {
    return 0;
  }

  const clampedElapsed = clampWorkingDaysElapsed(workingDays, workingDaysElapsed);
  return (target / workingDays) * clampedElapsed;
};

export const calculateRunRateDelta = (
  delivered: number,
  target: number,
  workingDays: number,
  workingDaysElapsed: number
) => {
  const expectedRaw = calculateExpectedRaw(target, workingDays, workingDaysElapsed);
  const roundedDelivered = Math.round(delivered);
  const roundedExpected = Math.round(expectedRaw);
  // PRE-FIX-4: variance = Math.round(delivered) - Math.round(expectedRaw) — could drift by ±1 due to double-rounding
  const variance = Math.round(delivered - expectedRaw);

  return {
    delivered,
    roundedDelivered,
    target,
    expectedRaw,
    roundedExpected,
    variance,
  };
};

export const getMonthYearFromFinancialYear = (month: number, financialYear: FinancialYear) =>
  month >= 4 ? financialYear.start : financialYear.end;