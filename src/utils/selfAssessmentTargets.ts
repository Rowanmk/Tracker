import { supabase } from '../supabase/client';
import type { Database, Json } from '../supabase/types';
import type { FinancialYear } from './financialYear';

export interface SelfAssessmentTargetAuditCorrection {
  staffId: number;
  month: number;
  year: number;
  previousValue: number;
  newValue: number;
  auditCreatedAt: string;
}

type SAAnnualTarget = Pick<
  Database['public']['Tables']['sa_annual_targets']['Row'],
  'staff_id' | 'year' | 'annual_target'
>;

type SADistributionRule = Pick<
  Database['public']['Tables']['sa_distribution_rules']['Row'],
  'months' | 'percentage'
>;

const SELF_ASSESSMENT_SERVICE_NAMES = new Set(['Self Assessments', 'Self Assessment']);

const isJsonObject = (value: Json | null | undefined): value is Record<string, Json | undefined> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isJsonArray = (value: Json | null | undefined): value is Json[] => Array.isArray(value);

const toNumber = (value: Json | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return null;
};

const getSelfAssessmentDeliveryTargetFinancialYearLabel = (financialYear: FinancialYear): string =>
  `${financialYear.end}/${String(financialYear.end + 1).slice(-2)}`;

const normalizeDistributionPercentage = (percentage: number): number => {
  if (!Number.isFinite(percentage) || percentage <= 0) {
    return 0;
  }

  return percentage > 1 ? percentage / 100 : percentage;
};

const pickAnnualTargetForStaff = (
  rows: SAAnnualTarget[],
  staffId: number,
  financialYear: FinancialYear
): SAAnnualTarget | null => {
  const candidates = rows.filter((row) => row.staff_id === staffId);

  if (candidates.length === 0) {
    return null;
  }

  const preferredYears = [
    financialYear.end,
    financialYear.start,
    financialYear.end + 1,
  ];

  return (
    [...candidates].sort((a, b) => {
      const aIndex = preferredYears.indexOf(a.year);
      const bIndex = preferredYears.indexOf(b.year);
      const aWeight = aIndex === -1 ? 999 : aIndex;
      const bWeight = bIndex === -1 ? 999 : bIndex;

      if (aWeight !== bWeight) {
        return aWeight - bWeight;
      }

      return b.year - a.year;
    })[0] || null
  );
};

export const getSelfAssessmentDeliveryYear = (
  month: number,
  financialYear: FinancialYear
): number => (month >= 4 ? financialYear.end : financialYear.end + 1);

export const buildSelfAssessmentTargetAuditCorrectionKey = (
  staffId: number,
  year: number,
  month: number
): string => `${staffId}-${year}-${month}`;

export const loadSelfAssessmentTargetAuditCorrections = async (
  financialYear: FinancialYear
): Promise<Record<string, SelfAssessmentTargetAuditCorrection>> => {
  const expectedFinancialYearLabels = new Set([
    financialYear.label,
    getSelfAssessmentDeliveryTargetFinancialYearLabel(financialYear),
  ]);

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, created_at, metadata')
    .eq('page_path', '/targets')
    .eq('entity_type', 'monthly_targets')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    throw error;
  }

  const corrections: Record<string, SelfAssessmentTargetAuditCorrection> = {};

  (data || []).forEach((log) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return;

    const financialYearLabel =
      typeof metadata.financial_year === 'string' ? metadata.financial_year : '';

    if (!expectedFinancialYearLabels.has(financialYearLabel)) {
      return;
    }

    const affectedUsers = isJsonArray(metadata.affected_users)
      ? metadata.affected_users
      : [];

    affectedUsers.forEach((affectedUser) => {
      const user = isJsonObject(affectedUser) ? affectedUser : null;
      if (!user) return;

      const staffId = toNumber(user.staff_id);
      if (staffId === null) return;

      const changes = isJsonArray(user.changes) ? user.changes : [];

      changes.forEach((changeValue) => {
        const change = isJsonObject(changeValue) ? changeValue : null;
        if (!change) return;

        const serviceName =
          typeof change.service_name === 'string' ? change.service_name : '';

        if (!SELF_ASSESSMENT_SERVICE_NAMES.has(serviceName)) {
          return;
        }

        const month = toNumber(change.month);
        const previousValue = toNumber(change.previous_value);
        const newValue = toNumber(change.new_value);

        if (
          month === null ||
          previousValue === null ||
          newValue === null ||
          month < 1 ||
          month > 12 ||
          previousValue === newValue
        ) {
          return;
        }

        const year = getSelfAssessmentDeliveryYear(month, financialYear);
        const key = buildSelfAssessmentTargetAuditCorrectionKey(staffId, year, month);

        if (corrections[key]) {
          return;
        }

        corrections[key] = {
          staffId,
          month,
          year,
          previousValue,
          newValue,
          auditCreatedAt: log.created_at,
        };
      });
    });
  });

  return corrections;
};

