import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
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
import { useAuth } from './context/AuthContext';

const ProtectedApp: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/team" element={<TeamView />} />
        <Route path="/annual" element={<AnnualSummary />} />
        <Route path="/tracker" element={<StaffTracker />} />
        <Route path="/sa-progress" element={<SelfAssessmentProgress />} />
        <Route path="/targets" element={<TargetsControl />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/audit-log" element={<AuditLog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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