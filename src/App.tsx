import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import CanvasPreview from './components/CanvasPreview';
import ProductManager from './components/ProductManager';
import ProductSelector from './components/ProductSelector';
import Adjustments from './components/Adjustments';
import PrintQueue from './components/PrintQueue';
import UserManagement from './components/UserManagement';
import LayoutNamesModal from './components/LayoutNamesModal';
import LayoutManagerModal from './components/LayoutManagerModal';
import AnnouncementManager from './components/AnnouncementManager';
import UserAnnouncementModal from './components/UserAnnouncementModal';
import SupportChat from './components/SupportChat';
import SmartHelpModal from './components/SmartHelpModal';
import LayoutSelectorModal from './components/LayoutSelectorModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './components/Login';
import EncarteCreator from './components/EncarteCreator';
import AdminDashboard from './components/AdminDashboard';
import ChangeCredentialsModal from './components/ChangeCredentialsModal';
import PaymentCheckoutModal from './components/PaymentCheckoutModal';
import {
  Printer, FileDown,
  Settings as SettingsIcon,
  Search, Database, X, ListPlus, LayoutGrid,
  ArrowLeft, LogOut, Users, MessageCircle, AlertTriangle,
  RefreshCw, Layout, Megaphone, Flag, MapPin, Moon, Sun, Image as ImageIcon,
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Toaster } from 'sonner';
import { cn, getProxyUrl } from './lib/utils';
import { useSupportSocket, getSocket } from './hooks/useSupportSocket';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { HeaderDropdown, DropdownItem, DropdownDivider, DropdownLabel } from './components/ui/HeaderDropdown';

import { toast } from 'sonner';

