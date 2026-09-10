import { supabase } from '../supabase/client';
import type { Database, Json } from '../supabase/types';

type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];
type StaffRow = Database['public']['Tables']['staff']['Row'];

interface CreateAuditLogParams {
  pagePath: string;
  pageLabel: string;
  actionType: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  actorStaffId?: number | null;
  teamId?: number | null;
  metadata?: Json;
}

interface TrackerAuditParams {
  actorStaffId?: number | null;
  subjectStaffIds: number[];
  serviceId: number;
  serviceName: string;
  date: string;
  month: number;
  year: number;
  previousTotal: number;
  newTotal: number;
  subjectStaffNames?: string[];
  actorName?: string | null;
}

interface StaffBatchAuditParams {
  actorStaffId?: number | null;
  actorName?: string | null;
  pagePath: string;
  pageLabel: string;
  actionType: string;
  entityType: string;
  description: string;
  affectedStaff: Array<{
    staff_id: number;
    name: string;
    team_id?: number | null;
  }>;
  metadata?: Json;
}

const toSafeJsonObject = (value: Json | undefined): Record<string, Json | undefined> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Json | undefined>;
};

const buildAuditMetadata = (
  actorStaffId: number | null | undefined,
  metadata: Json
): Json => {
  if (actorStaffId !== null && actorStaffId !== undefined) {
    return metadata;
  }

  return {
    ...toSafeJsonObject(metadata),
    system_generated: true,
    updated_by_name: toSafeJsonObject(metadata).updated_by_name || 'System Generated',
  };
};

const getTargetActionType = (previousValue: number, newValue: number): string => {
  if (previousValue === 0 && newValue > 0) return 'create';
  if (previousValue > 0 && newValue === 0) return 'delete';
  return 'update';
};

export async function createAuditLog({
  pagePath,
  pageLabel,
  actionType,
  entityType,
  entityId = null,
  description,
  actorStaffId = null,
  teamId = null,
  metadata = {},
}: CreateAuditLogParams): Promise<void> {
  const payload: AuditLogInsert = {
    page_path: pagePath,
    page_label: pageLabel,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    description,
    staff_id: actorStaffId,
    team_id: teamId,
    metadata: buildAuditMetadata(actorStaffId, metadata),
  };

  await supabase.from('audit_logs').insert(payload);
}

export async function logTrackerSheetUpdate({
  actorStaffId = null,
  subjectStaffIds,
  serviceId,
  serviceName,
  date,
  month,
  year,
  previousTotal,
  newTotal,
  subjectStaffNames = [],
  actorName = null,
}: TrackerAuditParams): Promise<void> {
  const uniqueSubjectIds = Array.from(new Set(subjectStaffIds)).filter((id) => Number.isFinite(id));
  const normalizedSubjectNames = Array.from(new Set(subjectStaffNames.filter(Boolean)));
  const targetScope = uniqueSubjectIds.length > 1 ? 'multiple users' : 'single user';
  const actionType =
    previousTotal === 0 && newTotal > 0
      ? 'create'
      : newTotal === 0
      ? 'delete'
      : 'update';

  const changeAmount = newTotal - previousTotal;
  const targetNamesText =
    normalizedSubjectNames.length > 0 ? normalizedSubjectNames.join(', ') : 'a user';

  await createAuditLog({
    pagePath: '/tracker',
    pageLabel: 'My Tracker',
    actionType,
    entityType: 'tracker_entry',
    entityId: `${serviceId}-${date}-${uniqueSubjectIds.join(',')}`,
    actorStaffId,
    teamId: null,
    description:
      actionType === 'create'
        ? `${actorName || 'A user'} added ${newTotal} ${serviceName} item(s) in My Tracker for ${targetNamesText} on ${date}`
        : actionType === 'delete'
        ? `${actorName || 'A user'} removed ${previousTotal} ${serviceName} item(s) from My Tracker for ${targetNamesText} on ${date}`
        : `${actorName || 'A user'} updated My Tracker for ${targetNamesText} on ${date} (${serviceName}: ${previousTotal} → ${newTotal})`,
    metadata: {
      page: 'My Tracker',
      actor_staff_id: actorStaffId,
      updated_by_name: actorName,
      target_scope: targetScope,
      affected_user_count: uniqueSubjectIds.length,
      affected_user_ids: uniqueSubjectIds,
      affected_user_names: normalizedSubjectNames,
      service_id: serviceId,
      service_name: serviceName,
      affected_services: [serviceName],
      date,
      month,
      year,
      previous_total: previousTotal,
      new_total: newTotal,
      change_amount: changeAmount,
      exact_change:
        actionType === 'create'
          ? `Added ${newTotal} to ${serviceName}`
          : actionType === 'delete'
          ? `Removed ${previousTotal} from ${serviceName}`
          : `Changed ${serviceName} from ${previousTotal} to ${newTotal}`,
    },
  });
}

