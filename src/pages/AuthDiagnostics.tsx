import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type StaffRow = Database['public']['Tables']['staff']['Row'];
type PermissionRow = Database['public']['Tables']['role_permissions']['Row'];

type CheckStatus = 'idle' | 'running' | 'pass' | 'warning' | 'fail';

interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  details: string;
}

const initialChecks: DiagnosticCheck[] = [
  { id: 'env-url', label: 'Supabase URL configured', status: 'idle', details: 'Not checked yet.' },
  { id: 'env-key', label: 'Supabase publishable key configured', status: 'idle', details: 'Not checked yet.' },
  { id: 'session-read', label: 'Auth session API reachable', status: 'idle', details: 'Not checked yet.' },
  { id: 'staff-table', label: 'staff table readable', status: 'idle', details: 'Not checked yet.' },
  { id: 'teams-table', label: 'teams table readable', status: 'idle', details: 'Not checked yet.' },
  { id: 'permissions-table', label: 'role_permissions table readable', status: 'idle', details: 'Not checked yet.' },
  { id: 'recovery-staff', label: 'Recovery admin staff records present', status: 'idle', details: 'Not checked yet.' },
  { id: 'rowan-link', label: 'Rowan staff auth link state', status: 'idle', details: 'Not checked yet.' },
  { id: 'admin-link', label: 'Admin staff auth link state', status: 'idle', details: 'Not checked yet.' },
  { id: 'edge-function', label: 'create-user edge function reachable', status: 'idle', details: 'Not checked yet.' },
];

const statusStyles: Record<Exclude<CheckStatus, 'idle' | 'running'>, string> = {
  pass: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  fail: 'bg-red-50 border-red-200 text-red-800',
};

const statusLabels: Record<CheckStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  pass: 'Pass',
  warning: 'Warning',
  fail: 'Fail',
};

const normalizeFirstName = (name?: string | null) => (name || '').split(' ')[0]?.trim().toLowerCase() || '';