export default function App() {
  const { 
    theme, toggleTheme, textElements1, 
    isProductModalOpen, setProductModalOpen, 
    loadLayout, setPrinting, setSelectedId,
    currentView, setView, addToQueue, printQueue, isPrinting,
    isAuthenticated, logout, userRole, isUserModalOpen, setUserModalOpen, setChangeCredsModalOpen,
    isSupportChatOpen, setSupportChatOpen, unreadSupportCount,
    activeLayoutIndex, layouts, setActiveLayout,
    currentUser, allowedStores, lastLoginTimestamp,
    favoriteLayouts, toggleFavoriteLayout,
    saveUsersAndFlags, saveLayout, loadUsersAndFlags, saveAll,
    updateOnlineStatus, notifyClosingOffline, isChatEnabled,
    announcements, seenAnnouncements, setSeenAnnouncements,
    isAnnouncementModalOpen, setAnnouncementModalOpen,
    orientation
  } = useStore();
  const [activeTab, setActiveTab] = useState<'select' | 'adjustments'>('select');
  const [showPaymentCheckout, setShowPaymentCheckout] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isModelsColumnCollapsed, setIsModelsColumnCollapsed] = useState(false);
  const [expandedBandeiras, setExpandedBandeiras] = useState<Set<string>>(() => {
    const activeBandeira = layouts[activeLayoutIndex]?.bandeira || 'Sem Bandeira';
    return new Set([activeBandeira]);
  });
  const toggleBandeiraExpanded = (bandeira: string) => {
    setExpandedBandeiras((prev) => {
      const next = new Set(prev);
      if (next.has(bandeira)) next.delete(bandeira);
      else next.add(bandeira);
      return next;
    });
  };

  // Safety net: if the last favorite gets removed while the filter is active, turn it off automatically
  useEffect(() => {
    if (showFavoritesOnly && favoriteLayouts.length === 0) {
      setShowFavoritesOnly(false);
    }
  }, [showFavoritesOnly, favoriteLayouts]);
  const [pendingAnnouncements, setPendingAnnouncements] = useState<any[]>([]);
  const [isLayoutModalOpen, setLayoutModalOpen] = useState(false);

  // Filter layouts based on user permissions
  const filteredLayouts = React.useMemo(() => {
    let baseLayouts = layouts.map((l, i) => ({ ...l, originalIndex: i }));

    if (userRole !== 'admin') {
      // Normalize CNPJ for comparison
      const normalizedUserCnpj = currentUser?.cnpj?.replace(/[^\d]/g, '') || '';
      const store = allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === normalizedUserCnpj);
      
      // If no store found or allowedLayouts is undefined/empty, show NOTHING (Total Control)
      if (!store || !store.allowedLayouts || store.allowedLayouts.length === 0) {
        return [];
      }
      
      // Filter by index
      baseLayouts = baseLayouts.filter((_, index) => store.allowedLayouts?.includes(index));
    }

    // Sort by sortOrder
    return baseLayouts.filter((l) => !l.hidden).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [layouts, userRole, currentUser, allowedStores]);

  // Map filtered index back to original index for setActiveLayout
  const handleLayoutSelect = (originalIndex: number) => {
    if (originalIndex !== -1) {
      setActiveLayout(originalIndex);
    }
  };

  // Ensure activeLayoutIndex points to an allowed layout
  React.useEffect(() => {
    // Only perform the strict boundary check if we are authenticated and the user role is confirmed
    // This prevents accidental reset to first layout while the state is still syncing from Supabase
    if (isAuthenticated && userRole && filteredLayouts.length > 0) {
      const isAllowed = filteredLayouts.some(l => l.originalIndex === activeLayoutIndex);
      
      if (!isAllowed) {
        handleLayoutSelect(filteredLayouts[0].originalIndex);
      }
    }
  }, [filteredLayouts, activeLayoutIndex, isAuthenticated, userRole]);

  // Initialize support socket globally for background notifications
  useSupportSocket();

  // Update online status on load and periodically
  useEffect(() => {
    if (isAuthenticated && userRole === 'user') {
      updateOnlineStatus();
      
      // Heartbeat every 5 minutes to keep "Online" status fresh and update last access
      const interval = setInterval(() => {
        updateOnlineStatus();
      }, 5 * 60 * 1000);
      
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, userRole, updateOnlineStatus]);

  // Marca a loja como offline assim que a aba/janela é fechada (ou navegador
  // encerrado), em vez de esperar o próximo acesso pra detectar sessão "presa".
  // pagehide é mais confiável que beforeunload (funciona com bfcache/mobile) e
  // sendBeacon garante o envio mesmo com a página sendo descartada.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'user') return;

    const handlePageHide = () => notifyClosingOffline();
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [isAuthenticated, userRole, notifyClosingOffline]);

  // Logout automático por inatividade — evita loja logar, imprimir e esquecer
  // a aba aberta o dia todo ocupando a vaga do limite de acesso. Avisa 1 min
  // antes (com opção de continuar) pra não cortar ninguém no meio do uso.
  useEffect(() => {
    if (!isAuthenticated || userRole !== 'user') return;

    const IDLE_LOGOUT_MS = 50 * 60 * 1000;
    const IDLE_WARNING_MS = IDLE_LOGOUT_MS - 60 * 1000;

    let lastActivity = Date.now();
    let warned = false;
    let warningToastId: string | number | undefined;

    const resetActivity = () => {
      lastActivity = Date.now();
      if (warned) {
        warned = false;
        if (warningToastId !== undefined) toast.dismiss(warningToastId);
      }
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];
    activityEvents.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));

    const interval = setInterval(() => {
      const idleFor = Date.now() - lastActivity;
      if (idleFor >= IDLE_LOGOUT_MS) {
        if (warningToastId !== undefined) toast.dismiss(warningToastId);
        toast.info('Sessão encerrada por inatividade.');
        logout();
      } else if (idleFor >= IDLE_WARNING_MS && !warned) {
        warned = true;
        warningToastId = toast.warning('Sem uso há um tempo — a sessão vai encerrar em 1 minuto.', {
          duration: 60000,
          action: { label: 'Continuar conectado', onClick: resetActivity },
        });
      }
    }, 5000);

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, resetActivity));
      clearInterval(interval);
      if (warningToastId !== undefined) toast.dismiss(warningToastId);
    };
  }, [isAuthenticated, userRole, logout]);

  // Pre-load background images for all allowed layouts to speed up selection
  useEffect(() => {
    if (filteredLayouts.length > 0) {
      const preloadSet = new Set<string>();

      const preloadImage = (url: string | null) => {
        if (!url || preloadSet.has(url)) return;
        preloadSet.add(url);
        const img = new Image();
        img.src = getProxyUrl(url);
      };

      // 1. Prioritize current layout background
      const current = layouts[activeLayoutIndex];
      if (current?.background?.url) {
        preloadImage(current.background.url);
      }

      // 2. Preload ALL other allowed layouts immediately for maximum speed
      // Use a small delay for sub-priority ones to not block the main thread too much
      const priorityIndices = [activeLayoutIndex];
      
      // Immediately adjacent allowed indices get priority
      const currentIdxInFiltered = filteredLayouts.findIndex(l => l.originalIndex === activeLayoutIndex);
      if (currentIdxInFiltered !== -1) {
        if (currentIdxInFiltered > 0) priorityIndices.push(filteredLayouts[currentIdxInFiltered - 1].originalIndex);
        if (currentIdxInFiltered < filteredLayouts.length - 1) priorityIndices.push(filteredLayouts[currentIdxInFiltered + 1].originalIndex);
      }

      priorityIndices.forEach(idx => {
        if (layouts[idx]?.background?.url) preloadImage(layouts[idx].background.url);
      });

      // Then preload everything else in background
      setTimeout(() => {
        filteredLayouts.forEach(layout => {
          if (!priorityIndices.includes(layout.originalIndex) && layout.background?.url) {
            preloadImage(layout.background.url);
          }
        });
      }, 500);
    }
  }, [filteredLayouts, activeLayoutIndex, layouts]);


  useEffect(() => {
    if (isAuthenticated && userRole !== 'admin' && currentUser) {
      const userCnpj = currentUser?.cnpj?.replace(/[^\d]/g, '') || '';
      const store = allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === userCnpj);
      const userGroupId = store?.groupId;

      const relevantAnnouncements = announcements.filter(ann => {
        if (seenAnnouncements.includes(ann.id)) return false;

        if (ann.targetType === 'all') return true;
        if (ann.targetType === 'group' && ann.targetValue === userGroupId) return true;
        if (ann.targetType === 'cnpj' && ann.targetValue?.replace(/[^\d]/g, '') === userCnpj) return true;

        return false;
      });

      // Only update if the list of relevant announcements has changed
      // This prevents unnecessary re-renders or flickering
      const currentIds = pendingAnnouncements.map(a => a.id).sort().join(',');
      const relevantIds = relevantAnnouncements.map(a => a.id).sort().join(',');
      
      if (currentIds !== relevantIds) {
        setPendingAnnouncements(relevantAnnouncements);
      }
    } else if (pendingAnnouncements.length > 0) {
      setPendingAnnouncements([]);
    }
  }, [isAuthenticated, userRole, announcements, currentUser, allowedStores, seenAnnouncements, pendingAnnouncements]);

  const handleCloseAnnouncements = () => {
    if (pendingAnnouncements.length > 0) {
      setSeenAnnouncements([...seenAnnouncements, ...pendingAnnouncements.map(a => a.id)]);
      setPendingAnnouncements([]);
    }
  };

  useEffect(() => {
    // Only apply session controls to non-admin users
    if (userRole === 'admin') {
      sessionStorage.setItem('smartprice_session_active', 'true');
      return;
    }

    // Force logout on fresh access (new tab/window)
    const sessionActive = sessionStorage.getItem('smartprice_session_active');
    if (!sessionActive) {
      logout();
      sessionStorage.setItem('smartprice_session_active', 'true');
    }

    if (isAuthenticated && lastLoginTimestamp) {
      const SIX_HOURS = 6 * 60 * 60 * 1000;
      
      const checkSession = () => {
        const now = Date.now();
        if (now - lastLoginTimestamp > SIX_HOURS) {
          logout();
        }
      };

      // Check on mount
      checkSession();

      // Check every minute
      const interval = setInterval(checkSession, 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, lastLoginTimestamp, logout, userRole]);

  useEffect(() => {
    loadLayout();
    loadUsersAndFlags();

    const s = getSocket();
    const handleSettingsUpdated = () => loadLayout();
    s.on('settings:updated', handleSettingsUpdated);

    const handleBeforePrint = () => setPrinting(true);
    const handleAfterPrint = () => setPrinting(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      s.off('settings:updated', handleSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const styleId = 'landscape-print-style';
    const activeLayout = layouts[activeLayoutIndex];
    const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
    
    // Use orientation from store, but force portrait for "Quart Suplem Maxi"
    // Keep index 10 as landscape for backward compatibility if needed, but only if not Quart Suplem Maxi
    const isLandscape = !isQuartSuplemMaxi && (orientation === 'landscape' || activeLayoutIndex === 10);

    if (isLandscape) {
      document.body.classList.add('landscape-mode');
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `@media print { @page { size: A4 landscape !important; margin: 0 !important; } }`;
        document.head.appendChild(style);
      }
    } else {
      document.body.classList.remove('landscape-mode');
      const style = document.getElementById(styleId);
      if (style) style.remove();
    }
  }, [activeLayoutIndex, orientation, layouts]);

  useEffect(() => {
    if (isPrinting) {
      document.body.classList.add('is-printing');
    } else {
      document.body.classList.remove('is-printing');
    }
  }, [isPrinting]);

  useEffect(() => {
    const title = unreadSupportCount > 0 
      ? `(${unreadSupportCount}) SmartPrice - Suporte` 
      : 'SmartPrice - Gestão de Etiquetas';
    document.title = title;
  }, [unreadSupportCount]);

  const handlePrint = () => {
    setSelectedId(null);
    setPrinting(true);
    // Automatically trigger print dialog like Ctrl+P
    setTimeout(() => {
      window.print();
      // Keep printing state for a bit so user can see it
    }, 500);
  };

  const confirmPrint = () => {
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  const handleDownloadPDF = async () => {
    const canvasData = (window as any).getCanvasData?.();
    if (!canvasData) return;

    const toastId = toast.loading('Gerando PDF...');

    try {
      const activeLayout = layouts[activeLayoutIndex];
      const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
      const isLandscape = !isQuartSuplemMaxi && (orientation === 'landscape' || activeLayoutIndex === 10);

      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(canvasData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      // Using JPEG for better performance and smaller file size
      pdf.addImage(canvasData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      
      const fileName = `smartprice_placa_${textElements1.name.text.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      pdf.save(fileName);
      toast.success('PDF baixado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF. Tente novamente.', { id: toastId });
    }
  };

  const handleDownloadPNG = () => {
    const canvasData = (window as any).getCanvasPNGData?.();
    if (!canvasData) return;

    const toastId = toast.loading('Baixando PNG...');

    try {
      const link = document.createElement('a');
      const fileName = `smartprice_placa_${textElements1.name.text.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.download = fileName;
      link.href = canvasData;
      link.click();
      toast.success('PNG baixado com sucesso!', { id: toastId });
    } catch (error) {
      console.error('Erro ao gerar PNG:', error);
      toast.error('Erro ao gerar PNG. Tente novamente.', { id: toastId });
    }
  };

  const handleAddToQueue = () => {
    setSelectedId(null);
    const toastId = toast.loading('Adicionando à fila...');
    
    // Small timeout to allow Konva to re-render without the transformer
    setTimeout(() => {
      try {
        const canvasData = (window as any).getCanvasData?.();
        if (!canvasData) {
          toast.error('Erro ao capturar imagem.', { id: toastId });
          return;
        }
        const activeLayout = layouts[activeLayoutIndex];
        const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
        const isLandscape = !isQuartSuplemMaxi && (orientation === 'landscape' || activeLayoutIndex === 10);
        
        addToQueue(canvasData, isLandscape);
        toast.success('Adicionado à fila com sucesso!', { id: toastId });
      } catch (error) {
        console.error('Erro ao adicionar à fila:', error);
        toast.error('Erro ao adicionar à fila.', { id: toastId });
      }
    }, 100);
  };

  const renderContent = () => {
    if (!isAuthenticated) {
      return <Login />;
    }

    // Check for suspension
    if (userRole !== 'admin') {
      const normalizedUserCnpj = currentUser?.cnpj?.replace(/[^\d]/g, '') || '';
      const store = allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === normalizedUserCnpj);
      if (store?.isSuspended) {
        return (
          <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tighter uppercase text-black dark:text-white">Acesso Suspenso</h3>
                <p className="text-black dark:text-white opacity-60 text-sm font-medium leading-relaxed">
                  Este CNPJ (<span className="font-mono font-bold text-red-600">{currentUser?.cnpj}</span>) foi suspenso pelo administrador. 
                  Entre em contato com o suporte para regularizar sua situação.
                </p>
              </div>
              <div className="pt-4 flex flex-col gap-3">
                <button 
                  onClick={() => window.open('https://wa.me/5599984701752', '_blank')}
                  className="w-full py-3 bg-red-600 text-white rounded-2xl font-black uppercase tracking-tighter shadow-xl shadow-red-500/20 hover:bg-red-700 transition-all active:scale-95"
                >
                  Contatar Suporte
                </button>
                <button
                  onClick={logout}
                  className="w-full py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-tighter hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                >
                  Sair do Sistema
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (store?.isPaymentBlocked) {
        return (
          <>
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-8 text-center">
              <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-10 h-10 text-orange-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tighter uppercase text-black dark:text-white">Sistema Indisponível</h3>
                  <p className="text-black dark:text-white opacity-60 text-sm font-medium leading-relaxed">
                    Identificamos uma pendência no pagamento deste CNPJ (<span className="font-mono font-bold text-orange-600">{currentUser?.cnpj}</span>).
                    Por gentileza, atualize sua forma de pagamento para continuar usando o sistema.
                  </p>
                </div>
                <div className="pt-4 flex flex-col gap-3">
                  <button
                    onClick={() => setShowPaymentCheckout(true)}
                    className="w-full py-3 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-tighter shadow-xl shadow-orange-500/20 hover:bg-orange-700 transition-all active:scale-95"
                  >
                    Regularizar Pagamento
                  </button>
                  <button
                    onClick={logout}
                    className="w-full py-3 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-tighter hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-all"
                  >
                    Sair do Sistema
                  </button>
                </div>
              </div>
            </div>
            {showPaymentCheckout && (
              <PaymentCheckoutModal cnpj={currentUser?.cnpj || ''} onClose={() => setShowPaymentCheckout(false)} />
            )}
          </>
        );
      }
    }

    if (currentView === 'dashboard' && userRole === 'admin') {
      return <AdminDashboard />;
    }

    if (currentView === 'queue') {
      return <PrintQueue />;
    }

    if (currentView === 'encarte') {
      return <EncarteCreator />;
    }

    return (
      <div className={cn(
        "bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col",
        isPrinting ? "min-h-screen bg-white p-0 m-0 overflow-visible" : "h-screen overflow-hidden"
      )}>
        {/* Dedicated Print Area for Single Tag */}
        {isPrinting && currentView === 'editor' && (
          <div className="hidden print:block">
            <CanvasPreview id="placa" registerExport={false} />
          </div>
        )}

        {isPrinting && currentView === 'editor' && (
          <div className="fixed inset-0 bg-zinc-100 dark:bg-zinc-950 z-[9999999] overflow-y-auto no-scrollbar no-print">
            <div className="sticky top-0 z-[10000] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setPrinting(false)}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-black tracking-tighter uppercase">Pré-visualização de Impressão</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-black dark:text-white opacity-60 uppercase tracking-widest">Plaquinha Individual A4</span>
                <button 
                  onClick={confirmPrint}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter shadow-lg hover:bg-blue-700 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Confirmar Impressão
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center py-12 px-4 no-print">
              <div className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.1)] w-[210mm] h-[297mm] flex items-center justify-center overflow-hidden border border-zinc-200">
                <CanvasPreview id="placa-preview" />
              </div>
            </div>
          </div>
        )}
        {/* Supabase Config Warning */}
        {!isSupabaseConfigured && !isPrinting && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-wider no-print">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
            <span>Supabase não configurado! Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente do seu domínio.</span>
            <button 
              onClick={() => window.open('https://app.supabase.com', '_blank')}
              className="ml-4 px-3 py-1 bg-white text-amber-600 rounded-md hover:bg-amber-50 transition-colors"
            >
              Configurar Agora
            </button>
          </div>
        )}

        {/* Header */}
        {!isPrinting && (
          <header className="h-16 flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-4 sticky top-0 z-40 no-print">
            <div className="flex items-center gap-3">
              <img src="/logo-light.png" alt="SmartPrice" className="h-5 w-auto dark:hidden" />
              <img src="/logo-dark.png" alt="SmartPrice" className="h-5 w-auto hidden dark:block" />
            </div>

            <div className="flex items-center gap-1.5">
              {/* Dashboard */}
              {userRole === 'admin' && (
                <button
                  onClick={() => setView('dashboard')}
                  className="h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
                  title="Painel Administrativo"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Painel
                </button>
              )}

              {/* Print */}
              <button
                type="button"
                onClick={handlePrint}
                className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Imprimir"
              >
                <Printer className="w-4 h-4" />
              </button>

              {/* Add to Queue */}
              <button
                type="button"
                onClick={handleAddToQueue}
                className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Adicionar à Fila — salva sem sair da tela atual"
              >
                <ListPlus className="w-4 h-4" />
              </button>

              {/* Export */}
              <HeaderDropdown
                trigger={
                  <button
                    type="button"
                    className="h-10 flex items-center gap-1.5 pl-3.5 pr-2.5 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all text-sm font-semibold"
                  >
                    <FileDown className="w-4 h-4" />
                    Exportar
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>
                }
              >
                <DropdownItem icon={<FileDown className="w-4 h-4" />} label="Baixar PDF" onClick={handleDownloadPDF} />
                <DropdownItem icon={<ImageIcon className="w-4 h-4" />} label="Baixar PNG" onClick={handleDownloadPNG} />
              </HeaderDropdown>

              {/* Queue */}
              <button
                onClick={() => setView('queue')}
                className="relative h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
              >
                <LayoutGrid className="w-4 h-4" />
                Fila Inteligente
                {printQueue.length > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {printQueue.length}
                  </span>
                )}
              </button>

              {/* Encarte Online */}
              {(userRole === 'admin' || allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === currentUser?.cnpj?.replace(/[^\d]/g, ''))?.hasEncarteAccess) && (
                <button
                  onClick={() => setView('encarte')}
                  className={cn(
                    'h-10 flex items-center gap-1.5 px-3.5 rounded-xl transition-all text-sm font-semibold',
                    (currentView as string) === 'encarte'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                      : 'bg-white dark:bg-zinc-800 text-emerald-600 border border-emerald-600/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                  )}
                >
                  <Layout className="w-4 h-4" />
                  Encarte
                </button>
              )}

              {/* Product Management (non-admin with permission) */}
              {userRole !== 'admin' && allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === currentUser?.cnpj?.replace(/[^\d]/g, ''))?.hasProductManagementAccess && (
                <button
                  onClick={() => setProductModalOpen(true)}
                  className="h-10 flex items-center gap-1.5 px-3.5 bg-white dark:bg-zinc-800 text-blue-600 border border-blue-600/30 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-sm font-semibold"
                >
                  <Database className="w-4 h-4" />
                  Produtos
                </button>
              )}

              {/* Admin */}
              {userRole === 'admin' && (
                <HeaderDropdown
                  trigger={
                    <button
                      type="button"
                      className="h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
                    >
                      <SettingsIcon className="w-4 h-4" />
                      Administração
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    </button>
                  }
                >
                  <DropdownLabel>Gestão</DropdownLabel>
                  <DropdownItem icon={<Database className="w-4 h-4" />} label="Gerenciador de Produtos" onClick={() => setProductModalOpen(true)} />
                  <DropdownItem icon={<Users className="w-4 h-4" />} label="Gerenciar Usuários" onClick={() => setUserModalOpen(true)} />
                  <DropdownItem icon={<Megaphone className="w-4 h-4" />} label="Comunicados" onClick={() => setAnnouncementModalOpen(true)} />
                  <DropdownDivider />
                  <DropdownItem
                    icon={<Database className="w-4 h-4" />}
                    label="Enviar Modificações"
                    description="Sincroniza alterações com o banco"
                    variant="accent"
                    onClick={async () => {
                      const toastId = toast.loading('Enviando modificações...');
                      try {
                        await saveAll();
                        toast.success('Modificações enviadas com sucesso!', { id: toastId });
                      } catch (error) {
                        toast.error('Erro ao enviar modificações.', { id: toastId });
                      }
                    }}
                  />
                  <DropdownItem
                    icon={<Info className="w-4 h-4" />}
                    label="Info sobre Supabase"
                    onClick={() => {
                      toast.info('O app agora está configurado para usar o Supabase (PostgreSQL na nuvem). Certifique-se de criar as tabelas "products" e "settings" no seu painel do Supabase.');
                    }}
                  />
                </HeaderDropdown>
              )}

              {/* Support (usuário comum usa apenas o botão flutuante) */}
              {userRole === 'admin' && (
                <button
                  onClick={() => {
                    setSupportChatOpen(true);
                    if ("Notification" in window && Notification.permission === "default") {
                      Notification.requestPermission();
                    }
                  }}
                  className="relative h-10 flex items-center gap-1.5 px-3.5 rounded-xl transition-all text-sm font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  title="Central de Suporte"
                >
                  <MessageCircle className="w-4 h-4" />
                  Suporte
                  {unreadSupportCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold px-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center animate-bounce shadow-lg border-2 border-white dark:border-zinc-900">
                      {unreadSupportCount}
                    </span>
                  )}
                </button>
              )}

              {userRole !== 'admin' && (
                <button
                  onClick={() => window.location.reload()}
                  className="h-10 w-10 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Atualizar Página"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={toggleTheme}
                className="h-10 w-10 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

              {/* User menu */}
              <HeaderDropdown
                align="right"
                trigger={
                  <button
                    type="button"
                    className="h-10 flex items-center gap-2 pl-1 pr-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                  >
                    <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase">
                      {currentUser?.username?.slice(0, 2) || '??'}
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60 hidden sm:block" />
                  </button>
                }
              >
                <div className="px-3 py-2">
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">{currentUser?.username}</p>
                  <p className="text-xs text-zinc-500 truncate">{currentUser?.bandeira}</p>
                  {currentUser?.cnpj && (
                    <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400 mt-1">{currentUser.cnpj}</p>
                  )}
                </div>
                <DropdownDivider />
                <DropdownItem icon={<RefreshCw className="w-4 h-4" />} label="Atualizar Página" onClick={() => window.location.reload()} />
                {userRole === 'admin' && (
                  <DropdownItem icon={<KeyRound className="w-4 h-4" />} label="Alterar Usuário e Senha" onClick={() => setChangeCredsModalOpen(true)} />
                )}
                <DropdownItem icon={<LogOut className="w-4 h-4" />} label="Sair do Sistema" variant="danger" onClick={logout} />
              </HeaderDropdown>
            </div>
          </header>
        )}

        {/* Main Content */}
        <main className={cn("flex-grow flex overflow-hidden min-h-0", isPrinting && "overflow-visible")}>
          {/* Left: Preview */}
          <div className={cn(
            "flex-grow relative border-r border-zinc-200 dark:border-zinc-800 print-area overflow-hidden",
            isPrinting && "overflow-visible"
          )}>
            {userRole === 'user' && filteredLayouts.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 dark:bg-zinc-900 z-50 p-8 text-center">
                <div className="max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-10 h-10 text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black tracking-tighter uppercase text-black dark:text-white">Acesso Restrito</h3>
                    <p className="text-black dark:text-white opacity-60 text-sm font-medium leading-relaxed">
                      Sua conta ainda não possui modelos de etiquetas liberados pelo administrador para o CNPJ <span className="font-mono font-bold text-blue-600">{currentUser?.cnpj}</span>.
                    </p>
                    <div className="pt-2 flex flex-col items-center gap-1">
                      <p className="text-[10px] font-black text-black dark:text-white opacity-40 uppercase tracking-widest">Contatos Administrativos:</p>
                      <p className="text-xs font-bold text-blue-600">(99) 9 8470-1752 • (99) 9 8199-0035</p>
                    </div>
                  </div>
                  <div className="pt-4 flex flex-col gap-3">
                    {isChatEnabled && (
                      <button 
                        onClick={() => setSupportChatOpen(true)}
                        className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-tighter shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                      >
                        Contatar Suporte
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <CanvasPreview />
            )}
          </div>

          {/* Middle: Layout/Bandeira Switcher (admin only) */}
          {!isPrinting && userRole === 'admin' && (
            <div
              className={cn(
                "flex-shrink-0 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col no-print transition-all duration-200",
                isModelsColumnCollapsed ? "w-10" : "w-[400px]"
              )}
            >
              <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20 flex items-center justify-between gap-2">
                {!isModelsColumnCollapsed && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1.5 min-w-0">
                    <Layout className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">Modelos por Bandeira</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsModelsColumnCollapsed((v) => !v)}
                  className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex-shrink-0 ml-auto"
                  title={isModelsColumnCollapsed ? "Mostrar modelos" : "Esconder modelos"}
                >
                  <ChevronLeft
                    className={cn(
                      "w-4 h-4 text-zinc-400 transition-transform duration-200",
                      isModelsColumnCollapsed && "rotate-180"
                    )}
                  />
                </button>
              </div>
              {!isModelsColumnCollapsed && (
              <div className="p-3 space-y-2 flex-grow overflow-y-auto min-h-0 custom-scrollbar">
                <button
                  onClick={() => setShowFavoritesOnly(v => !v)}
                  disabled={favoriteLayouts.length === 0 && !showFavoritesOnly}
                  className={cn(
                    "w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                    showFavoritesOnly
                      ? "bg-amber-400 border-amber-400 text-white"
                      : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-amber-600 hover:border-amber-300"
                  )}
                >
                  <Star className="w-3 h-3" fill={showFavoritesOnly ? "currentColor" : "none"} />
                  {showFavoritesOnly ? 'Mostrando só favoritos' : 'Só favoritos'}
                </button>
                <div className="space-y-3">
                  {(() => {
                    const source = showFavoritesOnly
                      ? filteredLayouts.filter((l) => favoriteLayouts.includes(l.originalIndex))
                      : filteredLayouts;

                    const renderLayoutChip = (layout: typeof filteredLayouts[number]) => (
                      <div key={`${layout.name}-${layout.originalIndex}`} className="relative group/chip">
                        <button
                          onMouseEnter={() => {
                            if (layout.background.url) {
                              const img = new Image();
                              img.src = getProxyUrl(layout.background.url);
                            }
                          }}
                          onClick={() => handleLayoutSelect(layout.originalIndex)}
                          className={cn(
                            "w-full py-2 px-0.5 text-[8px] font-black uppercase tracking-tighter rounded-lg border transition-all truncate",
                            activeLayoutIndex === layout.originalIndex
                              ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20"
                              : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-black dark:text-white opacity-60 hover:border-zinc-400"
                          )}
                          title={layout.name}
                        >
                          {layout.name.replace('Modelo ', '')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavoriteLayout(layout.originalIndex); }}
                          className={cn(
                            "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center transition-all shadow-sm",
                            favoriteLayouts.includes(layout.originalIndex)
                              ? "bg-amber-400 text-white opacity-100"
                              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 opacity-0 group-hover/chip:opacity-100"
                          )}
                          title={favoriteLayouts.includes(layout.originalIndex) ? "Remover dos favoritos" : "Marcar como favorito"}
                        >
                          <Star className="w-2.5 h-2.5" fill={favoriteLayouts.includes(layout.originalIndex) ? "currentColor" : "none"} />
                        </button>
                      </div>
                    );

                    return Object.entries(
                      source.reduce((acc, layout) => {
                        const key = layout.bandeira || 'Sem Bandeira';
                        if (!acc[key]) acc[key] = {};
                        const subKey = layout.localidade || 'Geral';
                        if (!acc[key][subKey]) acc[key][subKey] = [];
                        acc[key][subKey].push(layout);
                        return acc;
                      }, {} as Record<string, Record<string, typeof filteredLayouts>>)
                    ).map(([bandeira, localidades]) => {
                      const isExpanded = expandedBandeiras.has(bandeira);
                      const modelCount = Object.values(localidades).reduce((sum, arr) => sum + arr.length, 0);
                      return (
                        <div key={bandeira} className="rounded-lg border border-zinc-100 dark:border-zinc-800/60 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleBandeiraExpanded(bandeira)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-zinc-50/70 dark:bg-zinc-800/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <Flag className="w-3 h-3 text-blue-600 flex-shrink-0" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 truncate">{bandeira}</span>
                              <span className="text-[8px] font-bold text-zinc-400 flex-shrink-0">({modelCount})</span>
                            </span>
                            <ChevronDown
                              className={cn(
                                "w-3.5 h-3.5 text-zinc-400 flex-shrink-0 transition-transform duration-200",
                                isExpanded ? "rotate-0" : "-rotate-90"
                              )}
                            />
                          </button>

                          {isExpanded && (
                            <div className="p-2 space-y-2">
                              {Object.entries(localidades).map(([localidade, layouts]) => (
                                <div key={localidade} className="pl-2 space-y-1">
                                  <div className="flex items-center gap-1 px-1">
                                    <MapPin className="w-2 h-2 text-zinc-400" />
                                    <span className="text-[8px] font-bold uppercase text-zinc-400">{localidade}</span>
                                  </div>
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {layouts.map(renderLayoutChip)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              )}
            </div>
          )}

          {/* Right: Editor Panel */}
          {!isPrinting && (
            <aside className="w-[400px] flex-shrink-0 bg-white dark:bg-zinc-900 flex flex-col no-print">
              {/* Tabs */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setActiveTab('select')}
                  className={cn(
                    "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all",
                    activeTab === 'select'
                      ? "border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10"
                      : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
                  )}
                >
                  <Search className="w-4 h-4" />
                  SELECIONAR
                </button>
                <button
                  onClick={() => setActiveTab('adjustments')}
                  className={cn(
                    "flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 border-b-2 transition-all",
                    activeTab === 'adjustments'
                      ? "border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10"
                      : "border-transparent text-black dark:text-white opacity-60 hover:opacity-100"
                  )}
                >
                  <SettingsIcon className="w-4 h-4" />
                  AJUSTES
                </button>
              </div>

              {/* Layout picker (non-admin only; admin has its own column) */}
              {userRole !== 'admin' && (
                <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                  <button
                    onClick={() => setLayoutModalOpen(true)}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-tighter shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-3"
                  >
                    <Layout className="w-5 h-5" />
                    Modelos Disponíveis
                  </button>
                </div>
              )}

              {/* Tab Content */}
              <div className="flex-grow overflow-y-auto min-h-0 custom-scrollbar">
                {activeTab === 'select' ? <ProductSelector /> : <Adjustments />}
              </div>

              {/* Footer Info */}
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-black dark:text-white opacity-40 text-center uppercase tracking-widest font-bold">
                SistemaSmartPrice v2.0 • Pronto para Impressão A4
              </div>
            </aside>
          )}
        </main>
      </div>
    );
  };

  return (
    <>
      {renderContent()}

      {/* Product Management Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Gerenciar Estoque</h3>
                  <p className="text-xs text-black dark:text-white opacity-60">Cadastre e edite seus produtos para as plaquinhas</p>
                </div>
              </div>
              <button 
                onClick={() => setProductModalOpen(false)} 
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              <ProductManager />
            </div>
          </div>
        </div>
      )}
      {/* User Management Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Gerenciar Usuários</h3>
                  <p className="text-xs text-black dark:text-white opacity-60">Controle quais CNPJs podem acessar o sistema</p>
                </div>
              </div>
              <button 
                onClick={() => setUserModalOpen(false)} 
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              <UserManagement />
            </div>
          </div>
        </div>
      )}
      <LayoutNamesModal />
      <LayoutManagerModal />
      <ChangeCredentialsModal />

      {/* Botão flutuante de suporte (usuário comum) */}
      {isAuthenticated && userRole !== 'admin' && isChatEnabled && !isPrinting && (
        <button
          type="button"
          onClick={() => {
            setSupportChatOpen(!isSupportChatOpen);
            if ("Notification" in window && Notification.permission === "default") {
              Notification.requestPermission();
            }
          }}
          className="fixed bottom-5 left-5 z-50 w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/30 flex items-center justify-center transition-all active:scale-95 no-print"
          title={isSupportChatOpen ? "Fechar chat do suporte" : "Enviar mensagem para o suporte (adicionar produto que está faltando)"}
        >
          {isSupportChatOpen ? <X className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
          {!isSupportChatOpen && unreadSupportCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center animate-bounce shadow-lg border-2 border-white dark:border-zinc-900">
              {unreadSupportCount}
            </span>
          )}
        </button>
      )}

      <ErrorBoundary>
        <SupportChat />
      </ErrorBoundary>
      <SmartHelpModal />

      {/* User Announcement Modal */}
      {pendingAnnouncements.length > 0 && (
        <UserAnnouncementModal 
          announcements={pendingAnnouncements} 
          onClose={handleCloseAnnouncements} 
        />
      )}
      
      {/* Announcement Management Modal */}
      {isAnnouncementModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500 rounded-lg text-white">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Gerenciar Comunicados</h3>
                  <p className="text-xs text-black dark:text-white opacity-60">Envie avisos importantes para os usuários</p>
                </div>
              </div>
              <button 
                onClick={() => setAnnouncementModalOpen(false)} 
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              <AnnouncementManager />
            </div>
          </div>
        </div>
      )}

      {/* Layout Selector Modal for Users */}
      <LayoutSelectorModal 
        isOpen={isLayoutModalOpen}
        onClose={() => setLayoutModalOpen(false)}
        layouts={filteredLayouts}
        onSelect={handleLayoutSelect}
        activeLayoutIndex={activeLayoutIndex}
      />

      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
