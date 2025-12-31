import { supabase } from '../supabase/client';
import type { FinancialYear } from './financialYear';

/**
 * Calculate the expected calendar year for a given month within a financial year.
 * UK rules: Apr–Dec → FY.start, Jan–Mar → FY.end
 */
function getExpectedYearForMonth(month: number, financialYear: FinancialYear): number {
  return month >= 4 ? financialYear.start : financialYear.end;
}

/**
 * Load targets for a specific month and financial year.
 * Enforces strict month-year pairing validation.
 * 
 * @param month - Calendar month (1-12)
 * @param financialYear - Financial year object with start and end years
 * @param staffId - Optional staff ID. If provided, loads only that staff's targets.
 * @returns Object with perService targets and totalTarget
 */
export async function loadTargets(month: number, financialYear: FinancialYear, staffId?: number) {
  // Calculate the expected calendar year for this month
  const expectedYear = getExpectedYearForMonth(month, financialYear);

  let query = supabase
    .from("monthlytargets")
    .select("staff_id, service_id, month, year, target_value")
    .eq("month", month)
    .eq("year", expectedYear); // CRITICAL: Match both month AND correct year

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

  // Process only targets that match the expected year for this month
  (data || []).forEach(row => {
    // CRITICAL VALIDATION: Ensure target year matches expected year for this month
    const targetExpectedYear = getExpectedYearForMonth(row.month, financialYear);
    
    if (row.year !== targetExpectedYear) {
      // Skip targets from wrong financial year
      console.warn(
        `Skipping target: month=${row.month}, year=${row.year} does not match expected year ${targetExpectedYear} for FY ${financialYear.label}`
      );
      return;
    }

    const sid = row.service_id;
    const val = row.target_value || 0;
    
    if (sid) {
      perService[sid] = (perService[sid] || 0) + val;
      totalTarget += val;
    }
  });

  return { perService, totalTarget };
}

/**
 * Save targets for a specific month and financial year.
 * Enforces strict month-year pairing validation.
 * 
 * @param staffId - Staff ID
 * @param month - Calendar month (1-12)
 * @param financialYear - Financial year object
 * @param serviceTargets - Map of service_id to target_value
 */
export async function saveTargets(
  staffId: number,
  month: number,
  financialYear: FinancialYear,
  serviceTargets: Record<number, number>
) {
  // Calculate the expected calendar year for this month
  const expectedYear = getExpectedYearForMonth(month, financialYear);

  const inserts = Object.entries(serviceTargets).map(([serviceId, targetValue]) => ({
    staff_id: staffId,
    service_id: parseInt(serviceId, 10),
    month,
    year: expectedYear, // CRITICAL: Use calculated year, not arbitrary value
    target_value: targetValue || 0,
  }));

  // Delete existing targets for this staff/month/year combination
  const { error: deleteError } = await supabase
    .from('monthlytargets')
    .delete()
    .eq('staff_id', staffId)
    .eq('month', month)
    .eq('year', expectedYear);

  if (deleteError) {
    console.error('Error deleting old targets:', deleteError);
    throw deleteError;
  }

  // Insert new targets
  const { error: insertError } = await supabase
    .from('monthlytargets')
    .insert(inserts);

  if (insertError) {
    console.error('Error saving targets:', insertError);
    throw insertError;
  }

  return { success: true };
}

/**
 * Validate that a target row belongs to the correct financial year.
 * Used when processing bulk target data.
 */
export function isTargetInFinancialYear(
  targetMonth: number,
  targetYear: number,
  financialYear: FinancialYear
): boolean {
  const expectedYear = getExpectedYearForMonth(targetMonth, financialYear);
  return targetYear === expectedYear;
}