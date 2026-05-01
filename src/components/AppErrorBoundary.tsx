import React from 'react';

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
  stack: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
    stack: '',
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'The app could not render correctly.',
      stack: error instanceof Error && error.stack ? error.stack : '',
    };
  }

  componentDidCatch(error: unknown) {
    if (error instanceof Error) {
      this.setState({
        hasError: true,
        message: error.message,
        stack: error.stack || '',
      });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetSession = () => {
    try {
      localStorage.removeItem('crew_tracker_logged_in_staff_id');
      localStorage.removeItem('crew_tracker_team_id');
    } catch {
      return;
    }
    window.location.href = '/login';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-2xl">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-[#001B47] tracking-wide mb-3">
              Crew Tracker
            </h1>
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              The app could not render
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              A runtime issue stopped the interface from loading. Reload the app, or reset the local app session and sign in again.
            </p>
          </div>

          {this.state.message && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">
              <div className="font-bold mb-1">Error:</div>
              <div className="font-mono text-xs break-words">{this.state.message}</div>
            </div>
          )}

          {this.state.stack && (
            <details className="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left">
              <summary className="text-xs font-bold text-gray-700 cursor-pointer">
                Show technical details
              </summary>
              <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                {this.state.stack}
              </pre>
            </details>
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