export const loadSelfAssessmentDistributedMonthlyTargets = async (
  financialYear: FinancialYear,
  staffIds: number[]
): Promise<Record<number, Record<number, number>>> => {
  const uniqueStaffIds = Array.from(new Set(staffIds.filter((id) => Number.isFinite(id))));

  if (uniqueStaffIds.length === 0) {
    return {};
  }

  const candidateYears = Array.from(
    new Set([financialYear.start, financialYear.end, financialYear.end + 1])
  );

  const [annualTargetsResult, distributionRulesResult] = await Promise.all([
    supabase
      .from('sa_annual_targets')
      .select('staff_id, year, annual_target')
      .in('staff_id', uniqueStaffIds)
      .in('year', candidateYears),
    supabase
      .from('sa_distribution_rules')
      .select('months, percentage')
      .order('id', { ascending: true }),
  ]);

  if (annualTargetsResult.error) {
    throw annualTargetsResult.error;
  }

  if (distributionRulesResult.error) {
    throw distributionRulesResult.error;
  }

  const annualTargets = (annualTargetsResult.data || []) as SAAnnualTarget[];
  const distributionRules = (distributionRulesResult.data || []) as SADistributionRule[];

  if (annualTargets.length === 0 || distributionRules.length === 0) {
    return {};
  }

  const distributedTargetsFloat: Record<number, Record<number, number>> = {};

  uniqueStaffIds.forEach((staffId) => {
    const annualTargetRow = pickAnnualTargetForStaff(annualTargets, staffId, financialYear);
    const annualTarget = annualTargetRow?.annual_target || 0;

    if (annualTarget <= 0) {
      return;
    }

    distributionRules.forEach((rule) => {
      const months = Array.isArray(rule.months)
        ? rule.months.filter((month) => Number.isFinite(month) && month >= 1 && month <= 12)
        : [];

      if (months.length === 0) {
        return;
      }

      const ruleShare = normalizeDistributionPercentage(rule.percentage);
      if (ruleShare <= 0) {
        return;
      }

      const monthlyShare = (annualTarget * ruleShare) / months.length;

      if (!distributedTargetsFloat[staffId]) {
        distributedTargetsFloat[staffId] = {};
      }

      months.forEach((month) => {
        distributedTargetsFloat[staffId][month] =
          (distributedTargetsFloat[staffId][month] || 0) + monthlyShare;
      });
    });
  });

  const distributedTargets: Record<number, Record<number, number>> = {};

  Object.entries(distributedTargetsFloat).forEach(([staffIdStr, months]) => {
    const staffId = Number(staffIdStr);
    distributedTargets[staffId] = {};

    Object.entries(months).forEach(([monthStr, value]) => {
      distributedTargets[staffId][Number(monthStr)] = Math.round(value);
    });
  });

  return distributedTargets;
};

export const resolveSelfAssessmentOriginalTarget = ({
  currentTarget,
  correction,
  distributedTarget,
  submitted,
}: {
  currentTarget: number;
  correction?: SelfAssessmentTargetAuditCorrection;
  distributedTarget?: number;
  submitted?: number;
}): number => {
  if (correction && currentTarget === correction.newValue && correction.previousValue !== correction.newValue) {
    return correction.previousValue;
  }

  const safeDistributedTarget =
    typeof distributedTarget === 'number' && Number.isFinite(distributedTarget)
      ? Math.max(0, Math.round(distributedTarget))
      : 0;

  const safeSubmitted =
    typeof submitted === 'number' && Number.isFinite(submitted)
      ? Math.max(0, Math.round(submitted))
      : 0;

  if (
    safeDistributedTarget > currentTarget &&
    (currentTarget === 0 || currentTarget <= safeSubmitted)
  ) {
    return safeDistributedTarget;
  }

  return currentTarget;
};