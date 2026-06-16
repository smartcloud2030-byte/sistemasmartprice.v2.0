import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign WebSocket errors from Vite/Environment
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    const msg = args[0]?.toString() || '';
    if (msg.includes('[vite] failed to connect to websocket') || 
        msg.includes('WebSocket connection to') || 
        msg.includes('WebSocket closed without opened') ||
        msg.includes('mismatch between server and client bindings')) {
      return;
    }
    originalError(...args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.toString() || '';
    if (reason.includes('WebSocket closed without opened') || 
        reason.includes('[vite]') ||
        reason.includes('mismatch between server and client bindings')) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
