import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type MonthlyTarget = Database['public']['Tables']['monthlytargets']['Row'];

function getExpectedYearForMonth(month: number, financialYear: FinancialYear): number {
  return month >= 4 ? financialYear.start : financialYear.end;
}

export async function loadTargets(
  month: number,
  financialYear: FinancialYear,
  staffId?: number
) {
  const expectedYear = getExpectedYearForMonth(month, financialYear);

  let query = supabase
    .from('monthlytargets')
    .select('staff_id, service_id, month, year, target_value')
    .eq('month', month)
    .eq('year', expectedYear);

  if (staffId) {
    query = query.eq('staff_id', staffId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error loading targets:', error);
    throw error;
  }

  const perService: Record<number, number> = {};
  let totalTarget = 0;

  (data as MonthlyTarget[] || []).forEach((row) => {
    const expected = getExpectedYearForMonth(row.month, financialYear);
    if (row.year !== expected) return;

    // 🔒 Guard against null service_id (required for TS safety)
    if (row.service_id == null) return;

    const val = row.target_value ?? 0;
    perService[row.service_id] = (perService[row.service_id] || 0) + val;
    totalTarget += val;
  });

  return { perService, totalTarget };
}
