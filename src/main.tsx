import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { toast } from 'sonner';
import { useStore } from './store';
import { configurarSessaoCliente, instalarRenovacaoDeSessao } from './lib/sessaoCliente';

configurarSessaoCliente({
  obterUsuario: () => {
    const s = useStore.getState();
    if (!s.isAuthenticated || !s.currentUser || !s.userRole) return null;
    return {
      papel: s.userRole === 'admin' ? 'admin' : 'loja',
      cnpj: (s.currentUser.cnpj || '').replace(/[^\d]/g, ''),
      username: s.currentUser.username,
    };
  },
  // Sem chamar logout(): ele fala com a API, que já recusou a sessão.
  aoPerderSessao: (motivo) => {
    toast.error(motivo);
    useStore.setState({ isAuthenticated: false, userRole: null, currentUser: null, lastLoginTimestamp: null });
  },
});
instalarRenovacaoDeSessao();

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
