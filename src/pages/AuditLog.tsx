import React, { useEffect, useMemo, useState } from 'react';
import { unparse } from 'papaparse';
import { supabase } from '../supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Database, Json } from '../supabase/types';
import { getActorNamesForLogs } from '../utils/auditLog';

type AuditLogRow = Database['public']['Tables']['audit_logs']['Row'];
type Staff = Database['public']['Tables']['staff']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];

type AuditLogWithRelations = AuditLogRow & {
  staff?: Pick<Staff, 'staff_id' | 'name' | 'team_id'> | null;
  team?: Pick<Team, 'id' | 'name'> | null;
};

type SortField = 'created_at' | 'page_label' | 'action_type' | 'entity_type' | 'service' | 'actor' | 'affected' | 'description';
type SortDirection = 'asc' | 'desc';

const PAGE_OPTIONS = [
  { value: 'all', label: 'All pages' },
  { value: '/', label: 'Dashboard' },
  { value: '/tracker', label: 'My Tracker' },
  { value: '/sa-progress', label: 'Self Assessment Progress' },
  { value: '/team', label: 'Stats and Figures' },
  { value: '/annual', label: 'Annual Summary' },
  { value: '/targets', label: 'Targets Control' },
  { value: '/settings', label: 'Settings' },
  { value: '/audit-log', label: 'Audit Log' },
  { value: '/login', label: 'Login' },
  { value: '/forgot-password', label: 'Forgot Password' },
];

const AUDIT_EXPORT_PAGE_SIZE = 1000;
const SYSTEM_ACTOR_FILTER = '__system_generated__';

const isJsonObject = (value: Json | null): value is Record<string, Json | undefined> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isJsonArray = (value: Json | undefined): value is Json[] => Array.isArray(value);

const sanitizeCsvCell = (value: unknown): string | number => {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return '';

  const stringValue = String(value);
  return /^[=+\-@\t\r]/.test(stringValue) ? `'${stringValue}` : stringValue;
};

const formatJsonValue = (value: Json | undefined): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const uniqueSortedStrings = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

const getStringArrayFromJson = (value: Json | undefined): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
};

const getEffectiveActorId = (log: AuditLogWithRelations): number | null => {
  const metadata = isJsonObject(log.metadata) ? log.metadata : null;
  return typeof metadata?.actor_staff_id === 'number' ? metadata.actor_staff_id : log.staff_id;
};

const isSystemGeneratedLog = (log: AuditLogWithRelations): boolean => {
  const metadata = isJsonObject(log.metadata) ? log.metadata : null;
  const effectiveActorId = getEffectiveActorId(log);

  if (metadata?.system_generated === true) return true;
  if (typeof metadata?.source === 'string' && metadata.source.trim() !== '') return true;
  if (metadata?.updated_by_name === 'System Generated') return true;

  return effectiveActorId === null && !log.staff?.name;
};

const getAffectedUserNamesFromLog = (log: AuditLogWithRelations): string[] => {
  const metadata = isJsonObject(log.metadata) ? log.metadata : null;
  const affectedUserNames = Array.isArray(metadata?.affected_user_names)
    ? metadata.affected_user_names.filter((value): value is string => typeof value === 'string')
    : [];

  return affectedUserNames;
};

const getAffectedUserIdsFromLog = (log: AuditLogWithRelations): number[] => {
  const metadata = isJsonObject(log.metadata) ? log.metadata : null;
  const affectedUserIds = Array.isArray(metadata?.affected_user_ids)
    ? metadata.affected_user_ids.filter((value): value is number => typeof value === 'number')
    : [];

  return affectedUserIds;
};

