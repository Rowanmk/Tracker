import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase/client';
import type { Database } from '../supabase/types';

type StaffRow = Database['public']['Tables']['staff']['Row'];
type PermissionRow = Database['public']['Tables']['role_permissions']['Row'];

type TestStatus = 'idle' | 'running' | 'pass' | 'warning' | 'fail';

interface TestStep {
  id: string;
  label: string;
  status: TestStatus;
  details: string;
}

const TEST_EMAIL = 'rowan@thecrew.co.uk';
const TEST_PASSWORD = 'Rowan123!';

const initialSteps: TestStep[] = [
  { id: 'session-clear', label: 'Clear existing session', status: 'idle', details: 'Not started.' },
  { id: 'auth-signin', label: 'Sign in with Rowan credentials', status: 'idle', details: 'Not started.' },
  { id: 'auth-session', label: 'Read returned auth session', status: 'idle', details: 'Not started.' },
  { id: 'staff-read', label: 'Find Rowan staff record', status: 'idle', details: 'Not started.' },
  { id: 'user-link', label: 'Check auth user_id link', status: 'idle', details: 'Not started.' },
  { id: 'role-check', label: 'Check Rowan role', status: 'idle', details: 'Not started.' },
  { id: 'permission-dashboard', label: 'Check dashboard visibility', status: 'idle', details: 'Not started.' },
  { id: 'permission-settings', label: 'Check settings visibility', status: 'idle', details: 'Not started.' },
  { id: 'cleanup', label: 'Restore signed-out state', status: 'idle', details: 'Not started.' },
];

const statusClasses: Record<TestStatus, string> = {
  idle: 'bg-gray-50 border-gray-200 text-gray-600',
  running: 'bg-blue-50 border-blue-200 text-blue-700',
  pass: 'bg-green-50 border-green-200 text-green-700',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  fail: 'bg-red-50 border-red-200 text-red-700',
};

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();
const normalizeFirstName = (value?: string | null) => (value || '').split(' ')[0]?.trim().toLowerCase() || '';

