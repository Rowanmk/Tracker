import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type SADistributionRule = Database['public']['Tables']['sa_distribution_rules']['Row'];

// Stable apportionment method to distribute integers without rounding drift
function distributeIntegerTarget(total: number, slots: number): number[] {
  if (slots <= 0) return [];
  
  const baseAmount = Math.floor(total / slots);
  const remainder = total - (baseAmount * slots);
  
  const result = new Array(slots).fill(baseAmount);
  
  // Distribute remainder evenly across first 'remainder' slots
  for (let i = 0; i < remainder; i++) {
    result[i]++;
  }
  
  return result;
}

// Calculate period-bounded actual delivery values
async function calculatePeriodBoundedActuals(
  staffId: number,
  financialYear: FinancialYear,
  distributionRules: SADistributionRule[]
): Promise<Record<string, number>> {
  try {
    // Get SA service
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .ilike('service_name', '%self assessment%');

    const saService = services?.[0];
    if (!saService) {
      return {};
    }

    // Get all SA activities for the financial year
    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('delivered_count, date, month, year')
      .eq('staff_id', staffId)
      .eq('service_id', saService.service_id)
      .gte('date', `${financialYear.start}-04-01`)
      .lte('date', `${financialYear.end}-03-31`);

    if (!activities) {
      return {};
    }

    // Define period boundaries
    const periodBoundaries = {
      'Period 1': { endMonth: 7, endDay: 31 }, // 31 July
      'Period 2': { endMonth: 11, endDay: 30 }, // 30 November  
      'Period 3a': { endMonth: 12, endDay: 31 }, // 31 December
      'Period 3b': { endMonth: 1, endDay: 31 }, // 31 January
    };

    const actualsByPeriod: Record<string, number> = {};

    // Calculate actuals for each period up to its boundary
    for (const rule of distributionRules) {
      const boundary = periodBoundaries[rule.period_name as keyof typeof periodBoundaries];
      if (!boundary) continue;

      let periodActuals = 0;

      for (const activity of activities) {
        const activityDate = new Date(activity.date);
        const activityMonth = activityDate.getMonth() + 1;
        const activityDay = activityDate.getDate();
        const activityYear = activityDate.getFullYear();

        // Determine if activity falls within this period's boundary
        let withinBoundary = false;

        if (boundary.endMonth >= 4) {
          // Period ends in same calendar year as start (Apr-Dec)
          withinBoundary = (
            activityYear === financialYear.start &&
            (activityMonth < boundary.endMonth || 
             (activityMonth === boundary.endMonth && activityDay <= boundary.endDay))
          );
        } else {
          // Period ends in next calendar year (Jan-Mar)
          withinBoundary = (
            (activityYear === financialYear.start) ||
            (activityYear === financialYear.end && 
             (activityMonth < boundary.endMonth || 
              (activityMonth === boundary.endMonth && activityDay <= boundary.endDay)))
          );
        }

        if (withinBoundary) {
          periodActuals += activity.delivered_count;
        }
      }

      actualsByPeriod[rule.period_name] = periodActuals;
    }

    return actualsByPeriod;
  } catch (err) {
    console.error('Error calculating period-bounded actuals:', err);
    return {};
  }
}

// Helper function to compare months in FY order
function getMonthIndexInFYOrder(month: number): number {
  const orderedMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  return orderedMonths.indexOf(month);
}

// FIXED: Determine if a month is current or future based on today's date
const isCurrentOrFutureMonth = (month: number, selectedFinancialYear: FinancialYear) => {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();
  
  // Determine which year this month falls in within the financial year
  const monthYear = month >= 4 ? selectedFinancialYear.start : selectedFinancialYear.end;
  
  // If the month's year is in the future, it's a future month
  if (monthYear > currentYear) {
    return true;
  }
  
  // If the month's year is in the past, it's a past month
  if (monthYear < currentYear) {
    return false;
  }
  
  // Same year - compare months
  return month >= currentMonth;
};

