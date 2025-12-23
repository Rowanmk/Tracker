import { supabase } from '../supabase/client';
import type { FinancialYear } from './financialYear';

export async function loadTargets(month: number, financialYear: FinancialYear, staffId?: number) {
  const year = month >= 4 ? financialYear.start : financialYear.end;

  let query = supabase
    .from("monthlytargets")
    .select("staff_id, service_id, month, year, target_value")
    .eq("month", month)
    .eq("year", year);

  if (staffId) {
    query = query.eq("staff_id", staffId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error loading targets:', error);
    throw error;
  }

  const perService: Record<number, number> = {};
  let totalTarget = 0;

  (data || []).forEach(row => {
    const sid = row.service_id;
    const val = row.target_value || 0;
    
    if (sid) {
      perService[sid] = (perService[sid] || 0) + val;
      totalTarget += val;
    }
  });

  return { perService, totalTarget };
}