const getAffectedServiceNamesFromLog = (log: AuditLogWithRelations): string[] => {
  const metadata = isJsonObject(log.metadata) ? log.metadata : null;
  if (!metadata) return [];

  const serviceNames: string[] = [];

  if (typeof metadata.service_name === 'string') {
    serviceNames.push(metadata.service_name);
  }

  serviceNames.push(...getStringArrayFromJson(metadata.affected_services));
  serviceNames.push(...getStringArrayFromJson(metadata.affected_service_names));

  const affectedUsers = isJsonArray(metadata.affected_users)
    ? metadata.affected_users.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];

  affectedUsers.forEach((user) => {
    serviceNames.push(...getStringArrayFromJson(user.changed_services));

    const changes = isJsonArray(user.changes)
      ? user.changes.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    changes.forEach((change) => {
      if (typeof change.service_name === 'string') {
        serviceNames.push(change.service_name);
      }
    });
  });

  const restoredCells = isJsonArray(metadata.restored_cells)
    ? metadata.restored_cells.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];

  restoredCells.forEach((cell) => {
    if (typeof cell.service_name === 'string') {
      serviceNames.push(cell.service_name);
    }
  });

  return uniqueSortedStrings(serviceNames);
};

const formatFileTimestamp = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
};

export const AuditLog: React.FC = () => {
  const { isAdmin, allStaff } = useAuth();

  const [logs, setLogs] = useState<AuditLogWithRelations[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [actorNames, setActorNames] = useState<Map<number, Staff>>(new Map());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [pageFilter, setPageFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [affectedFilter, setAffectedFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const fetchAuditData = async () => {
    setLoading(true);
    setError(null);
    setExportMessage(null);

    try {
      const [logsResult, teamsResult] = await Promise.all([
        supabase
          .from('audit_logs')
          .select('*, staff:staff_id (staff_id, name, team_id), team:team_id (id, name)')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('teams').select('*').order('name'),
      ]);

      if (logsResult.error) {
        setError('Failed to load audit log');
        setLogs([]);
      } else {
        const nextLogs = ((logsResult.data as AuditLogWithRelations[]) || []).sort((a, b) => {
          const timeA = new Date(a.created_at || '').getTime();
          const timeB = new Date(b.created_at || '').getTime();
          return timeB - timeA;
        });

        setLogs(nextLogs);

        const actors = await getActorNamesForLogs(nextLogs.map(getEffectiveActorId));
        setActorNames(actors);
      }

      if (!teamsResult.error) {
        setTeams(teamsResult.data || []);
      }
    } catch {
      setError('Failed to connect to database');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntireAuditTrail = async (): Promise<AuditLogWithRelations[]> => {
    const allRows: AuditLogWithRelations[] = [];
    let from = 0;

    while (true) {
      const { data, error: fetchError } = await supabase
        .from('audit_logs')
        .select('*, staff:staff_id (staff_id, name, team_id), team:team_id (id, name)')
        .order('created_at', { ascending: false })
        .range(from, from + AUDIT_EXPORT_PAGE_SIZE - 1);

      if (fetchError) {
        throw fetchError;
      }

      const pageRows = (data as AuditLogWithRelations[] | null) || [];
      allRows.push(...pageRows);

      if (pageRows.length < AUDIT_EXPORT_PAGE_SIZE) {
        break;
      }

      from += AUDIT_EXPORT_PAGE_SIZE;
    }

    return allRows;
  };

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    fetchAuditData();
  }, [isAdmin]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return { date: 'Unknown', time: 'Unknown' };
    const date = new Date(value);
    return {
      date: date.toLocaleDateString('en-GB'),
      time: date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };
  };

  const getTeamName = (log: AuditLogWithRelations) => {
    if (log.team?.name) return log.team.name;
    if (log.staff?.team_id) {
      return teams.find(team => team.id === log.staff?.team_id)?.name || 'Unknown';
    }
    return 'Unassigned';
  };

  const getActorLabelFromMap = (log: AuditLogWithRelations, actorMap: Map<number, Staff>) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    const explicitActorId = typeof metadata?.actor_staff_id === 'number' ? metadata.actor_staff_id : null;
    const explicitActorName = typeof metadata?.updated_by_name === 'string' ? metadata.updated_by_name : null;

    if (explicitActorName) return explicitActorName;
    if (explicitActorId && actorMap.get(explicitActorId)?.name) {
      return actorMap.get(explicitActorId)?.name || 'Unknown';
    }
    if (log.staff?.name) return log.staff.name;
    if (isSystemGeneratedLog(log)) return 'System Generated';
    return 'Unknown';
  };

  const getActorLabel = (log: AuditLogWithRelations) => getActorLabelFromMap(log, actorNames);

  const getAffectedUserNames = (log: AuditLogWithRelations) => getAffectedUserNamesFromLog(log);

  const buildMetadataSummaryParts = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return [];

    const parts: string[] = [];

    if (typeof metadata.service_name === 'string' && typeof metadata.date === 'string') {
      parts.push(`${metadata.service_name} on ${metadata.date}`);
    }

    if (typeof metadata.previous_total === 'number' && typeof metadata.new_total === 'number') {
      parts.push(`${metadata.previous_total} → ${metadata.new_total}`);
    }

    if (typeof metadata.financial_year === 'string') {
      parts.push(`FY ${metadata.financial_year}`);
    }

    const affectedServices = getAffectedServiceNamesFromLog(log);
    if (affectedServices.length > 0) {
      parts.push(`Service: ${affectedServices.join(', ')}`);
    }

    if (typeof metadata.restored_cell_count === 'number') {
      parts.push(`${metadata.restored_cell_count} restored cell(s)`);
    }

    if (typeof metadata.affected_user_count === 'number') {
      parts.push(`${metadata.affected_user_count} user(s)`);
    }

    if (typeof metadata.exact_change === 'string') {
      parts.push(metadata.exact_change);
    }

    if (typeof metadata.source === 'string') {
      parts.push(`Source: ${metadata.source.replace(/_/g, ' ')}`);
    }

    const teamName = getTeamName(log);
    if (teamName && teamName !== 'Unassigned') {
      parts.push(teamName);
    }

    return parts;
  };

  const buildExactChangesText = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return '';

    const affectedUsers = isJsonArray(metadata.affected_users)
      ? metadata.affected_users.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    if (affectedUsers.length > 0) {
      return affectedUsers.map((user, index) => {
        const userName = typeof user.name === 'string' ? user.name : `User ${index + 1}`;
        const changes = isJsonArray(user.changes)
          ? user.changes.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
          : [];

        if (changes.length > 0) {
          const changeText = changes.map((change) => {
            const month = typeof change.month === 'number' ? change.month : null;
            const serviceName = typeof change.service_name === 'string' ? change.service_name : 'Service';
            const previousValue = typeof change.previous_value === 'number' ? change.previous_value : 0;
            const newValue = typeof change.new_value === 'number' ? change.new_value : 0;

            return `${serviceName}${month ? ` (month ${month})` : ''}: ${previousValue} → ${newValue}`;
          }).join('; ');

          return `${userName}: ${changeText}`;
        }

        return `${userName}: ${typeof user.changed_cells === 'number' ? `${user.changed_cells} field(s) changed` : 'Updated'}`;
      }).join(' | ');
    }

    const restoredCells = isJsonArray(metadata.restored_cells)
      ? metadata.restored_cells.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    if (restoredCells.length > 0) {
      return restoredCells.map((cell) => {
        const staffName = typeof cell.staff_name === 'string' ? cell.staff_name : 'User';
        const serviceName = typeof cell.service_name === 'string' ? cell.service_name : 'Service';
        const month = typeof cell.month === 'number' ? cell.month : null;
        const year = typeof cell.year === 'number' ? cell.year : null;
        const overwritten = formatJsonValue(cell.overwritten_value);
        const restored = formatJsonValue(cell.restored_value);

        return `${staffName}: ${serviceName}${month ? ` (month ${month}` : ''}${year ? `, ${year}` : ''}${month ? ')' : ''}: ${overwritten} → ${restored}`;
      }).join(' | ');
    }

    const previous = isJsonObject(metadata.previous) ? metadata.previous : null;
    const current = isJsonObject(metadata.current) ? metadata.current : null;

    if (previous || current) {
      const keys = Array.from(new Set([
        ...Object.keys(previous || {}),
        ...Object.keys(current || {}),
      ])).filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(current?.[key]));

      return keys.map((key) => {
        return `${key.replace(/_/g, ' ')}: ${formatJsonValue(previous?.[key])} → ${formatJsonValue(current?.[key])}`;
      }).join('; ');
    }

    return '';
  };

  const renderAffectedUsers = (log: AuditLogWithRelations) => {
    const affectedUserNames = getAffectedUserNames(log);

    if (affectedUserNames.length === 0) {
      return <span className="text-sm text-gray-400">—</span>;
    }

    return (
      <div className="text-sm text-gray-900 dark:text-white">
        {affectedUserNames.length > 3
          ? `${affectedUserNames.slice(0, 3).join(', ')} +${affectedUserNames.length - 3} more`
          : affectedUserNames.join(', ')}
      </div>
    );
  };

  const renderAffectedServices = (log: AuditLogWithRelations) => {
    const services = getAffectedServiceNamesFromLog(log);

    if (services.length === 0) {
      return <span className="text-sm text-gray-400">—</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {services.slice(0, 3).map((service) => (
          <span
            key={service}
            className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs font-semibold"
          >
            {service}
          </span>
        ))}
        {services.length > 3 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs font-semibold">
            +{services.length - 3} more
          </span>
        )}
      </div>
    );
  };

  const renderMetadataSummary = (log: AuditLogWithRelations) => {
    const parts = buildMetadataSummaryParts(log);

    if (parts.length === 0) return null;

    return <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{parts.join(' • ')}</div>;
  };

  const renderExactChanges = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return null;

    const affectedUsers = isJsonArray(metadata.affected_users)
      ? metadata.affected_users.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    if (affectedUsers.length > 0) {
      return (
        <div className="space-y-2">
          {affectedUsers.slice(0, 3).map((user, index) => {
            const userName = typeof user.name === 'string' ? user.name : `User ${index + 1}`;
            const changes = isJsonArray(user.changes)
              ? user.changes.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
              : [];

            return (
              <div key={`${userName}-${index}`} className="rounded-md bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 px-3 py-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">{userName}</div>
                {changes.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {changes.slice(0, 2).map((change, changeIndex) => {
                      const month = typeof change.month === 'number' ? change.month : null;
                      const serviceName = typeof change.service_name === 'string' ? change.service_name : 'Service';
                      const previousValue = typeof change.previous_value === 'number' ? change.previous_value : 0;
                      const newValue = typeof change.new_value === 'number' ? change.new_value : 0;

                      return (
                        <div key={`${serviceName}-${changeIndex}`} className="text-xs text-gray-600 dark:text-gray-300">
                          {serviceName}{month ? ` (month ${month})` : ''}: {previousValue} → {newValue}
                        </div>
                      );
                    })}
                    {changes.length > 2 && (
                      <div className="text-xs text-gray-400">
                        +{changes.length - 2} more change(s)
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {typeof user.changed_cells === 'number' ? `${user.changed_cells} field(s) changed` : 'Updated'}
                  </div>
                )}
              </div>
            );
          })}
          {affectedUsers.length > 3 && (
            <div className="text-xs text-gray-400">
              +{affectedUsers.length - 3} more user(s)
            </div>
          )}
        </div>
      );
    }

    const restoredCells = isJsonArray(metadata.restored_cells)
      ? metadata.restored_cells.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    if (restoredCells.length > 0) {
      return (
        <div className="space-y-2">
          {restoredCells.slice(0, 4).map((cell, index) => {
            const staffName = typeof cell.staff_name === 'string' ? cell.staff_name : `User ${index + 1}`;
            const serviceName = typeof cell.service_name === 'string' ? cell.service_name : 'Service';
            const month = typeof cell.month === 'number' ? cell.month : null;
            const year = typeof cell.year === 'number' ? cell.year : null;

            return (
              <div key={`${staffName}-${serviceName}-${index}`} className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-3 py-2">
                <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                  {staffName}
                </div>
                <div className="mt-1 text-xs text-blue-800 dark:text-blue-300">
                  {serviceName}{month ? ` (month ${month})` : ''}{year ? `, ${year}` : ''}:{' '}
                  {formatJsonValue(cell.overwritten_value)} → {formatJsonValue(cell.restored_value)}
                </div>
              </div>
            );
          })}
          {restoredCells.length > 4 && (
            <div className="text-xs text-gray-400">
              +{restoredCells.length - 4} more restored cell(s)
            </div>
          )}
        </div>
      );
    }

    const previous = isJsonObject(metadata.previous) ? metadata.previous : null;
    const current = isJsonObject(metadata.current) ? metadata.current : null;

    if (previous || current) {
      const keys = Array.from(new Set([
        ...Object.keys(previous || {}),
        ...Object.keys(current || {}),
      ])).filter((key) => JSON.stringify(previous?.[key]) !== JSON.stringify(current?.[key]));

      if (keys.length === 0) {
        return null;
      }

      return (
        <div className="rounded-md bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 px-3 py-2">
          {keys.slice(0, 4).map((key) => (
            <div key={key} className="text-xs text-gray-600 dark:text-gray-300">
              <span className="font-semibold text-gray-700 dark:text-gray-200">{key.replace(/_/g, ' ')}:</span>{' '}
              {String(previous?.[key] ?? '—')} → {String(current?.[key] ?? '—')}
            </div>
          ))}
          {keys.length > 4 && (
            <div className="text-xs text-gray-400 mt-1">
              +{keys.length - 4} more field change(s)
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const handleExportEntireAuditTrail = async () => {
    setExporting(true);
    setExportMessage(null);

    try {
      const allAuditLogs = await fetchEntireAuditTrail();
      const exportActorNames = await getActorNamesForLogs(allAuditLogs.map(getEffectiveActorId));

      const rows = allAuditLogs.map((log) => {
        const { date, time } = formatDateTime(log.created_at);
        const metadata = isJsonObject(log.metadata) ? log.metadata : null;
        const actorId = getEffectiveActorId(log);
        const affectedUserIds = getAffectedUserIdsFromLog(log);
        const affectedUserNames = getAffectedUserNamesFromLog(log);
        const affectedServiceNames = getAffectedServiceNamesFromLog(log);

        return {
          id: sanitizeCsvCell(log.id),
          created_at: sanitizeCsvCell(log.created_at),
          date: sanitizeCsvCell(date),
          time: sanitizeCsvCell(time),
          page_path: sanitizeCsvCell(log.page_path),
          page_label: sanitizeCsvCell(log.page_label),
          action_type: sanitizeCsvCell(log.action_type),
          entity_type: sanitizeCsvCell(log.entity_type),
          entity_id: sanitizeCsvCell(log.entity_id),
          affected_services: sanitizeCsvCell(affectedServiceNames.join(', ')),
          actor_staff_id: sanitizeCsvCell(actorId),
          actor_name: sanitizeCsvCell(getActorLabelFromMap(log, exportActorNames)),
          system_generated: sanitizeCsvCell(isSystemGeneratedLog(log) ? 'Yes' : 'No'),
          affected_user_ids: sanitizeCsvCell(affectedUserIds.join(', ')),
          affected_user_names: sanitizeCsvCell(affectedUserNames.join(', ')),
          team_id: sanitizeCsvCell(log.team_id),
          team_name: sanitizeCsvCell(getTeamName(log)),
          description: sanitizeCsvCell(log.description),
          metadata_summary: sanitizeCsvCell(buildMetadataSummaryParts(log).join(' • ')),
          exact_changes: sanitizeCsvCell(buildExactChangesText(log)),
          metadata_json: sanitizeCsvCell(metadata ? JSON.stringify(metadata) : ''),
        };
      });

      const fields = [
        'id',
        'created_at',
        'date',
        'time',
        'page_path',
        'page_label',
        'action_type',
        'entity_type',
        'entity_id',
        'affected_services',
        'actor_staff_id',
        'actor_name',
        'system_generated',
        'affected_user_ids',
        'affected_user_names',
        'team_id',
        'team_name',
        'description',
        'metadata_summary',
        'exact_changes',
        'metadata_json',
      ];

      const csvBody = unparse({ fields, data: rows });
      const now = new Date();
      const csv = `"Crew Tracker Audit Trail Export"\n"Generated ${now.toLocaleString('en-GB')}"\n"Records ${rows.length}"\n${csvBody}`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `audit_trail_export_${formatFileTimestamp(now)}.csv`;
      anchor.click();

      window.URL.revokeObjectURL(url);
      setExportMessage({
        type: 'success',
        message: `Exported ${rows.length} audit trail record${rows.length === 1 ? '' : 's'}.`,
      });
    } catch {
      setExportMessage({
        type: 'error',
        message: 'Failed to export the audit trail. Please refresh and try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  const actionOptions = useMemo(() => {
    return Array.from(new Set(logs.map(log => log.action_type).filter(Boolean))).sort();
  }, [logs]);

  const entityOptions = useMemo(() => {
    return Array.from(new Set(logs.map(log => log.entity_type).filter(Boolean))).sort();
  }, [logs]);

  const serviceOptions = useMemo(() => {
    return uniqueSortedStrings(logs.flatMap(getAffectedServiceNamesFromLog));
  }, [logs]);

  const actorOptions = useMemo(() => {
    const userOptions = allStaff
      .filter(staff => !staff.is_hidden)
      .map(staff => ({ value: String(staff.staff_id), label: staff.name }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [
      { value: SYSTEM_ACTOR_FILTER, label: 'System Generated' },
      ...userOptions,
    ];
  }, [allStaff]);

  const filteredLogs = useMemo(() => {
    const normalizedAffectedFilter = affectedFilter.trim().toLowerCase();
    const normalizedDescriptionFilter = descriptionFilter.trim().toLowerCase();

    const nextLogs = logs.filter(log => {
      const effectiveActorId = getEffectiveActorId(log);

      const actorName = getActorLabel(log).toLowerCase();
      const affectedUsers = getAffectedUserNames(log).join(', ').toLowerCase();
      const affectedServices = getAffectedServiceNamesFromLog(log);
      const logDate = log.created_at ? log.created_at.slice(0, 10) : '';

      const pageMatch = pageFilter === 'all' || log.page_path === pageFilter;
      const actorMatch =
        actorFilter === 'all' ||
        (actorFilter === SYSTEM_ACTOR_FILTER && isSystemGeneratedLog(log)) ||
        String(effectiveActorId) === actorFilter ||
        actorName.includes(actorFilter.toLowerCase());
      const affectedMatch = !normalizedAffectedFilter || affectedUsers.includes(normalizedAffectedFilter);
      const serviceMatch = serviceFilter === 'all' || affectedServices.includes(serviceFilter);
      const actionMatch = actionFilter === 'all' || log.action_type === actionFilter;
      const entityMatch = entityFilter === 'all' || log.entity_type === entityFilter;
      const descriptionMatch = !normalizedDescriptionFilter || log.description.toLowerCase().includes(normalizedDescriptionFilter);
      const dateMatch = !dateFilter || logDate === dateFilter;

      return pageMatch && actorMatch && affectedMatch && serviceMatch && actionMatch && entityMatch && descriptionMatch && dateMatch;
    });

    const sortedLogs = [...nextLogs].sort((a, b) => {
      const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

      const getSortValue = (log: AuditLogWithRelations) => {
        switch (sortField) {
          case 'created_at':
            return new Date(log.created_at || '').getTime();
          case 'page_label':
            return log.page_label || '';
          case 'action_type':
            return log.action_type || '';
          case 'entity_type':
            return log.entity_type || '';
          case 'service':
            return getAffectedServiceNamesFromLog(log).join(', ') || '';
          case 'actor':
            return getActorLabel(log) || '';
          case 'affected':
            return getAffectedUserNames(log).join(', ') || '';
          case 'description':
            return log.description || '';
          default:
            return '';
        }
      };

      const valueA = getSortValue(a);
      const valueB = getSortValue(b);

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return (valueA - valueB) * directionMultiplier;
      }

      return String(valueA).localeCompare(String(valueB), undefined, { sensitivity: 'base' }) * directionMultiplier;
    });

    return sortedLogs;
  }, [
    logs,
    pageFilter,
    actorFilter,
    affectedFilter,
    serviceFilter,
    actionFilter,
    entityFilter,
    descriptionFilter,
    dateFilter,
    sortField,
    sortDirection,
    actorNames,
    teams,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(current => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortField(field);
    setSortDirection(field === 'created_at' ? 'desc' : 'asc');
  };

  const renderSortLabel = (label: string, field: SortField) => {
    const isActive = sortField === field;
    const directionIndicator = !isActive ? '↕' : sortDirection === 'asc' ? '↑' : '↓';

    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 text-left font-bold uppercase tracking-wide text-xs text-gray-700 dark:text-gray-200"
      >
        <span>{label}</span>
        <span className="text-[10px] opacity-80">{directionIndicator}</span>
      </button>
    );
  };

  if (!isAdmin) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <p className="text-red-800">⚠️ You do not have access to the audit log.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="page-title">Audit Log</h2>
        <p className="page-subtitle">
          View recorded user and system-generated changes with filters for page, action, service, actor, affected user, and description.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Showing <span className="font-bold text-gray-900 dark:text-white">{filteredLogs.length}</span> of{' '}
            <span className="font-bold text-gray-900 dark:text-white">{logs.length}</span> recent records
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setPageFilter('all');
                setActorFilter('all');
                setAffectedFilter('');
                setServiceFilter('all');
                setActionFilter('all');
                setEntityFilter('all');
                setDescriptionFilter('');
                setDateFilter('');
                setSortField('created_at');
                setSortDirection('desc');
                setExportMessage(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 font-medium"
            >
              Clear Filters
            </button>
            <button
              onClick={() => {
                void handleExportEntireAuditTrail();
              }}
              disabled={exporting}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting…' : 'Export Entire Audit Trail'}
            </button>
            <button
              onClick={() => {
                void fetchAuditData();
              }}
              className="px-4 py-2 bg-[#001B47] text-white rounded-md hover:bg-[#00245F] font-medium"
            >
              Refresh Log
            </button>
          </div>
        </div>
      </div>

      {exportMessage && (
        <div
          className={`p-3 border rounded-md text-sm ${
            exportMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {exportMessage.message}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-gray-500">Loading audit log…</div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {filteredLogs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-500">
              No audit records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1480px] w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('Date / Time', 'created_at')}
                        <input
                          type="date"
                          value={dateFilter}
                          onChange={(e) => setDateFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('Page', 'page_label')}
                        <select
                          value={pageFilter}
                          onChange={(e) => setPageFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          {PAGE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('Action', 'action_type')}
                        <select
                          value={actionFilter}
                          onChange={(e) => setActionFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="all">All actions</option>
                          {actionOptions.map(action => (
                            <option key={action} value={action}>
                              {action.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('Entity', 'entity_type')}
                        <select
                          value={entityFilter}
                          onChange={(e) => setEntityFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="all">All entities</option>
                          {entityOptions.map(entity => (
                            <option key={entity} value={entity}>
                              {entity.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left min-w-[180px]">
                      <div className="space-y-2">
                        {renderSortLabel('Service', 'service')}
                        <select
                          value={serviceFilter}
                          onChange={(e) => setServiceFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="all">All services</option>
                          {serviceOptions.map(service => (
                            <option key={service} value={service}>
                              {service}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('By User', 'actor')}
                        <select
                          value={actorFilter}
                          onChange={(e) => setActorFilter(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="all">All users and system</option>
                          {actorOptions.map(actor => (
                            <option key={actor.value} value={actor.value}>
                              {actor.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left">
                      <div className="space-y-2">
                        {renderSortLabel('Affected User(s)', 'affected')}
                        <input
                          type="text"
                          value={affectedFilter}
                          onChange={(e) => setAffectedFilter(e.target.value)}
                          placeholder="Filter affected users"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-3 align-top text-left min-w-[420px]">
                      <div className="space-y-2">
                        {renderSortLabel('Description / Details', 'description')}
                        <input
                          type="text"
                          value={descriptionFilter}
                          onChange={(e) => setDescriptionFilter(e.target.value)}
                          placeholder="Filter description"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredLogs.map((log, index) => {
                    const { date, time } = formatDateTime(log.created_at);

                    return (
                      <tr
                        key={log.id}
                        className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/20'}
                      >
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{date}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{time}</div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold">
                            {log.page_label}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold uppercase tracking-wide">
                            {log.action_type.replace(/_/g, ' ')}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 text-xs font-semibold uppercase tracking-wide">
                            {log.entity_type.replace(/_/g, ' ')}
                          </div>
                        </td>

                        <td className="px-4 py-4 align-top">
                          {renderAffectedServices(log)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="text-sm text-gray-900 dark:text-white">{getActorLabel(log)}</div>
                          {isSystemGeneratedLog(log) && (
                            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-[10px] font-bold uppercase tracking-wide">
                              System
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          {renderAffectedUsers(log)}
                        </td>

                        <td className="px-4 py-4 align-top min-w-[420px]">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {log.description}
                          </div>
                          {renderMetadataSummary(log)}
                          <div className="mt-2">
                            {renderExactChanges(log)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};