export async function logMonthlyTargetsSaved({
  actorStaffId = null,
  actorName = null,
  financialYearLabel,
  changedStaffSummaries,
  totalsByStaff,
}: {
  actorStaffId?: number | null;
  actorName?: string | null;
  financialYearLabel: string;
  changedStaffSummaries: Array<{
    staff_id: number;
    name: string;
    team_id?: number | null;
    changed_cells: number;
    changed_months: number[];
    changed_services: string[];
    changes?: Array<{
      month: number;
      service_name: string;
      previous_value: number;
      new_value: number;
    }>;
  }>;
  totalsByStaff: Array<{
    staff_id: number;
    name: string;
    annual_total: number;
  }>;
}): Promise<void> {
  const changedCells = changedStaffSummaries.flatMap((staff) =>
    (staff.changes || []).map((change) => ({
      staff,
      change,
    }))
  );

  if (changedCells.length === 0) {
    return;
  }

  await Promise.all(
    changedCells.map(({ staff, change }) => {
      const actionType = getTargetActionType(change.previous_value, change.new_value);
      const staffAnnualTotal =
        totalsByStaff.find((total) => total.staff_id === staff.staff_id)?.annual_total ?? 0;

      return createAuditLog({
        pagePath: '/targets',
        pageLabel: 'Targets Control',
        actionType,
        entityType: 'monthly_targets',
        entityId: `${financialYearLabel}-${staff.staff_id}-${change.service_name}-${change.month}`,
        actorStaffId,
        teamId: staff.team_id || null,
        description: `${actorName || 'A user'} changed ${staff.name}'s ${change.service_name} target for month ${change.month} in FY ${financialYearLabel} (${change.previous_value} → ${change.new_value})`,
        metadata: {
          actor_staff_id: actorStaffId,
          updated_by_name: actorName,
          financial_year: financialYearLabel,
          affected_user_count: 1,
          affected_user_ids: [staff.staff_id],
          affected_user_names: [staff.name],
          affected_services: [change.service_name],
          affected_service_names: [change.service_name],
          service_name: change.service_name,
          month: change.month,
          previous_value: change.previous_value,
          new_value: change.new_value,
          change_amount: change.new_value - change.previous_value,
          exact_change: `${staff.name} — ${change.service_name} month ${change.month}: ${change.previous_value} → ${change.new_value}`,
          affected_users: [
            {
              staff_id: staff.staff_id,
              name: staff.name,
              team_id: staff.team_id || null,
              changed_cells: 1,
              changed_months: [change.month],
              changed_services: [change.service_name],
              changes: [
                {
                  month: change.month,
                  service_name: change.service_name,
                  previous_value: change.previous_value,
                  new_value: change.new_value,
                },
              ],
            },
          ],
          totals_by_user: [
            {
              staff_id: staff.staff_id,
              name: staff.name,
              annual_total: staffAnnualTotal,
            },
          ],
        },
      });
    })
  );
}

export async function logStaffBatchChange({
  actorStaffId = null,
  actorName = null,
  pagePath,
  pageLabel,
  actionType,
  entityType,
  description,
  affectedStaff,
  metadata = {},
}: StaffBatchAuditParams): Promise<void> {
  await createAuditLog({
    pagePath,
    pageLabel,
    actionType,
    entityType,
    entityId: affectedStaff.map((staff) => staff.staff_id).join(','),
    actorStaffId,
    teamId: affectedStaff.length === 1 ? affectedStaff[0].team_id || null : null,
    description,
    metadata: {
      ...toSafeJsonObject(metadata),
      actor_staff_id: actorStaffId,
      affected_user_count: affectedStaff.length,
      affected_user_ids: affectedStaff.map((staff) => staff.staff_id),
      affected_user_names: affectedStaff.map((staff) => staff.name),
      updated_by_name: actorName,
    },
  });
}

export async function getActorNamesForLogs(staffIds: Array<number | null | undefined>) {
  const uniqueIds = Array.from(new Set(staffIds.filter((id): id is number => typeof id === 'number')));

  if (uniqueIds.length === 0) {
    return new Map<number, StaffRow>();
  }

  const { data } = await supabase
    .from('staff')
    .select('*')
    .in('staff_id', uniqueIds);

  return new Map((data || []).map((staff) => [staff.staff_id, staff]));
}