import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useStore } from '../store';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_type: 'user' | 'admin';
  text: string;
  timestamp: string;
  pending?: boolean;
  read?: boolean;
  attachment_url?: string;
  attachment_type?: string;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io/', transports: ['websocket', 'polling'] });
  }
  return socket;
}

// Em desenvolvimento, o Vite recria este módulo a cada hot-reload, o que
// zeraria a variável `socket` acima e abandonaria a conexão antiga aberta
// (ela continua recebendo eventos do servidor, causando mensagens duplicadas).
// Fechamos explicitamente a conexão anterior antes do módulo ser substituído.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    socket?.disconnect();
    socket = null;
  });
}

export function useSupportSocket() {
  const {
    currentUser, userRole,
    messages, setMessages,
    isChatConnected, setIsChatConnected,
    conversations, setConversations,
    isChatLoading, setIsChatLoading,
    activeConversationId, setActiveConversationId,
    selectedUserCnpj,
    setUnreadSupportCount, setUnreadPerUser,
  } = useStore();

  const [typingOther, setTypingOther] = useState(false);
  const typingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentUser || !userRole) return;
    const s = getSocket();

    const onConnect = () => {
      setIsChatConnected(true);
      setIsChatLoading(true);
      s.emit('user:join', {
        cnpj: currentUser.cnpj,
        username: currentUser.username,
        role: userRole,
        bandeira: currentUser.bandeira,
      });
    };
    const onDisconnect = () => setIsChatConnected(false);

    const onHistory = (payload: { conversationId: string; cnpj?: string; messages: Message[] }) => {
      setMessages(payload.messages);
      setActiveConversationId(payload.conversationId);
      setIsChatLoading(false);

      if (userRole !== 'admin') {
        const unread = payload.messages.filter(m => m.sender_type === 'admin' && !m.read).length;
        setUnreadSupportCount(unread);
      }
    };

    const onConversationList = (payload: { conversations: any[] }) => {
      setConversations(payload.conversations);
      let total = 0;
      payload.conversations.forEach((c: any) => {
        setUnreadPerUser(c.user_id, c.unread_count || 0);
        total += c.unread_count || 0;
      });
      setUnreadSupportCount(total);
      setIsChatLoading(false);
    };

    const onReceive = (payload: { cnpj: string; message: Message }) => {
      const state = useStore.getState();
      const isViewingThisConv = state.userRole === 'admin'
        ? state.selectedUserCnpj === payload.cnpj
        : true;
      const isChatOpen = state.isSupportChatOpen;
      const isFromOther = state.userRole === 'admin'
        ? payload.message.sender_type === 'user'
        : payload.message.sender_type === 'admin';

      // Protege contra entrega duplicada (ex.: conexões antigas ainda vivas
      // durante hot-reload em desenvolvimento) ignorando IDs já conhecidos.
      const isDuplicate = state.messages.some((m: Message) => m.id === payload.message.id);
      if (isDuplicate) return;

      if (isViewingThisConv) {
        setMessages(prev => [...prev, payload.message]);
      }

      if (isFromOther && (!isViewingThisConv || !isChatOpen)) {
        setUnreadSupportCount(prev => (typeof prev === 'number' ? prev : 0) + 1);
        if (state.userRole === 'admin') {
          setUnreadPerUser(payload.cnpj, (prev) => (typeof prev === 'number' ? prev : 0) + 1);
        }
      }

      if (state.userRole === 'admin') {
        setConversations((prev: any[]) => {
          const idx = prev.findIndex((c) => c.user_id === payload.cnpj);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], updated_at: payload.message.timestamp };
          return updated;
        });
      }
    };

    const onReadReceipt = (payload: { cnpj: string; readerType: 'user' | 'admin' }) => {
      setMessages(prev => prev.map((m: Message) => {
        const shouldMark = payload.readerType === 'admin' ? m.sender_type === 'user' : m.sender_type === 'admin';
        return shouldMark ? { ...m, read: true } : m;
      }));
    };

    const onCleared = (payload: { cnpj: string }) => {
      const state = useStore.getState();
      const isViewingThisConv = state.userRole === 'admin' ? state.selectedUserCnpj === payload.cnpj : true;
      if (isViewingThisConv) setMessages([]);
    };

    const onActivityUpdate = (payload: { cnpj: string; isOnline?: boolean; lastAccess?: string; lastUsername?: string }) => {
      useStore.setState((s) => ({
        allowedStores: s.allowedStores.map(store =>
          store.cnpj?.replace(/[^\d]/g, '') === payload.cnpj
            ? { ...store, isOnline: payload.isOnline, lastAccess: payload.lastAccess, lastUsername: payload.lastUsername }
            : store
        ),
      }));
    };

    const onActivityReplaced = (payload: { value: Record<string, { isOnline?: boolean; lastAccess?: string; lastUsername?: string }> }) => {
      useStore.setState((s) => ({
        allowedStores: s.allowedStores.map(store => {
          const nc = store.cnpj?.replace(/[^\d]/g, '') || '';
          const act = payload.value?.[nc];
          return { ...store, isOnline: act?.isOnline, lastAccess: act?.lastAccess, lastUsername: act?.lastUsername };
        }),
      }));
    };

    const onTypingUpdate = (payload: { cnpj: string; role: 'user' | 'admin'; isTyping: boolean }) => {
      const state = useStore.getState();
      const isRelevant = state.userRole === 'admin'
        ? state.selectedUserCnpj === payload.cnpj && payload.role === 'user'
        : payload.role === 'admin';
      if (!isRelevant) return;

      setTypingOther(payload.isTyping);
      if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
      if (payload.isTyping) {
        typingClearTimerRef.current = setTimeout(() => setTypingOther(false), 4000);
      }
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('message:history', onHistory);
    s.on('conversation:list', onConversationList);
    s.on('message:receive', onReceive);
    s.on('message:read_receipt', onReadReceipt);
    s.on('message:cleared', onCleared);
    s.on('typing:update', onTypingUpdate);
    s.on('activity:update', onActivityUpdate);
    s.on('activity:replaced', onActivityReplaced);

    // Comandos remotos disparados pelo admin em Gerenciar Usuários → Status de
    // Acesso (só chegam pra quem está na sala cnpj_*, então nunca afetam o
    // próprio admin).
    const onForceLogout = () => {
      toast.info('Sua sessão foi encerrada pelo administrador.');
      useStore.getState().logout();
    };
    const onForceReload = () => {
      window.location.reload();
    };
    s.on('session:force_logout', onForceLogout);
    s.on('session:force_reload', onForceReload);

    if (s.connected) onConnect();

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('message:history', onHistory);
      s.off('conversation:list', onConversationList);
      s.off('message:receive', onReceive);
      s.off('message:read_receipt', onReadReceipt);
      s.off('message:cleared', onCleared);
      s.off('typing:update', onTypingUpdate);
      s.off('activity:update', onActivityUpdate);
      s.off('activity:replaced', onActivityReplaced);
      s.off('session:force_logout', onForceLogout);
      s.off('session:force_reload', onForceReload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.cnpj, userRole]);

  useEffect(() => {
    if (userRole === 'admin' && selectedUserCnpj) {
      setIsChatLoading(true);
      setMessages([]);
      setActiveConversationId(null);
      setTypingOther(false);
      getSocket().emit('conversation:open', { cnpj: selectedUserCnpj });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserCnpj, userRole]);

  const sendMessage = async (text: string, targetCnpj?: string, attachment?: { url: string; type: string }) => {
    const cnpj = userRole === 'admin' ? targetCnpj : currentUser?.cnpj;
    if (!cnpj) return;
    getSocket().emit('message:send', {
      cnpj: cnpj.replace(/[^\d]/g, ''),
      text,
      attachmentUrl: attachment?.url,
      attachmentType: attachment?.type,
    });
  };

  const clearMessages = async (cnpj: string) => {
    getSocket().emit('message:clear', { cnpj: cnpj.replace(/[^\d]/g, '') });
  };

  const markMessagesAsRead = async (_conversationId: string) => {
    const cnpj = userRole === 'admin' ? selectedUserCnpj : currentUser?.cnpj;
    if (!cnpj) return;
    getSocket().emit('message:read', { cnpj: cnpj.replace(/[^\d]/g, '') });
  };

  const sendTyping = (isTyping: boolean) => {
    const cnpj = userRole === 'admin' ? selectedUserCnpj : currentUser?.cnpj;
    if (!cnpj) return;
    getSocket().emit('typing:update', { cnpj: cnpj.replace(/[^\d]/g, ''), isTyping });
  };

  // Admin: desconectar ou forçar atualização da página de um CNPJ específico.
  const forceLogoutUser = (cnpj: string) => {
    getSocket().emit('admin:force_logout', { cnpj: cnpj.replace(/[^\d]/g, '') });
  };
  const forceReloadUser = (cnpj: string) => {
    getSocket().emit('admin:force_reload', { cnpj: cnpj.replace(/[^\d]/g, '') });
  };

  return {
    messages,
    sendMessage,
    clearMessages,
    markMessagesAsRead,
    sendTyping,
    forceLogoutUser,
    forceReloadUser,
    typingOther,
    isConnected: isChatConnected,
    isLoading: isChatLoading,
    activeConversationId,
    conversations,
  };
}
