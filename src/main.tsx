import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

const renderFatal = (message: string) => {
  if (!rootElement) {
    document.body.innerHTML =
      '<div style="padding:24px;font-family:system-ui,sans-serif;color:#111;">' +
      'The app could not start and the root element is missing.</div>';
    return;
  }
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:system-ui,sans-serif;padding:16px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;max-width:560px;width:100%;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.08);">
        <h1 style="color:#001B47;font-size:28px;font-weight:800;margin:0 0 8px;">Crew Tracker</h1>
        <h2 style="color:#111827;font-size:18px;font-weight:700;margin:0 0 12px;">The app could not start</h2>
        <p style="color:#4b5563;font-size:14px;margin:0 0 16px;white-space:pre-wrap;text-align:left;">${message}</p>
        <button onclick="window.location.reload()" style="background:#001B47;color:#fff;font-weight:700;padding:8px 16px;border-radius:6px;border:none;cursor:pointer;">Reload</button>
      </div>
    </div>
  `;
};

if (!rootElement) {
  document.body.innerHTML =
    '<div style="padding:24px;font-family:system-ui,sans-serif;color:#111;">Root element not found.</div>';
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred while starting the app.';
    renderFatal(message);
  }
}