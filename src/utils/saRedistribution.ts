import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type SADistributionRule = Database['public']['Tables']['sa_distribution_rules']['Row'];

/**
 * Stable apportionment to distribute an integer across N slots
 * without rounding drift
 */
function distributeIntegerTarget(total: number, slots: number): number[] {
  if (slots <= 0) return [];

  const base = Math.floor(total / slots);
  const remainder = total - base * slots;

  const result = new Array(slots).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i]++;
  }

  return result;
}

/**
 * Determine if a month is current or future relative to today
 * within the selected financial year
 */
export const isCurrentOrFutureMonth = (
  month: number,
  selectedFinancialYear: FinancialYear
): boolean => {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const monthYear = month >= 4
    ? selectedFinancialYear.start
    : selectedFinancialYear.end;

  if (monthYear > currentYear) return true;
  if (monthYear < currentYear) return false;

  return month >= currentMonth;
};

/**
 * Calculate SA actuals up to the end of the last completed month
 */
async function getActualsToLastCompletedMonth(
  staffId: number,
  financialYear: FinancialYear,
  lastCompletedMonth: number
): Promise<number> {
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .ilike('service_name', '%self assessment%');

  const saService = services?.[0];
  if (!saService) return 0;

  const endYear = lastCompletedMonth >= 4
    ? financialYear.start
    : financialYear.end;

  const endDate = new Date(endYear, lastCompletedMonth, 0)
    .toISOString()
    .split('T')[0];

  const { data: activities } = await supabase
    .from('dailyactivity')
    .select('delivered_count')
    .eq('staff_id', staffId)
    .eq('service_id', saService.service_id)
    .gte('date', `${financialYear.start}-04-01`)
    .lte('date', endDate);

  return activities?.reduce(
    (sum, a) => sum + a.delivered_count,
    0
  ) || 0;
}

/**
 * MAIN PURE FUNCTION
 * Calculates all 12 SA monthly targets based on:
 * - cumulative deadlines
 * - actuals to last completed month
 * - remaining runway
 * - overrides
 */
export async function calculateAllSAMonths({
  staffId,
  annualTarget,
  financialYear,
  currentMonth,
  overrides,
  distributionRules
}: {
  staffId: number;
  annualTarget: number;
  financialYear: FinancialYear;
  currentMonth: number;
  overrides: Record<number, number>;
  distributionRules: SADistributionRule[];
}): Promise<Record<number, number>> {

  const result: Record<number, number> = {};

  // Initialise all months to zero
  for (let m = 1; m <= 12; m++) {
    result[m] = 0;
  }

  // Feb / Mar always zero
  result[2] = 0;
  result[3] = 0;

  if (annualTarget <= 0 || distributionRules.length === 0) {
    return result;
  }

  // Apply overrides up-front
  Object.entries(overrides).forEach(([m, val]) => {
    result[Number(m)] = val;
  });

  const lastCompletedMonth = currentMonth === 1 ? 12 : currentMonth - 1;

  const actualsToDate = await getActualsToLastCompletedMonth(
    staffId,
    financialYear,
    lastCompletedMonth
  );

  const checkpoints = [
    { name: 'Period 1', endMonth: 7, cumulativePct: 50 },
    { name: 'Period 2', endMonth: 11, cumulativePct: 90 },
    { name: 'Period 3', endMonth: 1, cumulativePct: 100 }
  ];

  let carriedActuals = actualsToDate;

  for (const checkpoint of checkpoints) {
    const cumulativeTarget =
      Math.round(annualTarget * (checkpoint.cumulativePct / 100));

    const remainingRequired = Math.max(
      0,
      cumulativeTarget - carriedActuals
    );

    const eligibleMonths = [];

    for (let m = 1; m <= 12; m++) {
      const withinRange =
        (checkpoint.endMonth >= 4 && m >= currentMonth && m <= checkpoint.endMonth) ||
        (checkpoint.endMonth < 4 && (m >= currentMonth || m <= checkpoint.endMonth));

      if (
        withinRange &&
        m !== 2 &&
        m !== 3 &&
        !overrides.hasOwnProperty(m)
      ) {
        eligibleMonths.push(m);
      }
    }

    if (eligibleMonths.length > 0 && remainingRequired > 0) {
      const allocations = distributeIntegerTarget(
        remainingRequired,
        eligibleMonths.length
      );

      eligibleMonths.forEach((m, i) => {
        result[m] += allocations[i];
      });
    }

    carriedActuals = cumulativeTarget;
  }

  // Final reconciliation to guarantee total === annualTarget
  const totalAllocated = Object.values(result).reduce(
    (sum, v) => sum + v,
    0
  );

  const diff = annualTarget - totalAllocated;
  if (diff !== 0) {
    const adjustable = Object.keys(result)
      .map(Number)
      .filter(
        m =>
          m !== 2 &&
          m !== 3 &&
          !overrides.hasOwnProperty(m) &&
          isCurrentOrFutureMonth(m, financialYear)
      )
      .sort((a, b) => b - a);

    if (adjustable.length > 0) {
      result[adjustable[0]] += diff;
    }
  }

  return result;
}

/**
 * Distribution rules loader (unchanged)
 */
export async function getSADistributionRules(): Promise<SADistributionRule[]> {
  const defaultRules: Omit<SADistributionRule, 'id' | 'created_at' | 'updated_at'>[] = [
    { period_name: 'Period 1', months: [4, 5, 6, 7], percentage: 50 },
    { period_name: 'Period 2', months: [8, 9, 10, 11], percentage: 40 },
    { period_name: 'Period 3a', months: [12], percentage: 3.5 },
    { period_name: 'Period 3b', months: [1], percentage: 6.5 },
    { period_name: 'Period 4', months: [2, 3], percentage: 0 },
  ];

  try {
    const { data, error } = await supabase
      .from('sa_distribution_rules')
      .select('*')
      .order('id');

    if (error || !data || data.length === 0) {
      return defaultRules.map((r, i) => ({
        ...r,
        id: i + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    }

    return data;
  } catch {
    return defaultRules.map((r, i) => ({
      ...r,
      id: i + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  }
}
