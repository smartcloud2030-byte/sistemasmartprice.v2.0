import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
}

export function useSupportSocket() {
  const { 
    currentUser, userRole, 
    setUnreadSupportCount, setUnreadPerUser,
    messages, setMessages,
    setIsChatConnected, isChatConnected,
    selectedUserCnpj,
    activeConversationId, setActiveConversationId,
    conversations, setConversations,
    isChatLoading: isLoading, setIsChatLoading: setIsLoading,
    isChatEnabled
  } = useStore();

  const activeConversationIdRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const lastPollTimeRef = useRef<string>(new Date().toISOString());

  // Keep ref in sync
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const handleNewMessageNotification = (msg: any) => {
    if (processedMessageIds.current.has(msg.id)) return;
    processedMessageIds.current.add(msg.id);

    const state = useStore.getState();
    const normalizedUserCnpj = currentUser?.cnpj?.replace(/[^\d]/g, '');
    const isFromMe = msg.sender_id === (userRole === 'admin' ? 'admin' : normalizedUserCnpj);
    
    if (isFromMe) return;

    const normalizedSelectedCnpj = state.selectedUserCnpj?.replace(/[^\d]/g, '');
    const isForActiveConversation = activeConversationIdRef.current && String(msg.conversation_id) === String(activeConversationIdRef.current);
    
    if (state.isSupportChatOpen && isForActiveConversation) {
      // Mark as read immediately when a message for the active conversation arrives
      markMessagesAsRead(msg.conversation_id);
    }

    const isFromSelectedUser = userRole === 'admin' && msg.sender_id === normalizedSelectedCnpj;

    // Only notify if it's relevant to the current user
    if (userRole === 'admin') {
      // If it's from a user and either chat is closed or it's not the selected user
      if (!isFromSelectedUser || !state.isSupportChatOpen) {
        setUnreadPerUser(msg.sender_id, prev => (typeof prev === 'number' ? prev + 1 : 1));
        setUnreadSupportCount(prev => (typeof prev === 'number' ? prev + 1 : 1));
        
        toast.info(`Nova mensagem de ${msg.sender_name}`, {
          description: msg.message,
          action: {
            label: 'Ver',
            onClick: () => {
              useStore.getState().setSelectedUserCnpj(msg.sender_id);
              useStore.getState().setSupportChatOpen(true);
            }
          }
        });

        // Browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`SmartPrice: Nova mensagem de ${msg.sender_name}`, {
            body: msg.message,
            icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png'
          });
        }
      }
    } else {
      // For user, if message is from admin and chat is closed
      if (msg.sender_type === 'admin' && !state.isSupportChatOpen) {
        setUnreadSupportCount(prev => (typeof prev === 'number' ? prev + 1 : 1));
        
        toast.success(`Nova mensagem do Suporte`, {
          description: msg.message,
          duration: 5000,
          action: {
            label: 'Ver Agora',
            onClick: () => useStore.getState().setSupportChatOpen(true)
          }
        });

        // Browser notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(`SmartPrice: Nova mensagem do Suporte`, {
            body: msg.message,
            icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png'
          });
        }
      }
    }

    // Play sound for any relevant incoming message
    const isRelevant = (userRole === 'admin' && msg.sender_type === 'user') || (userRole === 'user' && msg.sender_type === 'admin');
    if (isRelevant && (!state.isSupportChatOpen || (userRole === 'admin' && !isFromSelectedUser))) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
      audio.play().catch(() => {});
    }
  };

  const fetchConversations = async () => {
    if (!isSupabaseConfigured || userRole !== 'admin') return;
    
    try {
      const { data, error } = await supabase
        .from('support_conversations')
        .select('*')
        .eq('status', 'open')
        .order('updated_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          console.error('Table support_conversations does not exist');
          toast.error('Tabela support_conversations não encontrada. Execute o SQL de configuração.');
        }
        throw error;
      }
      setConversations(data || []);
    } catch (err) {
      console.error('Error fetching conversations:', err);
    }
  };

  const getOrCreateConversation = async (cnpj: string, name: string) => {
    if (!isSupabaseConfigured) return null;
    
    const normalizedCnpj = cnpj?.replace(/[^\d]/g, '');
    if (!normalizedCnpj) return null;
    
    try {
      // Try to find existing open conversation - take the most recent one
      const { data: existing, error: findError } = await supabase
        .from('support_conversations')
        .select('id')
        .eq('user_id', normalizedCnpj)
        .eq('status', 'open')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (findError) {
        console.error('Error finding conversation:', findError);
      }

      if (existing && existing.length > 0) return existing[0].id;

      // Create new one if not found
      const { data: created, error: createError } = await supabase
        .from('support_conversations')
        .insert({
          user_id: normalizedCnpj,
          user_name: name || 'Usuário',
          status: 'open',
          updated_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle();

      if (createError) {
        console.error('Error creating conversation:', createError);
        if (createError.code === '42P01') {
          toast.error('Tabela support_conversations não encontrada.');
        } else {
          toast.error(`Erro ao iniciar chat: ${createError.message}`);
        }
        return null;
      }
      
      // Refresh conversations list for admin
      if (userRole === 'admin') fetchConversations();
      
      return created?.id || null;
    } catch (err) {
      console.error('Error in getOrCreateConversation:', err);
      return null;
    }
  };

  const fetchMessages = async (conversationId: string, silent = false) => {
    if (!isSupabaseConfigured || !conversationId) return;
    
    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        if (error.code === '42P01' && !silent) {
          toast.error('Tabela support_messages não encontrada.');
        }
        throw error;
      }

      if (data) {
        const mappedMessages: Message[] = data.map(m => ({
          id: m.id,
          conversation_id: m.conversation_id,
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          sender_type: m.sender_type as 'user' | 'admin',
          text: m.message,
          timestamp: m.created_at,
          read: m.is_read || false
        }));
        
        // Only update if there are changes to avoid unnecessary re-renders
        const currentMessages = useStore.getState().messages;
        if (JSON.stringify(mappedMessages) !== JSON.stringify(currentMessages)) {
          // If we have new messages that weren't in the state before
          if (currentMessages.length > 0 && mappedMessages.length > currentMessages.length) {
            const newMessages = mappedMessages.slice(currentMessages.length);
            newMessages.forEach(msg => {
              handleNewMessageNotification({
                id: msg.id,
                conversation_id: msg.conversation_id,
                sender_id: msg.sender_id,
                sender_name: msg.sender_name,
                sender_type: msg.sender_type,
                message: msg.text,
                created_at: msg.timestamp
              });
            });
          }
          setMessages(mappedMessages);
        }
      }
    } catch (err) {
      if (!silent) console.error('Error fetching messages:', err);
    }
  };

  const { isSupportChatOpen } = useStore();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Polling mechanism for "always online" feel
  useEffect(() => {
    if (!isSupabaseConfigured || !currentUser || (!isChatEnabled && userRole !== 'admin')) return;

    // Faster polling: 500ms when open, 3s when closed
    const pollInterval = isSupportChatOpen ? 500 : 3000;
    
    const interval = setInterval(async () => {
      try {
        if (!isMountedRef.current) return;

        // Refresh conversations for admin
        if (userRole === 'admin') {
          await fetchConversations().catch(() => {});
          
          // Admin: Poll for ANY new messages from users across all conversations
          try {
            const { data: newMsgs } = await supabase
              .from('support_messages')
              .select('*')
              .eq('sender_type', 'user')
              .gt('created_at', lastPollTimeRef.current)
              .order('created_at', { ascending: true });
            
            if (newMsgs && newMsgs.length > 0) {
              newMsgs.forEach(msg => handleNewMessageNotification(msg));
              lastPollTimeRef.current = newMsgs[newMsgs.length - 1].created_at;
            }
          } catch (err) {
            // Silent fail for polling
          }
        } else {
          // User: Poll for ANY new messages from admin for this user
          try {
            const userCnpj = currentUser?.cnpj?.replace(/[^\d]/g, '');
            const { data: newMsgs } = await supabase
              .from('support_messages')
              .select('*, support_conversations!inner(user_id)')
              .eq('sender_type', 'admin')
              .eq('support_conversations.user_id', userCnpj)
              .gt('created_at', lastPollTimeRef.current)
              .order('created_at', { ascending: true });

            if (newMsgs && newMsgs.length > 0) {
              newMsgs.forEach(msg => handleNewMessageNotification(msg));
              lastPollTimeRef.current = newMsgs[newMsgs.length - 1].created_at;
            }
          } catch (err) {
            // Silent fail for polling
          }
        }

        // Refresh messages for active conversation
        if (activeConversationIdRef.current) {
          await fetchMessages(activeConversationIdRef.current, true).catch(() => {});
        }
      } catch (err) {
        // Global interval error catch
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [isSupportChatOpen, userRole, currentUser, isSupabaseConfigured, isChatEnabled]);

  useEffect(() => {
    if (!currentUser || !isSupabaseConfigured || (!isChatEnabled && userRole !== 'admin')) return;

    const initChat = async () => {
      setIsLoading(true);
      
      try {
        if (userRole === 'admin') {
          await fetchConversations().catch(() => {});
          if (selectedUserCnpj) {
            const convId = await getOrCreateConversation(selectedUserCnpj, selectedUserCnpj);
            if (convId && isMountedRef.current) {
              setActiveConversationId(convId);
              activeConversationIdRef.current = convId;
              await fetchMessages(convId).catch(() => {});
            }
          } else {
            if (isMountedRef.current) {
              setActiveConversationId(null);
              activeConversationIdRef.current = null;
              setMessages([]);
            }
          }
        } else {
          const convId = await getOrCreateConversation(currentUser.cnpj, currentUser.username);
          if (convId && isMountedRef.current) {
            setActiveConversationId(convId);
            activeConversationIdRef.current = convId;
            await fetchMessages(convId).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Error in initChat:', err);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsChatConnected(true);
        }
      }
    };

    initChat();

    const channel = supabase
      .channel('support_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_messages' },
        async (payload: any) => {
          if (payload.event === 'INSERT') {
            const newMessage = payload.new;
            
            if (userRole === 'admin') {
              fetchConversations();
            }

            const isForActiveConversation = activeConversationIdRef.current && String(newMessage.conversation_id) === String(activeConversationIdRef.current);
            
            // For admin, we also want to handle messages from the selected user even if the conversation ID changed
            const normalizedSelectedCnpj = useStore.getState().selectedUserCnpj?.replace(/[^\d]/g, '');
            const isFromSelectedUser = userRole === 'admin' && normalizedSelectedCnpj && newMessage.sender_id === normalizedSelectedCnpj;

            // For user, if message is from admin, check if it's for them
            let isForMe = false;
            if (userRole !== 'admin' && newMessage.sender_type === 'admin') {
              if (isForActiveConversation) {
                isForMe = true;
              } else {
                // Verify if this conversation belongs to the user
                try {
                  const { data: conv } = await supabase
                    .from('support_conversations')
                    .select('user_id')
                    .eq('id', newMessage.conversation_id)
                    .single();
                  
                  if (conv && conv.user_id === currentUser?.cnpj?.replace(/[^\d]/g, '')) {
                    isForMe = true;
                    // Switch to this conversation
                    setActiveConversationId(newMessage.conversation_id);
                    activeConversationIdRef.current = newMessage.conversation_id;
                    await fetchMessages(newMessage.conversation_id);
                    handleNewMessageNotification(newMessage);
                    return;
                  }
                } catch (err) {
                  console.error('Error verifying conversation for user:', err);
                }
              }
            }

            if (isForActiveConversation || isFromSelectedUser || isForMe) {
              // If it's from the selected user (admin view) but a different conversation ID, switch to it
              if (isFromSelectedUser && !isForActiveConversation) {
                setActiveConversationId(newMessage.conversation_id);
                activeConversationIdRef.current = newMessage.conversation_id;
                fetchMessages(newMessage.conversation_id);
                return;
              }

              const mappedMessage: Message = {
                id: newMessage.id,
                conversation_id: newMessage.conversation_id,
                sender_id: newMessage.sender_id,
                sender_name: newMessage.sender_name,
                sender_type: newMessage.sender_type as 'user' | 'admin',
                text: newMessage.message,
                timestamp: newMessage.created_at,
                read: newMessage.is_read || false
              };

              setMessages(prev => {
                if (prev.some(existing => existing.id === mappedMessage.id)) return prev;
                return [...prev, mappedMessage];
              });
            }

            handleNewMessageNotification(newMessage);
          } else if (payload.event === 'UPDATE') {
            const updatedMessage = payload.new;
            console.log('Message updated:', updatedMessage.id, 'is_read:', updatedMessage.is_read);
            setMessages(prev => prev.map(m => 
              m.id === updatedMessage.id 
                ? { ...m, read: updatedMessage.is_read || false } 
                : m
            ));
          } else if (payload.event === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        (payload: any) => {
          if (userRole === 'admin') {
            fetchConversations();
          } else if (payload.new && payload.new.user_id === currentUser?.cnpj?.replace(/[^\d]/g, '')) {
            // If a conversation for this user was updated or created
            if (payload.new.status === 'open' && String(payload.new.id) !== String(activeConversationIdRef.current)) {
              setActiveConversationId(payload.new.id);
              activeConversationIdRef.current = payload.new.id;
              fetchMessages(payload.new.id);
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (err && !err.message.includes('mismatch')) {
          console.warn('Supabase subscription error:', err.message);
        }
        if (status === 'SUBSCRIBED' && isMountedRef.current) setIsChatConnected(true);
      });

    return () => {
      try {
        if (channel) {
          supabase.removeChannel(channel).catch(() => {});
        }
      } catch (e) {
        // Ignore removal errors
      }
    };
  }, [currentUser?.cnpj, userRole, selectedUserCnpj, isChatEnabled]); // Re-init when user, selection or chat status changes

  const markMessagesAsRead = async (conversationId: string) => {
    if (!isSupabaseConfigured || !conversationId) return;
    
    try {
      const senderTypeToMark = userRole === 'admin' ? 'user' : 'admin';
      
      // First check if there are actually unread messages to avoid unnecessary updates
      const { data: unreadCount } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', senderTypeToMark)
        .eq('is_read', false);

      const { error } = await supabase
        .from('support_messages')
        .update({ is_read: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', senderTypeToMark)
        .eq('is_read', false);

      if (error) {
        console.error('Error marking messages as read:', error);
      } else {
        // Update local state immediately for better UX
        setMessages(prev => prev.map(m => 
          m.conversation_id === conversationId && m.sender_type === senderTypeToMark 
            ? { ...m, read: true } 
            : m
        ));
        
        // Update unread counts
        if (userRole === 'admin') {
          const normalizedSelectedCnpj = selectedUserCnpj?.replace(/[^\d]/g, '');
          if (normalizedSelectedCnpj) {
            setUnreadPerUser(normalizedSelectedCnpj, 0);
          }
        } else {
          setUnreadSupportCount(0);
        }
      }
    } catch (err) {
      console.error('Exception in markMessagesAsRead:', err);
    }
  };

  const sendMessage = async (text: string, toCnpj?: string) => {
    if (!isSupabaseConfigured || !currentUser || !activeConversationId) {
      if (!activeConversationId) {
        toast.error('Chat não inicializado. Tente recarregar a página.');
        console.error('Cannot send message: activeConversationId is null');
      }
      return;
    }

    const tempId = `temp-${crypto.randomUUID()}`;
    const senderId = userRole === 'admin' ? 'admin' : currentUser?.cnpj?.replace(/[^\d]/g, '') || '';
    const tempMsg: Message = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: senderId,
      sender_name: currentUser.username || 'Usuário',
      sender_type: userRole as 'user' | 'admin',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      pending: true
    };

    // Optimistic update
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          conversation_id: activeConversationId,
          sender_id: senderId,
          sender_name: tempMsg.sender_name,
          sender_type: tempMsg.sender_type,
          message: text.trim()
        })
        .select()
        .maybeSingle();

      if (error) {
        console.error('Supabase error sending message:', error);
        throw error;
      }
      
      if (data) {
        const realMsg: Message = {
          id: data.id,
          conversation_id: data.conversation_id,
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          sender_type: data.sender_type as 'user' | 'admin',
          text: data.message,
          timestamp: data.created_at,
          read: data.is_read || false
        };

        setMessages(prev => {
          // If Realtime already added it, just remove temp
          if (prev.some(m => m.id === realMsg.id)) {
            return prev.filter(m => m.id !== tempId);
          }
          // Otherwise replace temp with real
          return prev.map(m => m.id === tempId ? realMsg : m);
        });
      }

      // Update conversation updated_at
      await supabase
        .from('support_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeConversationId);

      if (userRole === 'admin') fetchConversations();
    } catch (err) {
      // Rollback on error
      setMessages(prev => prev.filter(m => m.id !== tempId));
      console.error('Error sending message:', err);
      toast.error('Erro ao enviar mensagem');
    }
  };

  const clearMessages = async (cnpj: string) => {
    // In the new structure, we might just close the conversation
    if (!isSupabaseConfigured || !activeConversationId) return;
    
    try {
      const { error } = await supabase
        .from('support_conversations')
        .update({ status: 'closed' })
        .eq('id', activeConversationId);

      if (error) throw error;
      
      setMessages([]);
      setActiveConversationId(null);
      toast.success('Conversa encerrada');
    } catch (err) {
      console.error('Error closing conversation:', err);
    }
  };

  return { 
    messages, 
    sendMessage, 
    clearMessages, 
    markMessagesAsRead,
    isConnected: isChatConnected,
    isLoading,
    activeConversationId,
    conversations
  };
}