// PURE FUNCTION: Calculate all 12 SA monthly targets at once - NO LOCK BOUNDARY
export function calculateAllSAMonths({
  annualTarget,
  actualsByPeriod,
  overrides,
  distributionRules
}: {
  annualTarget: number;
  actualsByPeriod: Record<string, number>;
  overrides: Record<number, number>;
  distributionRules: SADistributionRule[];
}): Record<number, number> {
  const result: Record<number, number> = {};
  
  // Initialize all months
  for (let month = 1; month <= 12; month++) {
    result[month] = 0;
  }
  
  // Enforce February (2) and March (3) ALWAYS = 0
  result[2] = 0;
  result[3] = 0;
  
  // If no annual target or rules, return all zeros
  if (annualTarget <= 0 || !distributionRules || distributionRules.length === 0) {
    return result;
  }
  
  // Apply overrides first
  Object.entries(overrides).forEach(([monthStr, value]) => {
    const month = parseInt(monthStr);
    if (month >= 1 && month <= 12) {
      result[month] = value;
    }
  });
  
  // Calculate remaining target after overrides
  let remainingTarget = annualTarget;
  Object.values(overrides).forEach(value => {
    remainingTarget -= value;
  });
  remainingTarget = Math.max(0, remainingTarget);
  
  // Process each period in order
  const periodOrder = ['Period 1', 'Period 2', 'Period 3a', 'Period 3b'];
  let cumulativeExpected = 0;
  let cumulativeActual = 0;
  
  for (const periodName of periodOrder) {
    const period = distributionRules.find(r => r.period_name === periodName);
    if (!period) continue;
    
    // Calculate shortfall from previous periods
    const shortfall = Math.max(0, cumulativeExpected - cumulativeActual);
    
    // Calculate base period allocation
    const basePeriodTotal = Math.round(annualTarget * (period.percentage / 100));
    
    // Add shortfall to current period
    const adjustedPeriodTotal = basePeriodTotal + Math.round(shortfall);
    
    // Get months in this period (excluding Feb/Mar and overridden months)
    const monthsInPeriod = period.months.filter(m => {
      return m !== 2 && m !== 3 && !overrides.hasOwnProperty(m);
    }).sort((a, b) => a - b);
    
    if (monthsInPeriod.length > 0) {
      // Distribute across available months using stable apportionment
      const monthlyAllocations = distributeIntegerTarget(adjustedPeriodTotal, monthsInPeriod.length);
      
      monthsInPeriod.forEach((month, index) => {
        result[month] = monthlyAllocations[index];
      });
    }
    
    // Update cumulative tracking
    cumulativeExpected += basePeriodTotal;
    cumulativeActual += actualsByPeriod[periodName] || 0;
  }
  
  // Guarantee sum(months) === annualTarget by adjusting the last non-zero, non-override month
  const currentSum = Object.values(result).reduce((sum, val) => sum + val, 0);
  const difference = annualTarget - currentSum;
  
  if (Math.abs(difference) > 0) {
    // Find last non-zero, non-override month to adjust
    const adjustableMonths = [12, 11, 10, 9, 8, 7, 6, 5, 4, 1].filter(m => {
      return result[m] > 0 && !overrides.hasOwnProperty(m);
    });
    
    if (adjustableMonths.length > 0) {
      const adjustMonth = adjustableMonths[0];
      result[adjustMonth] = Math.max(0, result[adjustMonth] + difference);
    }
  }
  
  return result;
}

