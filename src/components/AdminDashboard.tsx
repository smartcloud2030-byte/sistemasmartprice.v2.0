import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useStore } from '../store';
import {
  ArrowRight, Store, Users, Flag, LayoutGrid, Database,
  Megaphone, ListPlus, AlertTriangle, Clock, LogOut, MessageCircle, Image as ImageIcon, Wallet
} from 'lucide-react';
import { cn } from '../lib/utils';
import { QuickListModal, QuickListItem } from './ui/QuickListModal';
import SystemStats from './SystemStats';
import BackupStatus from './BackupStatus';
import FinanceiroPanel from './FinanceiroPanel';

type QuickListKind = 'stores' | 'suspended' | 'online' | 'flags' | 'paymentPending' | null;

// Curva de ease-out forte (cubic-bezier(0.23, 1, 0.32, 1)) — a padrão do CSS é fraca demais.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
// prefers-reduced-motion: mantém o fade (ajuda a orientar), remove o deslocamento.
const entrance = (delay: number, reduceMotion: boolean | null) => ({
  initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: reduceMotion ? 0.2 : 0.4, ease: EASE_OUT, delay: reduceMotion ? 0 : delay },
});

const AdminDashboard: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const {
    currentUser, allowedStores, layouts, userGroups, flags, products,
    printQueue, setView, setProductModalOpen, setUserModalOpen, setAnnouncementModalOpen,
    setUserManagementTab, setUserManagementSuspendedFilter,
    logout, unreadSupportCount, setSupportChatOpen, clearAccessHistory,
  } = useStore();

  const [quickList, setQuickList] = useState<QuickListKind>(null);
  const [showFinanceiro, setShowFinanceiro] = useState(false);

  const totalStores = allowedStores.length;
  const onlineStores = allowedStores.filter(s => s.isOnline).length;
  const suspendedStores = allowedStores.filter(s => s.isSuspended).length;
  const paymentPendingStores = allowedStores.filter(s => s.isPaymentBlocked).length;

  const recentAccess = [...allowedStores]
    .filter(s => s.lastAccess)
    .sort((a, b) => new Date(b.lastAccess!).getTime() - new Date(a.lastAccess!).getTime())
    .slice(0, 15);

  const openFullManagement = (tab: 'stores' | 'flags' | 'groups' | 'access', suspendedOnly = false) => {
    setQuickList(null);
    setUserManagementSuspendedFilter(suspendedOnly);
    setUserManagementTab(tab);
    setUserModalOpen(true);
  };

  const stats: { label: string; value: number | string; icon: any; color: string; onClick?: () => void }[] = [
    { label: 'Lojas Autorizadas', value: totalStores, icon: Store, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', onClick: () => setQuickList('stores') },
    { label: 'Online Agora', value: onlineStores, icon: Users, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', onClick: () => setQuickList('online') },
    { label: 'Suspensas', value: suspendedStores, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/20', onClick: () => setQuickList('suspended') },
    { label: 'Pendência Pagamento', value: paymentPendingStores, icon: Wallet, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', onClick: () => setQuickList('paymentPending') },
    { label: 'Modelos de Etiquetas', value: layouts.length, icon: LayoutGrid, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Produtos Cadastrados', value: products.length, icon: Database, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', onClick: () => setProductModalOpen(true) },
    { label: 'Bandeiras / Grupos', value: `${flags.length} / ${userGroups.length}`, icon: Flag, color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20', onClick: () => setQuickList('flags') },
  ];

  const suspendedBadge = { text: 'Suspenso', className: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' };
  const onlineBadge = { text: 'Online', className: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' };

  const quickListConfig: Record<Exclude<QuickListKind, null>, {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    items: QuickListItem[];
    emptyText: string;
    footerAction?: { label: string; onClick: () => void };
  }> = {
    stores: {
      title: 'Lojas Autorizadas',
      icon: Store,
      items: allowedStores.map(s => ({
        primary: s.cnpj,
        secondary: s.bandeira,
        badge: s.isSuspended ? suspendedBadge : (s.isOnline ? onlineBadge : undefined),
      })),
      emptyText: 'Nenhuma loja autorizada.',
      footerAction: { label: 'Abrir Gerenciamento Completo', onClick: () => openFullManagement('stores') },
    },
    suspended: {
      title: 'Lojas Suspensas',
      icon: AlertTriangle,
      items: allowedStores.filter(s => s.isSuspended).map(s => ({
        primary: s.cnpj,
        secondary: s.bandeira,
        badge: suspendedBadge,
      })),
      emptyText: 'Nenhuma loja suspensa.',
      footerAction: { label: 'Abrir Gerenciamento Completo', onClick: () => openFullManagement('stores', true) },
    },
    online: {
      title: 'Usuários Online Agora',
      icon: Users,
      items: allowedStores.filter(s => s.isOnline).map(s => ({
        primary: s.cnpj,
        secondary: [s.lastUsername, s.bandeira].filter(Boolean).join(' · '),
        badge: onlineBadge,
      })),
      emptyText: 'Nenhum usuário online no momento.',
      footerAction: { label: 'Abrir Gerenciamento Completo', onClick: () => openFullManagement('access') },
    },
    flags: {
      title: 'Bandeiras Cadastradas',
      icon: Flag,
      items: flags.map(f => ({ primary: f })),
      emptyText: 'Nenhuma bandeira cadastrada.',
      footerAction: { label: 'Abrir Gerenciamento Completo', onClick: () => openFullManagement('flags') },
    },
    paymentPending: {
      title: 'Pendências de Pagamento',
      icon: Wallet,
      items: allowedStores.filter(s => s.isPaymentBlocked).map(s => ({
        primary: s.cnpj,
        secondary: s.bandeira,
        badge: { text: 'Bloqueado', className: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
      })),
      emptyText: 'Nenhuma pendência de pagamento.',
      footerAction: { label: 'Abrir Financeiro', onClick: () => { setQuickList(null); setShowFinanceiro(true); } },
    },
  };

  const actions = [
    { label: 'Gerenciador de Produtos', description: 'Cadastro em massa, upload de imagens', icon: Database, onClick: () => setProductModalOpen(true) },
    { label: 'Gerenciar Usuários', description: 'CNPJs, bandeiras, grupos e acesso', icon: Users, onClick: () => setUserModalOpen(true) },
    { label: 'Comunicados', description: 'Avisos para os usuários', icon: Megaphone, onClick: () => setAnnouncementModalOpen(true) },
    { label: 'Fila de Impressão', description: `${printQueue.length} plaquinhas na fila`, icon: ListPlus, onClick: () => setView('queue') },
    { label: 'SmartGaleria', description: 'Ver, subir e organizar as imagens', icon: ImageIcon, onClick: () => window.open('/gallery', '_blank') },
    { label: 'Financeiro', description: 'Assinaturas e pendências de pagamento', icon: Wallet, onClick: () => setShowFinanceiro(true) },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <motion.div {...entrance(0, shouldReduceMotion)} className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <img src="/logo-light.png" alt="SmartPrice" className="h-7 w-auto dark:hidden" />
            <img src="/logo-dark.png" alt="SmartPrice" className="h-7 w-auto hidden dark:block" />
            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-800" />
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">
                Painel <span className="text-blue-600">Administrativo</span>
              </h1>
              <p className="text-black dark:text-white opacity-60 text-sm font-medium">
                Bem-vindo, {currentUser?.username || 'Admin'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSupportChatOpen(true)}
              className="relative flex items-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold hover:border-blue-500/50 hover:shadow-md transition-all"
              title="Central de Suporte"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadSupportCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold px-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center animate-bounce shadow-lg border-2 border-white dark:border-zinc-900">
                  {unreadSupportCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('editor')}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-tighter shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
            >
              Ir para o Editor
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-red-600 rounded-2xl font-bold hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"
              title="Sair do Sistema"
            >
              <LogOut className="w-5 h-5" />
              Sair
            </button>
          </div>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {stats.map((stat, i) => {
            const Wrapper = stat.onClick ? 'button' : 'div';
            return (
              <motion.div key={stat.label} {...entrance(0.06 + i * 0.04, shouldReduceMotion)}>
                <Wrapper
                  {...(stat.onClick ? { onClick: stat.onClick } : {})}
                  className={cn(
                    'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2 shadow-sm text-left w-full',
                    stat.onClick && 'hover:border-blue-500/50 hover:shadow-md transition-all active:scale-95'
                  )}
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', stat.color)}>
                    <stat.icon className="w-4.5 h-4.5" />
                  </div>
                  <p className="text-2xl font-black text-black dark:text-white tracking-tighter">{stat.value}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{stat.label}</p>
                </Wrapper>
              </motion.div>
            );
          })}
        </div>

        {/* System stats */}
        <motion.div {...entrance(0.3, shouldReduceMotion)}>
          <SystemStats />
        </motion.div>

        {/* Backup status */}
        <motion.div {...entrance(0.34, shouldReduceMotion)}>
          <BackupStatus />
        </motion.div>

        {/* Quick actions */}
        <motion.div {...entrance(0.4, shouldReduceMotion)} className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {actions.map(action => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 hover:shadow-md transition-all text-left"
              >
                <div className="w-11 h-11 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 flex-shrink-0">
                  <action.icon className="w-5 h-5" />
                </div>
                <div className="flex-grow min-w-0">
                  <p className="font-bold text-black dark:text-white">{action.label}</p>
                  <p className="text-xs text-zinc-400 truncate">{action.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </motion.div>

        {/* Recent activity */}
        <motion.div {...entrance(0.46, shouldReduceMotion)} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Últimos Acessos
            </h2>
            {recentAccess.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Limpar todo o histórico de últimos acessos?')) {
                    clearAccessHistory();
                  }
                }}
                className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-red-500 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800 max-h-72 overflow-y-auto custom-scrollbar">
            {recentAccess.length === 0 ? (
              <p className="p-6 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Nenhum acesso registrado</p>
            ) : (
              recentAccess.map(store => (
                <div key={store.cnpj} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', store.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300 dark:bg-zinc-600')} />
                    <div>
                      <p className={cn(
                        "text-sm font-bold",
                        store.lastUsername ? "text-black dark:text-white" : "text-zinc-400 italic font-normal"
                      )}>
                        {store.lastUsername || 'Sem acesso registrado'}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-400">{store.cnpj} · {store.bandeira}</p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 flex-shrink-0">
                    {store.lastAccess
                      ? new Date(store.lastAccess).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {quickList && (
        <QuickListModal
          title={quickListConfig[quickList].title}
          icon={quickListConfig[quickList].icon}
          items={quickListConfig[quickList].items}
          emptyText={quickListConfig[quickList].emptyText}
          footerAction={quickListConfig[quickList].footerAction}
          onClose={() => setQuickList(null)}
        />
      )}

      {showFinanceiro && <FinanceiroPanel onClose={() => setShowFinanceiro(false)} />}
    </div>
  );
};

export default AdminDashboard;
