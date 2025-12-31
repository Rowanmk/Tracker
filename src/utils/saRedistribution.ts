import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type SADistributionRule =
  Database['public']['Tables']['sa_distribution_rules']['Row'];

/**
 * DISABLED: Self Assessment auto-distribution is permanently disabled.
 * SA targets are now fully manual, per-month values with no recalculation.
 * 
 * This function is kept as a no-op stub for backward compatibility only.
 * Do not use. All SA targets must be entered manually via TargetsControl.
 */
export function calculateAllSAMonths(): Record<number, number> {
  return {};
}

/**
 * DISABLED: Stable integer apportionment function.
 * No longer used. SA targets are manual only.
 */
function distributeIntegerTarget(total: number, slots: number): number[] {
  return [];
}

/**
 * DISABLED: Fetch SA distribution rules from database.
 * No longer used. SA targets are manual only.
 */
export async function getSADistributionRules(): Promise<SADistributionRule[]> {
  return [];
}

/**
 * DISABLED: Fetch period-bounded actuals for SA.
 * No longer used. SA targets are manual only.
 */
export async function getSAPeriodBoundedActuals(
  staffId: number,
  financialYear: FinancialYear
): Promise<Record<number, number>> {
  return {};
}

/**
 * DISABLED: Check if month is current or future.
 * No longer used. SA targets are manual only.
 */
export function isCurrentOrFutureMonth(
  month: number,
  fy: FinancialYear
): boolean {
  return false;
}