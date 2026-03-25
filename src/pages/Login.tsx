import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, staffLoaded } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!staffLoaded) {
      setError('System is still loading. Please wait a moment and try again.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    
    if (isSignUp) {
      const result = await signUpWithEmail(email.trim(), password.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setMessage('Account created successfully! You can now sign in.');
        setIsSignUp(false);
      }
    } else {
      const result = await signInWithEmail(email.trim(), password.trim());
      if (result.error) {
        setError(result.error);
      }
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
            {isSignUp ? 'Create a new account' : 'Sign in to your account'}
          </p>
        </div>

        {!staffLoaded ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            Loading system...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoComplete="email"
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
                placeholder="Enter your password"
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
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
              {submitting ? (isSignUp ? 'Signing up…' : 'Signing in…') : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>

            <div className="flex flex-col space-y-3 text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                  setMessage(null);
                }}
                className="text-sm text-[#001B47] hover:underline font-medium"
              >
                {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
              </button>
              
              {!isSignUp && (
                <Link 
                  to="/forgot-password" 
                  className="text-sm text-gray-500 hover:text-[#001B47] hover:underline font-medium"
                >
                  Forgot Password?
                </Link>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};