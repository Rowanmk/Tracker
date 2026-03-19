import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Database } from '../supabase/types';

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
];

export const AuditLog: React.FC = () => {
  const { isAdmin, allStaff } = useAuth();

  const [logs, setLogs] = useState<AuditLogWithRelations[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
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
        setLogs((logsResult.data as AuditLogWithRelations[]) || []);
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
      const pageMatch = pageFilter === 'all' || log.page_path === pageFilter;
      const staffMatch = staffFilter === 'all' || String(log.staff_id) === staffFilter;
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
          View recorded changes by page, user, accountant, date and time.
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
            <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
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
        <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Page</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Accountant</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLogs.map(log => {
                  const { date, time } = formatDateTime(log.created_at);

                  return (
                    <tr key={log.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">{date}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{time}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{log.page_label}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{log.staff?.name || 'Unknown'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{getTeamName(log)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{log.description}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 capitalize">{log.action_type.replace(/_/g, ' ')}</td>
                    </tr>
                  );
                })}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">
                      No audit records found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};