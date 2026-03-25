import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DateProvider } from './context/DateContext';
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

const getFirstAllowedPath = (hasPermission: (path: string) => boolean) => {
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

const ProtectedRoute: React.FC<{
  path: string;
  element: React.ReactElement;
}> = ({ path, element }) => {
  const { hasPermission } = useAuth();

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

const AuthRedirect: React.FC = () => {
  const { isAuthenticated, hasPermission } = useAuth();

  if (isAuthenticated) {
    const fallback = getFirstAllowedPath(hasPermission);
    if (fallback) {
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

  return <Navigate to="/login" replace />;
};

const ProtectedApp: React.FC = () => {
  const { isAuthenticated, loading, hasPermission } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-lg">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<AuthRedirect />} />
      </Routes>
    );
  }

  if (
    location.pathname === '/login' ||
    location.pathname === '/forgot-password'
  ) {
    const fallback = getFirstAllowedPath(hasPermission);
    if (fallback) {
      return <Navigate to={fallback} replace />;
    }
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ProtectedRoute path="/" element={<Dashboard />} />} />
        <Route path="/team" element={<ProtectedRoute path="/team" element={<TeamView />} />} />
        <Route path="/annual" element={<ProtectedRoute path="/annual" element={<AnnualSummary />} />} />
        <Route path="/tracker" element={<ProtectedRoute path="/tracker" element={<StaffTracker />} />} />
        <Route path="/sa-progress" element={<ProtectedRoute path="/sa-progress" element={<SelfAssessmentProgress />} />} />
        <Route path="/targets" element={<ProtectedRoute path="/targets" element={<TargetsControl />} />} />
        <Route path="/settings" element={<ProtectedRoute path="/settings" element={<Settings />} />} />
        <Route path="/audit-log" element={<ProtectedRoute path="/audit-log" element={<AuditLog />} />} />
        <Route path="*" element={<Navigate to={getFirstAllowedPath(hasPermission) || '/'} replace />} />
      </Routes>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DateProvider>
          <Router>
            <ProtectedApp />
          </Router>
        </DateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;