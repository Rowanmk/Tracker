import React, { useEffect, useMemo, useState } from 'react';
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

const isJsonObject = (value: Json | null): value is Record<string, Json | undefined> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isJsonArray = (value: Json | undefined): value is Json[] => Array.isArray(value);

export const AuditLog: React.FC = () => {
  const { isAdmin, allStaff } = useAuth();

  const [logs, setLogs] = useState<AuditLogWithRelations[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [actorNames, setActorNames] = useState<Map<number, Staff>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageFilter, setPageFilter] = useState('all');
  const [staffFilter, setStaffFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');

  const fetchAuditData = async () => {
    setLoading(true);
    setError(null);

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
        const nextLogs = (logsResult.data as AuditLogWithRelations[]) || [];
        setLogs(nextLogs);

        const actors = await getActorNamesForLogs(nextLogs.map((log) => {
          if (isJsonObject(log.metadata) && typeof log.metadata.actor_staff_id === 'number') {
            return log.metadata.actor_staff_id;
          }
          return null;
        }));
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

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    fetchAuditData();
  }, [isAdmin]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const metadata = isJsonObject(log.metadata) ? log.metadata : null;
      const effectiveActorId =
        typeof metadata?.actor_staff_id === 'number' ? metadata.actor_staff_id : log.staff_id;

      const pageMatch = pageFilter === 'all' || log.page_path === pageFilter;
      const staffMatch = staffFilter === 'all' || String(effectiveActorId) === staffFilter;
      const teamMatch = teamFilter === 'all' || String(log.team_id) === teamFilter;
      return pageMatch && staffMatch && teamMatch;
    });
  }, [logs, pageFilter, staffFilter, teamFilter]);

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

  const getActorLabel = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    const explicitActorId = typeof metadata?.actor_staff_id === 'number' ? metadata.actor_staff_id : null;
    const explicitActorName = typeof metadata?.updated_by_name === 'string' ? metadata.updated_by_name : null;

    if (explicitActorName) return explicitActorName;
    if (explicitActorId && actorNames.get(explicitActorId)?.name) {
      return actorNames.get(explicitActorId)?.name || 'Unknown';
    }
    return log.staff?.name || 'Unknown';
  };

  const renderAffectedUsers = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    const affectedUserNames = Array.isArray(metadata?.affected_user_names)
      ? metadata?.affected_user_names.filter((value): value is string => typeof value === 'string')
      : [];

    if (affectedUserNames.length === 0) {
      return <span className="text-sm text-gray-400">—</span>;
    }

    return (
      <div className="text-sm text-gray-900">
        {affectedUserNames.length > 3
          ? `${affectedUserNames.slice(0, 3).join(', ')} +${affectedUserNames.length - 3} more`
          : affectedUserNames.join(', ')}
      </div>
    );
  };

  const renderMetadataSummary = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return null;

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

    if (typeof metadata.affected_user_count === 'number') {
      parts.push(`${metadata.affected_user_count} user(s)`);
    }

    if (typeof metadata.exact_change === 'string') {
      parts.push(metadata.exact_change);
    }

    if (parts.length === 0) return null;

    return <div className="text-xs text-gray-500 mt-1">{parts.join(' • ')}</div>;
  };

  const renderExactChanges = (log: AuditLogWithRelations) => {
    const metadata = isJsonObject(log.metadata) ? log.metadata : null;
    if (!metadata) return null;

    const affectedUsers = isJsonArray(metadata.affected_users)
      ? metadata.affected_users.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
      : [];

    if (affectedUsers.length > 0) {
      return (
        <div className="mt-2 space-y-2">
          {affectedUsers.slice(0, 4).map((user, index) => {
            const userName = typeof user.name === 'string' ? user.name : `User ${index + 1}`;
            const changes = isJsonArray(user.changes)
              ? user.changes.filter((item): item is Record<string, Json | undefined> => !!item && typeof item === 'object' && !Array.isArray(item))
              : [];

            return (
              <div key={`${userName}-${index}`} className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                <div className="text-xs font-semibold text-gray-700">{userName}</div>
                {changes.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {changes.slice(0, 3).map((change, changeIndex) => {
                      const month = typeof change.month === 'number' ? change.month : null;
                      const serviceName = typeof change.service_name === 'string' ? change.service_name : 'Service';
                      const previousValue = typeof change.previous_value === 'number' ? change.previous_value : 0;
                      const newValue = typeof change.new_value === 'number' ? change.new_value : 0;

                      return (
                        <div key={`${serviceName}-${changeIndex}`} className="text-xs text-gray-600">
                          {serviceName}{month ? ` (month ${month})` : ''}: {previousValue} → {newValue}
                        </div>
                      );
                    })}
                    {changes.length > 3 && (
                      <div className="text-xs text-gray-400">
                        +{changes.length - 3} more change(s)
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-600">
                    {typeof user.changed_cells === 'number' ? `${user.changed_cells} field(s) changed` : 'Updated'}
                  </div>
                )}
              </div>
            );
          })}
          {affectedUsers.length > 4 && (
            <div className="text-xs text-gray-400">
              +{affectedUsers.length - 4} more user(s)
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
        <div className="mt-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          {keys.slice(0, 5).map((key) => (
            <div key={key} className="text-xs text-gray-600">
              <span className="font-semibold text-gray-700">{key.replace(/_/g, ' ')}:</span>{' '}
              {String(previous?.[key] ?? '—')} → {String(current?.[key] ?? '—')}
            </div>
          ))}
          {keys.length > 5 && (
            <div className="text-xs text-gray-400 mt-1">
              +{keys.length - 5} more field change(s)
            </div>
          )}
        </div>
      );
    }

    return null;
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
          View recorded changes by page, user, affected user, date, time and action details.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
            <select
              value={pageFilter}
              onChange={e => setPageFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            >
              {PAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">By User</label>
            <select
              value={staffFilter}
              onChange={e => setStaffFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            >
              <option value="all">All users</option>
              {allStaff
                .filter(staff => !staff.is_hidden)
                .map(staff => (
                  <option key={staff.staff_id} value={String(staff.staff_id)}>
                    {staff.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Accountant</label>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            >
              <option value="all">All accountants</option>
              {teams.map(team => (
                <option key={team.id} value={String(team.id)}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchAuditData}
              className="w-full px-4 py-2 bg-[#001B47] text-white rounded-md hover:bg-[#00245F] font-medium"
            >
              Refresh Log
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-gray-500">Loading audit log…</div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.length === 0 ? (
            <div className="bg-white shadow rounded-lg border border-gray-200 px-6 py-10 text-center text-sm text-gray-500">
              No audit records found for the selected filters.
            </div>
          ) : (
            filteredLogs.map(log => {
              const { date, time } = formatDateTime(log.created_at);

              return (
                <div key={log.id} className="bg-white shadow rounded-lg border border-gray-200 p-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-semibold uppercase tracking-wide">
                          {log.page_label}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wide">
                          {log.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-50 text-gray-500 text-xs font-semibold uppercase tracking-wide">
                          {log.entity_type.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-gray-900">
                        {log.description}
                      </div>

                      {renderMetadataSummary(log)}
                      {renderExactChanges(log)}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:min-w-[420px]">
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Date</div>
                        <div className="text-sm text-gray-900">{date}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Time</div>
                        <div className="text-sm text-gray-900">{time}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">By User</div>
                        <div className="text-sm text-gray-900">{getActorLabel(log)}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Affected User(s)</div>
                        {renderAffectedUsers(log)}
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Accountant</div>
                        <div className="text-sm text-gray-900">{getTeamName(log)}</div>
                      </div>
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Record ID</div>
                        <div className="text-sm text-gray-900">{log.id}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};