import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'The app could not render correctly.',
    };
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    localStorage.removeItem('crew_tracker_logged_in_staff_id');
    localStorage.removeItem('crew_tracker_team_id');
    window.location.href = '/login';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-lg text-center">
          <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-3">
            Crew Tracker
          </h1>
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            The app could not render
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            A runtime issue stopped the interface from loading. Reload the app, or reset the local app session and sign in again.
          </p>
          {this.state.message && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
              {this.state.message}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 bg-[#001B47] text-white rounded-md font-bold hover:bg-[#00245F] transition"
            >
              Reload App
            </button>
            <button
              type="button"
              onClick={this.handleResetSession}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md font-bold hover:bg-gray-200 transition"
            >
              Reset Session
            </button>
          </div>
        </div>
      </div>
    );
  }
}