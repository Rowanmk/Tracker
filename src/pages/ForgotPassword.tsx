import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ForgotPassword: React.FC = () => {
  const { getSecurityQuestion, resetPasswordWithSecurityAnswer } = useAuth();
  const navigate = useNavigate();
  
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetchQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    const result = await getSecurityQuestion(username);
    if (result.error) {
      setError(result.error);
    } else if (result.question) {
      setQuestion(result.question);
      setStep(2);
    }
    setLoading(false);
  };

  const handleVerifyAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) {
      setError('Please provide an answer.');
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setLoading(true);
    const result = await resetPasswordWithSecurityAnswer(username, answer, newPassword);
    
    if (result.error) {
      setError(result.error);
    } else {
      alert('Password reset successfully! You can now log in.');
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#001B47] via-[#0060B8] to-[#007EE0]">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-1">
            Reset Password
          </h1>
          <p className="text-sm text-gray-500">
            {step === 1 && "Enter your username to begin"}
            {step === 2 && "Answer your security question"}
            {step === 3 && "Set your new password"}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleFetchQuestion} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your first name"
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] text-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#001B47] text-white font-bold rounded-lg hover:bg-[#00245F] transition disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyAnswer} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1">
                Security Question
              </label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 font-medium mb-4">
                {question}
              </div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Your Answer
              </label>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your answer"
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] text-gray-900"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-[#001B47] text-white font-bold rounded-lg hover:bg-[#00245F] transition"
            >
              Verify Answer
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
                autoFocus
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#001B47] text-gray-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#001B47] text-white font-bold rounded-lg hover:bg-[#00245F] transition disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-gray-500 hover:text-[#001B47] font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};