import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DateProvider } from './context/DateContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TeamView } from './pages/TeamView';
import { AnnualSummary } from './pages/AnnualSummary';
import { StaffTracker } from './pages/StaffTracker';
import { SelfAssessmentProgress } from './pages/SelfAssessmentProgress';
import { TargetsControl } from './pages/TargetsControl';
import { Settings } from './pages/Settings';
import { AuditLog } from './pages/AuditLog';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';

const getFirstAllowedPath = (hasPermission: (path: string) => boolean): string | undefined => {
  const protectedPaths = [
    '/',
    '/tracker',
    '/sa-progress',
    '/team',
    '/annual',
    '/targets',
    '/settings',
    '/audit-log',
  ];

  return protectedPaths.find((path) => hasPermission(path));
};

const ConnectionErrorScreen: React.FC<{ error: string; onRetry: () => void }> = ({ error, onRetry }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
    <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-2xl text-center">
      <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-3">Crew Tracker</h1>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Cannot connect to the server</h2>
      <p className="text-sm text-gray-600 mb-4">
        The app could not load required data from Supabase. This usually means the server is unreachable, the deployment is missing environment variables, or your network connection is down.
      </p>
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
          <div className="font-bold mb-1">Details:</div>
          <div className="font-mono text-xs break-words">{error}</div>
        </div>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="px-5 py-2 bg-[#001B47] text-white rounded-md font-bold hover:bg-[#00245F] transition"
      >
        Retry
      </button>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{
  path: string;
  element: React.ReactElement;
}> = ({ path, element }) => {
  const { hasPermission, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasPermission(path)) {
    const fallback = getFirstAllowedPath(hasPermission);
    if (fallback && fallback !== path) {
      return <Navigate to={fallback} replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view any pages. Please contact an administrator.</p>
        </div>
      </div>
    );
  }

  return element;
};

const AppRoutes: React.FC = () => {
  const { loading, hasPermission, isAuthenticated, error, loadFailed, refreshStaff } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading…</div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <ConnectionErrorScreen
        error={error || 'Unknown connection error.'}
        onRetry={() => {
          void refreshStaff();
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      {error && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">
          ⚠️ {error}
        </div>
      )}
      <Routes>
        <Route path="/" element={<ProtectedRoute path="/" element={<Dashboard />} />} />
        <Route path="/team" element={<ProtectedRoute path="/team" element={<TeamView />} />} />
        <Route path="/annual" element={<ProtectedRoute path="/annual" element={<AnnualSummary />} />} />
        <Route path="/tracker" element={<ProtectedRoute path="/tracker" element={<StaffTracker />} />} />
        <Route path="/sa-progress" element={<ProtectedRoute path="/sa-progress" element={<SelfAssessmentProgress />} />} />
        <Route path="/targets" element={<ProtectedRoute path="/targets" element={<TargetsControl />} />} />
        <Route path="/settings" element={<ProtectedRoute path="/settings" element={<Settings />} />} />
        <Route path="/audit-log" element={<ProtectedRoute path="/audit-log" element={<AuditLog />} />} />
        <Route path="/login" element={<Navigate to={getFirstAllowedPath(hasPermission) || '/'} replace />} />
        <Route path="/forgot-password" element={<Navigate to={getFirstAllowedPath(hasPermission) || '/'} replace />} />
        <Route path="*" element={<Navigate to={getFirstAllowedPath(hasPermission) || '/'} replace />} />
      </Routes>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <Router>
          <AuthProvider>
            <DateProvider>
              <AppRoutes />
            </DateProvider>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </AppErrorBoundary>
  );
};

export default App;