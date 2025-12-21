import { supabase } from '../supabase/client';
import type { FinancialYear } from './financialYear';
import { calculateAllSAMonths, getSADistributionRules, getSAPeriodBoundedActuals } from './saRedistribution';

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

  if (error) throw error;

  const perService: Record<number, number> = {};
  let totalTarget = 0;

  // Get SA service for derived calculations
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .ilike('service_name', '%self assessment%');

  const saService = services?.[0];

  // Process regular targets from database (skip SA service)
  (data || []).forEach(row => {
    const sid = row.service_id;
    const val = row.target_value || 0;
    
    // Skip SA service targets from database - we'll calculate them
    if (saService && sid === saService.service_id) {
      return;
    }
    
    perService[sid] = (perService[sid] || 0) + val;
    totalTarget += val;
  });

  // Calculate derived SA targets if SA service exists
  if (saService) {
    try {
      // Always initialize SA service in perService, even if zero
      perService[saService.service_id] = 0;
      
      if (staffId) {
        // Individual staff - calculate derived SA targets using new pure function
        const { data: annualTargetData } = await supabase
          .from('sa_annual_targets')
          .select('annual_target')
          .eq('staff_id', staffId)
          .eq('year', financialYear.start)
          .single();

        const annualTarget = annualTargetData?.annual_target || 0;
        
        if (annualTarget > 0) {
          // Get distribution rules and period-bounded actuals
          const rules = await getSADistributionRules();
          const actualsByPeriod = await getSAPeriodBoundedActuals(staffId, financialYear);
          
          // Calculate all SA months using pure function
          const allSAMonths = calculateAllSAMonths({
            annualTarget,
            actualsByPeriod,
            overrides: {}, // No overrides for loadTargets - handled in TargetsControl
            distributionRules: rules
          });
          
          const saMonthlyTarget = allSAMonths[month] || 0;
          perService[saService.service_id] = saMonthlyTarget;
          totalTarget += saMonthlyTarget;
        }
      } else {
        // Team view - sum up all staff SA targets for this month
        const { data: allStaff } = await supabase
          .from('staff')
          .select('staff_id')
          .eq('is_hidden', false);

        if (allStaff && allStaff.length > 0) {
          let teamSATarget = 0;
          
          // Process each staff member
          for (const staff of allStaff) {
            try {
              const { data: annualTargetData } = await supabase
                .from('sa_annual_targets')
                .select('annual_target')
                .eq('staff_id', staff.staff_id)
                .eq('year', financialYear.start)
                .single();

              const annualTarget = annualTargetData?.annual_target || 0;
              
              if (annualTarget > 0) {
                // Get distribution rules and period-bounded actuals
                const rules = await getSADistributionRules();
                const actualsByPeriod = await getSAPeriodBoundedActuals(staff.staff_id, financialYear);
                
                // Calculate all SA months using pure function
                const allSAMonths = calculateAllSAMonths({
                  annualTarget,
                  actualsByPeriod,
                  overrides: {}, // No overrides for loadTargets
                  distributionRules: rules
                });
                
                const monthlyTarget = allSAMonths[month] || 0;
                teamSATarget += monthlyTarget;
              }
            } catch (staffError) {
              console.error(`Error calculating SA target for staff ${staff.staff_id}:`, staffError);
              // Continue processing other staff members
            }
          }
          
          perService[saService.service_id] = teamSATarget;
          totalTarget += teamSATarget;
        }
      }
    } catch (saError) {
      console.error('Error calculating SA targets:', saError);
      // Ensure SA service is still initialized even on error
      if (!perService.hasOwnProperty(saService.service_id)) {
        perService[saService.service_id] = 0;
      }
    }
  }

  return { perService, totalTarget };
}