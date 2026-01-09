import { supabase } from '../supabase/client';
import type { FinancialYear } from './financialYear';

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

  (data || []).forEach(row => {
    const expected = getExpectedYearForMonth(row.month, financialYear);
    if (row.year !== expected) return;

    const val = row.target_value || 0;
    perService[row.service_id] = (perService[row.service_id] || 0) + val;
    totalTarget += val;
  });

  return { perService, totalTarget };
}

export async function saveTargets(
  staffId: number,
  month: number,
  financialYear: FinancialYear,
  serviceTargets: Record<number, number>
) {
  const expectedYear = getExpectedYearForMonth(month, financialYear);

  const inserts = Object.entries(serviceTargets).map(([sid, val]) => ({
    staff_id: staffId,
    service_id: Number(sid),
    month,
    year: expectedYear,
    target_value: val || 0,
  }));

  await supabase
    .from('monthlytargets')
    .delete()
    .eq('staff_id', staffId)
    .eq('month', month)
    .eq('year', expectedYear);

  const { error } = await supabase.from('monthlytargets').insert(inserts);
  if (error) throw error;

  return { success: true };
}

export function isTargetInFinancialYear(
  targetMonth: number,
  targetYear: number,
  financialYear: FinancialYear
): boolean {
  return targetYear === getExpectedYearForMonth(targetMonth, financialYear);
}
