import { useEffect } from 'react';
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
}

export function useSupportSocket() {
  const {
    messages, setMessages,
    setIsChatConnected,
    conversations, setConversations,
    isChatLoading: isLoading, setIsChatLoading: setIsLoading,
    activeConversationId, setActiveConversationId,
  } = useStore();

  useEffect(() => {
    setIsChatConnected(false);
    setIsLoading(false);
  }, []);

  const sendMessage = async (_text: string) => {};
  const clearMessages = async (_cnpj: string) => {};
  const markMessagesAsRead = async (_conversationId: string) => {};

  return {
    messages,
    sendMessage,
    clearMessages,
    markMessagesAsRead,
    isConnected: false,
    isLoading,
    activeConversationId,
    conversations
  };
}
