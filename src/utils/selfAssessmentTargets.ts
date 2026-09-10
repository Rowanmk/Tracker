import { supabase } from '../supabase/client';
import type { Json } from '../supabase/types';
import type { FinancialYear } from './financialYear';

export interface SelfAssessmentTargetAuditCorrection {
  staffId: number;
  month: number;
  year: number;
  previousValue: number;
  newValue: number;
  auditCreatedAt: string;
}

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

export const resolveSelfAssessmentOriginalTarget = ({
  currentTarget,
  correction,
}: {
  currentTarget: number;
  correction?: SelfAssessmentTargetAuditCorrection;
}): number => {
  if (!correction) {
    return currentTarget;
  }

  if (currentTarget === correction.newValue && correction.previousValue !== correction.newValue) {
    return correction.previousValue;
  }

  return currentTarget;
};