// Legacy function - DEPRECATED, use calculateAllSAMonths instead
export function calculateSAMonthTarget(
  month: number,
  annualTarget: number,
  actualDeliveredToDate: number, // This parameter is ignored as required
  distributionRules: SADistributionRule[],
  actualDeliveredByPeriod?: Record<string, number>
): number {
  // Enforce Feb/Mar always zero
  if (month === 2 || month === 3) {
    return 0;
  }

  // If no distribution rules, return 0
  if (!distributionRules || distributionRules.length === 0) {
    return 0;
  }

  // Find which period this month belongs to
  const currentPeriod = distributionRules.find(rule => rule.months.includes(month));
  if (!currentPeriod) {
    return 0;
  }

  if (annualTarget <= 0) {
    return 0;
  }

  // If no period actuals provided, return baseline distribution
  if (!actualDeliveredByPeriod) {
    const periodTotal = Math.round(annualTarget * (currentPeriod.percentage / 100));
    const monthsInPeriod = currentPeriod.months.filter(m => m !== 2 && m !== 3).sort((a, b) => a - b);
    if (monthsInPeriod.length === 0) return 0;
    
    const monthlyAllocations = distributeIntegerTarget(periodTotal, monthsInPeriod.length);
    const monthIndex = monthsInPeriod.indexOf(month);
    return monthIndex >= 0 ? monthlyAllocations[monthIndex] : 0;
  }

  // Determine previous period
  const periodOrder = ['Period 1', 'Period 2', 'Period 3a', 'Period 3b'];
  const currentPeriodIndex = periodOrder.indexOf(currentPeriod.period_name);
  
  let actualByEndOfPreviousPeriod = 0;
  let expectedByEndOfPreviousPeriod = 0;

  if (currentPeriodIndex > 0) {
    // Calculate expected delivery up to end of previous period
    for (let i = 0; i < currentPeriodIndex; i++) {
      const prevPeriod = distributionRules.find(r => r.period_name === periodOrder[i]);
      if (prevPeriod) {
        expectedByEndOfPreviousPeriod += annualTarget * (prevPeriod.percentage / 100);
        actualByEndOfPreviousPeriod += actualDeliveredByPeriod[prevPeriod.period_name] || 0;
      }
    }
  }

  // Calculate shortfall from previous periods
  const shortfall = Math.max(0, expectedByEndOfPreviousPeriod - actualByEndOfPreviousPeriod);

  // Calculate base period total
  const basePeriodTotal = Math.round(annualTarget * (currentPeriod.percentage / 100));
  
  // Add shortfall to current period
  const adjustedPeriodTotal = basePeriodTotal + Math.round(shortfall);

  // Distribute across months in period using stable apportionment, excluding Feb/Mar
  const monthsInPeriod = currentPeriod.months.filter(m => m !== 2 && m !== 3).sort((a, b) => a - b);
  if (monthsInPeriod.length === 0) return 0;
  
  const monthlyAllocations = distributeIntegerTarget(adjustedPeriodTotal, monthsInPeriod.length);
  
  const monthIndex = monthsInPeriod.indexOf(month);
  return monthIndex >= 0 ? monthlyAllocations[monthIndex] : 0;
}

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

    if (error) {
      console.error('Error fetching SA distribution rules:', error);
      return defaultRules.map((rule, index) => ({
        ...rule,
        id: index + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    if (!data || data.length === 0) {
      return defaultRules.map((rule, index) => ({
        ...rule,
        id: index + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    return data;
  } catch (err) {
    console.error('Error in getSADistributionRules:', err);
    return defaultRules.map((rule, index) => ({
      ...rule,
      id: index + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }
}

export async function getSAActualDelivered(
  staffId: number,
  financialYear: FinancialYear
): Promise<number> {
  try {
    // Get SA service
    const { data: services } = await supabase
      .from('services')
      .select('*')
      .ilike('service_name', '%self assessment%');

    const saService = services?.[0];
    if (!saService) {
      return 0;
    }

    // Get actual delivered to date
    const { data: activities } = await supabase
      .from('dailyactivity')
      .select('delivered_count')
      .eq('staff_id', staffId)
      .eq('service_id', saService.service_id)
      .gte('date', `${financialYear.start}-04-01`)
      .lte('date', new Date().toISOString().split('T')[0]);

    return activities?.reduce(
      (sum, activity) => sum + activity.delivered_count,
      0
    ) || 0;
  } catch (err) {
    console.error('Error getting SA actual delivered:', err);
    return 0;
  }
}

// New function to get period-bounded actuals for SA target calculation
export async function getSAPeriodBoundedActuals(
  staffId: number,
  financialYear: FinancialYear
): Promise<Record<string, number>> {
  const rules = await getSADistributionRules();
  return calculatePeriodBoundedActuals(staffId, financialYear, rules);
}

// Export the isCurrentOrFutureMonth function for use in other components
export { isCurrentOrFutureMonth };