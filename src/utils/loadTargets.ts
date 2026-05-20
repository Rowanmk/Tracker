import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import { getYearForMonth, type FinancialYear } from './financialYear';

type MonthlyTarget = Database['public']['Tables']['monthlytargets']['Row'];

let cachedBagelServiceId: number | null | undefined = undefined;

async function getBagelServiceId() {
  if (cachedBagelServiceId !== undefined) return cachedBagelServiceId;
  const { data } = await supabase
    .from('services')
    .select('service_id')
    .eq('service_name', 'Bagel Days')
    .maybeSingle();
  cachedBagelServiceId = data?.service_id ?? null;
  return cachedBagelServiceId;
}

export function isTargetInFinancialYear(month: number, year: number, financialYear: FinancialYear): boolean {
  const expectedYear = getYearForMonth(month, financialYear);
  return year === expectedYear;
}

export async function loadTargets(
  month: number,
  financialYear: FinancialYear,
  staffId?: number,
  teamId?: number
) {
  const expectedYear = getYearForMonth(month, financialYear);
  const bagelServiceId = await getBagelServiceId();

  let query = supabase
    .from('monthlytargets')
    .select('staff_id, team_id, service_id, month, year, target_value')
    .eq('month', month)
    .eq('year', expectedYear);

  if (staffId) {
    query = query.eq('staff_id', staffId);
  } else if (teamId) {
    query = query.eq('team_id', teamId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const perService: Record<number, number> = {};
  let totalTarget = 0;

  (data as MonthlyTarget[] || []).forEach((row) => {
    const expected = getYearForMonth(row.month, financialYear);
    if (row.year !== expected) return;
    if (row.service_id == null) return;
    
    // Skip Bagel Days as it is a statistics-only measure
    if (bagelServiceId != null && row.service_id === bagelServiceId) return;

    const val = row.target_value ?? 0;
    perService[row.service_id] = (perService[row.service_id] || 0) + val;
    totalTarget += val;
  });

  return { perService, totalTarget };
}