export const AuthDiagnostics: React.FC = () => {
  const [checks, setChecks] = useState<DiagnosticCheck[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string>('Run diagnostics to inspect Supabase login setup and likely auth blockers.');
  const [rawError, setRawError] = useState<string | null>(null);

  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const envKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || '';

  const counts = useMemo(() => {
    return checks.reduce(
      (acc, check) => {
        acc[check.status] += 1;
        return acc;
      },
      { idle: 0, running: 0, pass: 0, warning: 0, fail: 0 }
    );
  }, [checks]);

  const updateCheck = (id: string, status: CheckStatus, details: string) => {
    setChecks((prev) => prev.map((check) => (check.id === id ? { ...check, status, details } : check)));
  };

  const runDiagnostics = async () => {
    setRunning(true);
    setRawError(null);
    setSummary('Running Supabase auth diagnostics…');
    setChecks(initialChecks.map((check) => ({ ...check, status: 'running', details: 'Running…' })));

    try {
      const trimmedUrl = envUrl.trim();
      const trimmedKey = envKey.trim();

      if (trimmedUrl.startsWith('https://') && trimmedUrl.includes('.supabase.co')) {
        updateCheck('env-url', 'pass', `Configured URL: ${trimmedUrl}`);
      } else {
        updateCheck('env-url', 'fail', 'VITE_SUPABASE_URL is missing or malformed.');
      }

      if (trimmedKey.length > 20) {
        updateCheck('env-key', 'pass', `Publishable key is present (${trimmedKey.length} chars).`);
      } else {
        updateCheck('env-key', 'fail', 'VITE_SUPABASE_PUBLISHABLE_KEY is missing or too short.');
      }

      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) {
        updateCheck('session-read', 'fail', sessionResult.error.message);
      } else {
        const hasSession = Boolean(sessionResult.data.session);
        updateCheck(
          'session-read',
          'pass',
          hasSession
            ? `Auth API reachable. Existing session found for ${sessionResult.data.session?.user.email || 'current user'}.`
            : 'Auth API reachable. No active session present, which is valid before login.'
        );
      }

      const [staffResult, teamsResult, permissionsResult] = await Promise.all([
        supabase.from('staff').select('*').order('staff_id'),
        supabase.from('teams').select('*').order('id'),
        supabase.from('role_permissions').select('*'),
      ]);

      if (staffResult.error) {
        updateCheck('staff-table', 'fail', staffResult.error.message);
      } else {
        updateCheck('staff-table', 'pass', `Loaded ${staffResult.data?.length || 0} staff row(s).`);
      }

      if (teamsResult.error) {
        updateCheck('teams-table', 'warning', teamsResult.error.message);
      } else {
        updateCheck('teams-table', 'pass', `Loaded ${teamsResult.data?.length || 0} team row(s).`);
      }

      if (permissionsResult.error) {
        updateCheck('permissions-table', 'warning', permissionsResult.error.message);
      } else {
        const permissions = (permissionsResult.data || []) as PermissionRow[];
        const adminLoginPermission = permissions.find((permission) => permission.role === 'admin' && permission.page_path === '/settings');
        updateCheck(
          'permissions-table',
          'pass',
          `Loaded ${permissions.length} permission row(s).${adminLoginPermission && adminLoginPermission.is_visible === false ? ' Admin /settings is hidden, which may affect admin flows after login.' : ''}`
        );
      }

      const staffRows = (staffResult.data || []) as StaffRow[];
      const rowanStaff = staffRows.filter((row) => normalizeFirstName(row.name) === 'rowan');
      const adminStaff = staffRows.filter((row) => normalizeFirstName(row.name) === 'admin');

      if (rowanStaff.length > 0 || adminStaff.length > 0) {
        updateCheck(
          'recovery-staff',
          'pass',
          `Found Rowan records: ${rowanStaff.length}. Found Admin records: ${adminStaff.length}.`
        );
      } else {
        updateCheck(
          'recovery-staff',
          'fail',
          'No Rowan or Admin staff records found. Login linking cannot succeed for recovery accounts without a matching public.staff row.'
        );
      }

      if (rowanStaff.length === 0) {
        updateCheck('rowan-link', 'warning', 'No Rowan staff record found.');
      } else if (rowanStaff.some((row) => row.user_id)) {
        const linked = rowanStaff.filter((row) => row.user_id);
        updateCheck(
          'rowan-link',
          'pass',
          `Rowan has ${linked.length} linked staff record(s) with user_id. Role(s): ${linked.map((row) => row.role).join(', ')}.`
        );
      } else {
        updateCheck(
          'rowan-link',
          'warning',
          'Rowan staff record exists but has no user_id link. Auth can succeed but app access will fail until linked.'
        );
      }

      if (adminStaff.length === 0) {
        updateCheck('admin-link', 'warning', 'No generic Admin staff record found.');
      } else if (adminStaff.some((row) => row.user_id)) {
        const linked = adminStaff.filter((row) => row.user_id);
        updateCheck(
          'admin-link',
          'pass',
          `Admin has ${linked.length} linked staff record(s) with user_id. Role(s): ${linked.map((row) => row.role).join(', ')}.`
        );
      } else {
        updateCheck(
          'admin-link',
          'warning',
          'Admin staff record exists but has no user_id link. Any admin auth account would still fail staff matching.'
        );
      }

      const edgeResult = await supabase.functions.invoke('create-user', {
        body: {
          email: '',
          password: '',
          name: '',
          role: '',
        },
      });

      if (edgeResult.error) {
        const message = edgeResult.error.message || 'Unknown edge function error';
        const normalizedMessage = message.toLowerCase();

        if (
          normalizedMessage.includes('unauthorized') ||
          normalizedMessage.includes('forbidden') ||
          normalizedMessage.includes('missing authorization')
        ) {
          updateCheck(
            'edge-function',
            'pass',
            `Edge function deployed and responding. It rejected the request as expected without valid admin auth: ${message}`
          );
        } else if (
          normalizedMessage.includes('failed to send a request') ||
          normalizedMessage.includes('fetch') ||
          normalizedMessage.includes('functions') ||
          normalizedMessage.includes('not found')
        ) {
          updateCheck(
            'edge-function',
            'fail',
            `create-user edge function may not be deployed or reachable: ${message}`
          );
        } else {
          updateCheck(
            'edge-function',
            'warning',
            `Edge function responded with an unexpected error: ${message}`
          );
        }
      } else {
        updateCheck(
          'edge-function',
          'warning',
          `Edge function returned a success payload for invalid input. Response: ${JSON.stringify(edgeResult.data)}`
        );
      }

      const finalState = (() => {
        const currentChecks = checks;
        return currentChecks;
      })();

      void finalState;
      setSummary('Diagnostics complete. Review failures first, then warnings.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown diagnostics error';
      setRawError(message);
      setSummary('Diagnostics stopped early because a request failed unexpectedly.');
    } finally {
      setRunning(false);
    }
  };

  const passCount = checks.filter((check) => check.status === 'pass').length;
  const warningCount = checks.filter((check) => check.status === 'warning').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;

  const likelyIssues = useMemo(() => {
    const issues: string[] = [];

    const failedIds = new Set(checks.filter((check) => check.status === 'fail').map((check) => check.id));
    const warningIds = new Set(checks.filter((check) => check.status === 'warning').map((check) => check.id));

    if (failedIds.has('env-url') || failedIds.has('env-key')) {
      issues.push('Frontend environment variables are not valid, so login requests may never reach Supabase correctly.');
    }

    if (failedIds.has('session-read')) {
      issues.push('The Supabase auth client is not responding correctly, which blocks all credential-based sign-in attempts.');
    }

    if (failedIds.has('staff-table')) {
      issues.push('The app cannot read public.staff, so authentication may succeed in Supabase but still fail inside the app.');
    }

    if (warningIds.has('rowan-link') || warningIds.has('admin-link')) {
      issues.push('A staff recovery account exists without a user_id link, which matches the common “invalid access after auth” failure mode in this app.');
    }

    if (failedIds.has('recovery-staff')) {
      issues.push('There is no matching recovery staff row for Rowan/Admin, so auth-user-to-staff matching cannot complete.');
    }

    if (failedIds.has('edge-function')) {
      issues.push('The create-user edge function may be undeployed, unreachable, or misconfigured.');
    }

    return issues;
  }, [checks]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001B47] via-[#0060B8] to-[#007EE0] py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-2">
                Login Diagnostics
              </h1>
              <p className="text-sm text-gray-600 max-w-2xl">
                This tests whether Supabase is configured and reachable for credential login, and checks the app-side dependencies that commonly break sign-in.
              </p>
            </div>

            <div className="flex gap-3">
              <Link
                to="/login"
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Back to Login
              </Link>
              <button
                onClick={() => {
                  void runDiagnostics();
                }}
                disabled={running}
                className="px-4 py-2 bg-[#001B47] text-white rounded-lg text-sm font-bold hover:bg-[#00245F] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? 'Running…' : 'Run Diagnostics'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Passed</div>
            <div className="mt-2 text-3xl font-extrabold text-green-600">{passCount}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Warnings</div>
            <div className="mt-2 text-3xl font-extrabold text-yellow-600">{warningCount}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Failures</div>
            <div className="mt-2 text-3xl font-extrabold text-red-600">{failCount}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Remaining Idle</div>
            <div className="mt-2 text-3xl font-extrabold text-gray-700">{counts.idle}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-2">Summary</h2>
          <p className="text-sm text-gray-700">{summary}</p>
          {rawError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {rawError}
            </div>
          )}
        </div>

        {likelyIssues.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Most Likely Login Problems</h2>
            <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
              {likelyIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Checks</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {checks.map((check) => {
              const isComplete = check.status === 'pass' || check.status === 'warning' || check.status === 'fail';
              return (
                <div key={check.id} className="px-6 py-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{check.label}</div>
                      <div className="mt-1 text-sm text-gray-600">{check.details}</div>
                    </div>
                    <div
                      className={`inline-flex items-center px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wide ${
                        isComplete
                          ? statusStyles[check.status as 'pass' | 'warning' | 'fail']
                          : check.status === 'running'
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}
                    >
                      {statusLabels[check.status]}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-3">What This Covers</h2>
          <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>Frontend Supabase environment values</li>
            <li>Supabase auth client reachability</li>
            <li>Read access to staff, teams, and role permissions tables</li>
            <li>Presence of Rowan/Admin recovery staff rows</li>
            <li>Whether recovery staff records are already linked with user_id</li>
            <li>Whether the create-user edge function is deployed and reachable</li>
          </ul>
        </div>
      </div>
    </div>
  );
};