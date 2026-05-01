import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { signInWithEmail, staffLoaded, loadFailed, error: authError, isAuthenticated, refreshStaff } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authError && !loadFailed) {
      setError(authError);
    }
  }, [authError, loadFailed]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (loadFailed) {
      setError('The system is offline. Please retry the connection before signing in.');
      return;
    }

    if (!staffLoaded) {
      setError('System is still loading. Please wait a moment and try again.');
      return;
    }

    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your username/email and password.');
      return;
    }

    setSubmitting(true);
    const result = await signInWithEmail(identifier.trim(), password);

    if (result.error) {
      setError(result.error);
    } else {
      setMessage('Signing you in…');
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001B47] via-[#0060B8] to-[#007EE0]">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-1">
            Crew Tracker
          </h1>
          <p className="text-sm text-gray-500">
            Sign in with your email or first name
          </p>
        </div>

        {loadFailed ? (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p className="font-bold mb-1">System offline</p>
              <p>The app could not connect to the server. Sign-in is disabled until the connection is restored.</p>
              {authError && (
                <p className="mt-2 font-mono text-xs break-words">{authError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                void refreshStaff();
              }}
              className="w-full py-3 bg-[#001B47] text-white font-bold rounded-lg hover:bg-[#00245F] transition"
            >
              Retry Connection
            </button>
          </div>
        ) : !staffLoaded ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            Loading system...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email or Username
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your email or first name"
                required
                autoComplete="username"
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] focus:border-transparent text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] focus:border-transparent text-gray-900"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-[#001B47] text-white font-bold rounded-lg hover:bg-[#00245F] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>

            <div className="text-center">
              <Link to="/forgot-password" className="text-sm text-gray-500 hover:text-[#001B47] font-medium">
                Forgot password?
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};