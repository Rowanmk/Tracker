import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type SADistributionRule =
  Database['public']['Tables']['sa_distribution_rules']['Row'];

/**
 * Stable integer apportionment with no rounding drift
 */
function distributeIntegerTarget(total: number, slots: number): number[] {
  if (slots <= 0 || total <= 0) return [];

  const base = Math.floor(total / slots);
  const remainder = total - base * slots;

  const result = new Array(slots).fill(base);
  for (let i = 0; i < remainder; i++) {
    result[i]++;
  }

  return result;
}

/**
 * Is a month current or future relative to today
 */
export function isCurrentOrFutureMonth(
  month: number,
  fy: FinancialYear
): boolean {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const monthYear = month >= 4 ? fy.start : fy.end;

  if (monthYear > currentYear) return true;
  if (monthYear < currentYear) return false;

  return month >= currentMonth;
}

/**
 * Fetch SA distribution rules from the database
 */
export async function getSADistributionRules(): Promise<SADistributionRule[]> {
  const { data, error } = await supabase
    .from('sa_distribution_rules')
    .select('*');

  if (error) throw error;

  return data || [];
}

/**
 * Fetch period-bounded actuals for a staff member in a financial year
 */
export async function getSAPeriodBoundedActuals(
  staffId: number,
  financialYear: FinancialYear
): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('activities')
    .select('month, actual_value')
    .eq('staff_id', staffId)
    .gte('year', financialYear.start)
    .lte('year', financialYear.end);

  if (error) throw error;

  const actuals: Record<number, number> = {};
  (data || []).forEach(row => {
    const month = row.month;
    actuals[month] = (actuals[month] || 0) + (row.actual_value || 0);
  });

  return actuals;
}

/**
 * MAIN PURE FUNCTION
 */
export function calculateAllSAMonths({
  annualTarget,
  actualsByPeriod,
  currentMonth,
  overrides,
  distributionRules,
}: {
  annualTarget: number;
  actualsByPeriod: Record<number, number>;
  currentMonth: number;
  overrides: Record<number, number>;
  distributionRules: SADistributionRule[];
}): Record<number, number> {
  const result: Record<number, number> = {};

  // Initialise months
  for (let m = 1; m <= 12; m++) result[m] = 0;

  // Feb / Mar always zero
  result[2] = 0;
  result[3] = 0;

  if (annualTarget <= 0) return result;

  // Calculate actuals delivered to date
  let carriedActuals = 0;
  for (let m = 1; m < currentMonth; m++) {
    carriedActuals += actualsByPeriod[m] || 0;
  }

  // Apply overrides first
  Object.entries(overrides).forEach(([m, v]) => {
    result[Number(m)] = v;
  });

  // Cumulative checkpoints
  const checkpoints = [
    { endMonth: 7, cumulativePct: 50 },
    { endMonth: 11, cumulativePct: 90 },
    { endMonth: 1, cumulativePct: 100 },
  ];

  for (const checkpoint of checkpoints) {
    const cumulativeTarget = Math.round(
      annualTarget * (checkpoint.cumulativePct / 100)
    );

    const remainingRequired = Math.max(
      0,
      cumulativeTarget - carriedActuals
    );

    if (remainingRequired <= 0) {
      carriedActuals = cumulativeTarget;
      continue;
    }

    const eligibleMonths: number[] = [];

    for (let m = 1; m <= 12; m++) {
      const withinRange =
        checkpoint.endMonth >= 4
          ? m >= currentMonth && m <= checkpoint.endMonth
          : m >= currentMonth || m <= checkpoint.endMonth;

      if (
        withinRange &&
        m !== 2 &&
        m !== 3 &&
        !overrides.hasOwnProperty(m)
      ) {
        eligibleMonths.push(m);
      }
    }

    if (eligibleMonths.length > 0) {
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

  // Final reconciliation safeguard
  const totalAllocated = Object.values(result).reduce(
    (s, v) => s + v,
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
          m >= currentMonth
      )
      .sort((a, b) => b - a);

    if (adjustable.length > 0) {
      result[adjustable[0]] += diff;
    }
  }

  return result;
}