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
import { TargetsControl } from './pages/TargetsControl';
import { Settings } from './pages/Settings';

const AppContent: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/team" element={<TeamView />} />
        <Route path="/annual" element={<AnnualSummary />} />
        <Route path="/tracker" element={<StaffTracker />} />
        <Route path="/targets" element={<TargetsControl />} />
        <Route path="/settings" element={<Settings />} />
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
            <AppContent />
          </Router>
        </DateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;