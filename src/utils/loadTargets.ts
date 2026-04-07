import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';
import type { FinancialYear } from './financialYear';

type MonthlyTarget = Database['public']['Tables']['monthlytargets']['Row'];
type ServiceRow = Database['public']['Tables']['services']['Row'];

function getExpectedYearForMonth(month: number, financialYear: FinancialYear): number {
  return month >= 4 ? financialYear.start : financialYear.end;
}

export function isTargetInFinancialYear(month: number, year: number, financialYear: FinancialYear): boolean {
  const expectedYear = getExpectedYearForMonth(month, financialYear);
  return year === expectedYear;
}

let selfAssessmentAliasServiceIdsPromise: Promise<Set<number>> | null = null;

async function getSelfAssessmentAliasServiceIds(): Promise<Set<number>> {
  if (!selfAssessmentAliasServiceIdsPromise) {
    selfAssessmentAliasServiceIdsPromise = (async () => {
      const { data, error } = await supabase
        .from('services')
        .select('service_id, service_name')
        .in('service_name', ['Self Assessment', 'Self Assessments']);

      if (error) {
        throw error;
      }

      return new Set(
        ((data || []) as ServiceRow[])
          .map((service) => service.service_id)
          .filter((serviceId): serviceId is number => typeof serviceId === 'number')
      );
    })();
  }

  return selfAssessmentAliasServiceIdsPromise;
}

export async function loadTargets(
  month: number,
  financialYear: FinancialYear,
  staffId?: number,
  teamId?: number
) {
  const expectedYear = getExpectedYearForMonth(month, financialYear);

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

  const selfAssessmentAliasIds = await getSelfAssessmentAliasServiceIds();

  const perService: Record<number, number> = {};
  let totalTarget = 0;
  let canonicalSelfAssessmentServiceId: number | null = null;

  (data as MonthlyTarget[] || []).forEach((row) => {
    const expected = getExpectedYearForMonth(row.month, financialYear);
    if (row.year !== expected) return;
    if (row.service_id == null) return;

    const val = row.target_value ?? 0;
    const isSelfAssessmentAlias = selfAssessmentAliasIds.has(row.service_id);

    if (isSelfAssessmentAlias) {
      if (canonicalSelfAssessmentServiceId == null) {
        canonicalSelfAssessmentServiceId = row.service_id;
      }

      const normalizedServiceId = canonicalSelfAssessmentServiceId;
      perService[normalizedServiceId] = (perService[normalizedServiceId] || 0) + val;
    } else {
      perService[row.service_id] = (perService[row.service_id] || 0) + val;
    }

    totalTarget += val;
  });

  return { perService, totalTarget };
}