export const RowanLoginTest: React.FC = () => {
  const [steps, setSteps] = useState<TestStep[]>(initialSteps);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('Run this test to verify whether Rowan can actually sign in and reach the app.');
  const [capturedError, setCapturedError] = useState<string | null>(null);

  const updateStep = (id: string, status: TestStatus, details: string) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, status, details } : step)));
  };

  const runTest = async () => {
    setRunning(true);
    setCapturedError(null);
    setSummary('Testing Rowan login against Supabase Auth and app-side access rules…');
    setSteps(initialSteps.map((step) => ({ ...step, status: 'running', details: 'Running…' })));

    let signedInUserId: string | null = null;
    let rowanRecord: StaffRow | null = null;
    let effectiveRole = 'unknown';

    try {
      const signOutBefore = await supabase.auth.signOut();
      if (signOutBefore.error) {
        updateStep('session-clear', 'warning', `Could not fully clear previous session first: ${signOutBefore.error.message}`);
      } else {
        updateStep('session-clear', 'pass', 'Any previous session was cleared successfully.');
      }

      const signInResult = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

      if (signInResult.error || !signInResult.data.user) {
        updateStep(
          'auth-signin',
          'fail',
          signInResult.error?.message || 'Supabase did not return a user for the supplied credentials.'
        );
        updateStep('auth-session', 'fail', 'Cannot inspect auth session because sign-in failed.');
        updateStep('staff-read', 'warning', 'Skipped because sign-in failed.');
        updateStep('user-link', 'warning', 'Skipped because sign-in failed.');
        updateStep('role-check', 'warning', 'Skipped because sign-in failed.');
        updateStep('permission-dashboard', 'warning', 'Skipped because sign-in failed.');
        updateStep('permission-settings', 'warning', 'Skipped because sign-in failed.');
        setSummary('Rowan login failed at the credential step.');
        return;
      }

      signedInUserId = signInResult.data.user.id;
      updateStep(
        'auth-signin',
        'pass',
        `Credentials were accepted by Supabase Auth for ${signInResult.data.user.email || TEST_EMAIL}.`
      );

      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error || !sessionResult.data.session) {
        updateStep(
          'auth-session',
          'fail',
          sessionResult.error?.message || 'No active session was returned after a successful sign-in.'
        );
      } else {
        updateStep(
          'auth-session',
          'pass',
          `Active session created. User id: ${sessionResult.data.session.user.id}.`
        );
      }

      const staffResult = await supabase.from('staff').select('*').order('staff_id');
      if (staffResult.error) {
        updateStep('staff-read', 'fail', staffResult.error.message);
        updateStep('user-link', 'warning', 'Could not evaluate because public.staff could not be read.');
        updateStep('role-check', 'warning', 'Could not evaluate because public.staff could not be read.');
        updateStep('permission-dashboard', 'warning', 'Permission checks limited because staff lookup failed.');
        updateStep('permission-settings', 'warning', 'Permission checks limited because staff lookup failed.');
      } else {
        const rows = (staffResult.data || []) as StaffRow[];
        rowanRecord =
          rows.find((row) => row.user_id === signedInUserId) ||
          rows.find((row) => normalizeEmail((row as StaffRow & { email?: string | null }).email) === TEST_EMAIL) ||
          rows.find((row) => normalizeFirstName(row.name) === 'rowan') ||
          null;

        if (!rowanRecord) {
          updateStep(
            'staff-read',
            'fail',
            'No Rowan staff record could be found. The app will not complete login without a matching public.staff row.'
          );
          updateStep('user-link', 'fail', 'No Rowan staff record exists to link against the auth user.');
          updateStep('role-check', 'fail', 'No Rowan staff record exists, so role resolution will fail.');
        } else {
          updateStep(
            'staff-read',
            'pass',
            `Found Rowan staff record #${rowanRecord.staff_id} (${rowanRecord.name}).`
          );

          if (rowanRecord.user_id === signedInUserId) {
            updateStep(
              'user-link',
              'pass',
              `Rowan staff record is correctly linked to auth user ${signedInUserId}.`
            );
          } else if (!rowanRecord.user_id) {
            updateStep(
              'user-link',
              'warning',
              'Rowan staff record exists but user_id is empty. Supabase auth works, but app-level staff matching may fail until linked.'
            );
          } else {
            updateStep(
              'user-link',
              'fail',
              `Rowan staff record is linked to a different auth user (${rowanRecord.user_id}), not the current signed-in user (${signedInUserId}).`
            );
          }

          effectiveRole =
            normalizeFirstName(rowanRecord.name) === 'rowan' && rowanRecord.role !== 'admin'
              ? 'admin'
              : rowanRecord.role;

          if (effectiveRole === 'admin') {
            updateStep(
              'role-check',
              'pass',
              `Rowan resolves to admin access. Stored role: ${rowanRecord.role}.`
            );
          } else if (effectiveRole === 'staff' || effectiveRole === 'user') {
            updateStep(
              'role-check',
              'warning',
              `Rowan is not resolving to admin. Effective role is ${effectiveRole}. Login may work, but admin pages may be limited.`
            );
          } else {
            updateStep(
              'role-check',
              'fail',
              `Unexpected Rowan role: ${rowanRecord.role || 'empty'}.`
            );
          }

          const permissionsResult = await supabase.from('role_permissions').select('*');
          if (permissionsResult.error) {
            updateStep(
              'permission-dashboard',
              'warning',
              `Could not read role_permissions table: ${permissionsResult.error.message}`
            );
            updateStep(
              'permission-settings',
              'warning',
              `Could not read role_permissions table: ${permissionsResult.error.message}`
            );
          } else {
            const permissions = (permissionsResult.data || []) as PermissionRow[];
            const permissionsRole = effectiveRole === 'user' ? 'staff' : effectiveRole;

            const dashboardPermission = permissions.find(
              (permission) => permission.role === permissionsRole && permission.page_path === '/'
            );
            const settingsPermission = permissions.find(
              (permission) => permission.role === permissionsRole && permission.page_path === '/settings'
            );

            const canSeeDashboard = dashboardPermission ? dashboardPermission.is_visible !== false : true;
            const canSeeSettings = settingsPermission ? settingsPermission.is_visible !== false : true;

            updateStep(
              'permission-dashboard',
              canSeeDashboard ? 'pass' : 'fail',
              canSeeDashboard
                ? `Dashboard route is visible for role ${permissionsRole}.`
                : `Dashboard route is hidden for role ${permissionsRole}.`
            );

            updateStep(
              'permission-settings',
              canSeeSettings ? 'pass' : 'warning',
              canSeeSettings
                ? `Settings route is visible for role ${permissionsRole}.`
                : `Settings route is hidden for role ${permissionsRole}. Rowan may sign in but lose admin settings access.`
            );
          }
        }
      }

      if (signedInUserId && rowanRecord) {
        const linked = rowanRecord.user_id === signedInUserId;
        const dashboardPass = (() => {
          const step = steps.find((item) => item.id === 'permission-dashboard');
          return step?.status === 'pass';
        })();

        if (linked) {
          setSummary(
            effectiveRole === 'admin'
              ? 'Supabase accepted Rowan credentials and the Rowan staff record is linked. The login should work unless a later app state issue overrides it.'
              : 'Supabase accepted Rowan credentials, but Rowan is not resolving cleanly to admin access.'
          );
          void dashboardPass;
        } else {
          setSummary('Supabase accepted Rowan credentials, but the staff link is wrong or missing, so the app login path is still blocked.');
        }
      } else if (signedInUserId) {
        setSummary('Supabase accepted Rowan credentials, but the app could not verify a usable Rowan staff record.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Rowan login test error';
      setCapturedError(message);
      setSummary('The Rowan login test stopped because an unexpected request failed.');
    } finally {
      const signOutAfter = await supabase.auth.signOut();
      if (signOutAfter.error) {
        updateStep('cleanup', 'warning', `The test finished, but sign-out cleanup failed: ${signOutAfter.error.message}`);
      } else {
        updateStep('cleanup', 'pass', 'Test session cleaned up and signed out successfully.');
      }
      setRunning(false);
    }
  };

  const counts = useMemo(() => {
    return steps.reduce(
      (acc, step) => {
        acc[step.status] += 1;
        return acc;
      },
      { idle: 0, running: 0, pass: 0, warning: 0, fail: 0 } as Record<TestStatus, number>
    );
  }, [steps]);

  const likelyVerdict = useMemo(() => {
    const failed = new Set(steps.filter((step) => step.status === 'fail').map((step) => step.id));
    const warnings = new Set(steps.filter((step) => step.status === 'warning').map((step) => step.id));

    if (failed.has('auth-signin')) {
      return 'Credentials are not valid in Supabase Auth right now.';
    }

    if (failed.has('staff-read') || failed.has('user-link')) {
      return 'Supabase auth may work, but the Crew Tracker app cannot complete Rowan login because the staff record is missing or linked incorrectly.';
    }

    if (failed.has('role-check')) {
      return 'Rowan exists, but role resolution is broken.';
    }

    if (failed.has('permission-dashboard')) {
      return 'Rowan can authenticate but still cannot reach the main app because dashboard visibility is blocked.';
    }

    if (warnings.has('permission-settings')) {
      return 'Rowan should be able to log in, but admin settings access is restricted.';
    }

    if (steps.some((step) => step.status === 'pass') && !steps.some((step) => step.status === 'fail')) {
      return 'Rowan login path looks valid.';
    }

    return 'Run the test to determine whether Rowan login will work.';
  }, [steps]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001B47] via-[#0060B8] to-[#007EE0] py-10 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-2">
                Rowan Login Test
              </h1>
              <p className="text-sm text-gray-600 max-w-2xl">
                This runs a real Supabase sign-in test using <strong>{TEST_EMAIL}</strong> and checks whether the app can match that user to Rowan’s staff record and permissions.
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
                  void runTest();
                }}
                disabled={running}
                className="px-4 py-2 bg-[#001B47] text-white rounded-lg text-sm font-bold hover:bg-[#00245F] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? 'Testing…' : 'Run Rowan Test'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Pass</div>
            <div className="mt-2 text-3xl font-extrabold text-green-600">{counts.pass}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Warning</div>
            <div className="mt-2 text-3xl font-extrabold text-yellow-600">{counts.warning}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Fail</div>
            <div className="mt-2 text-3xl font-extrabold text-red-600">{counts.fail}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Running</div>
            <div className="mt-2 text-3xl font-extrabold text-blue-600">{counts.running}</div>
          </div>
          <div className="bg-white rounded-xl shadow-md p-5 border border-gray-200">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Idle</div>
            <div className="mt-2 text-3xl font-extrabold text-gray-700">{counts.idle}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200 space-y-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Summary</h2>
            <p className="mt-2 text-sm text-gray-700">{summary}</p>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Verdict</div>
            <div className="text-sm font-semibold text-gray-900">{likelyVerdict}</div>
          </div>
          {capturedError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {capturedError}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Test Steps</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {steps.map((step) => (
              <div key={step.id} className="px-6 py-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-gray-900">{step.label}</div>
                    <div className="mt-1 text-sm text-gray-600">{step.details}</div>
                  </div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-md border text-xs font-bold uppercase tracking-wide ${statusClasses[step.status]}`}>
                    {step.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Checks Included</h2>
          <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>Real Supabase credential login using Rowan’s email and password</li>
            <li>Verification that a valid auth session is created</li>
            <li>Lookup of Rowan’s linked staff row in <code className="bg-gray-100 px-1 py-0.5 rounded">public.staff</code></li>
            <li>Validation that <code className="bg-gray-100 px-1 py-0.5 rounded">user_id</code> matches the signed-in auth user</li>
            <li>Role resolution for Rowan/admin fallback logic</li>
            <li>Visibility checks for dashboard and settings routes</li>
          </ul>
        </div>
      </div>
    </div>
  );
};