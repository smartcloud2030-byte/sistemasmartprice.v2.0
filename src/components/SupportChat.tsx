import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { useSupportSocket, Message } from '../hooks/useSupportSocket';
import { MessageCircle, Send, X, User, Trash2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function SupportChat() {
  const { 
    currentUser, userRole, isSupportChatOpen, setSupportChatOpen,
    setUnreadSupportCount, selectedUserCnpj, setSelectedUserCnpj,
    unreadPerUser, setUnreadPerUser, messages, allowedStores, userGroups
  } = useStore();
  const { sendMessage, clearMessages, markMessagesAsRead, isConnected, isLoading, activeConversationId, conversations } = useSupportSocket();
  const [inputText, setInputText] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(inputText, selectedUserCnpj || undefined);
      setInputText('');
      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (isSupportChatOpen && userRole === 'user') {
      setUnreadSupportCount(0);
    }
  }, [isSupportChatOpen, userRole, setUnreadSupportCount]);

  useEffect(() => {
    if (selectedUserCnpj && userRole === 'admin') {
      const currentUnread = useStore.getState().unreadPerUser[selectedUserCnpj] || 0;
      if (currentUnread > 0) {
        setUnreadSupportCount(prev => Math.max(0, (typeof prev === 'number' ? prev : 0) - currentUnread));
        setUnreadPerUser(selectedUserCnpj, 0);
      }
    }
  }, [selectedUserCnpj, userRole, setUnreadSupportCount, setUnreadPerUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSupportChatOpen, isLoading]);

  useEffect(() => {
    if (isSupportChatOpen && activeConversationId) {
      markMessagesAsRead(activeConversationId);
    }
  }, [isSupportChatOpen, activeConversationId, messages.length]);

  const [confirmClear, setConfirmClear] = useState(false);

  // For admin: get list of all authorized users based on active conversations
  const chatUsers = useMemo(() => {
    if (userRole !== 'admin') return [];
    
    // Group conversations by user_id to avoid duplicates
    const uniqueUsers: Record<string, any> = {};
    
    conversations.forEach(conv => {
      if (!uniqueUsers[conv.user_id] || new Date(conv.updated_at) > new Date(uniqueUsers[conv.user_id].timestamp)) {
        const store = allowedStores.find(s => s.cnpj?.replace(/[^\d]/g, '') === conv.user_id);
        const group = store?.groupId ? userGroups.find(g => g.id === store.groupId) : null;
        
        uniqueUsers[conv.user_id] = {
          cnpj: conv.user_id,
          name: store?.bandeira || conv.user_name || 'Usuário',
          groupName: group?.name,
          lastMessage: 'Conversa ativa',
          timestamp: conv.updated_at,
          unread: unreadPerUser[conv.user_id] || 0
        };
      }
    });

    return Object.values(uniqueUsers).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [conversations, allowedStores, unreadPerUser, userRole]);

  const handleClearChat = () => {
    const target = userRole === 'admin' ? selectedUserCnpj : currentUser?.cnpj;
    if (target) {
      clearMessages(target);
    }
    setConfirmClear(false);
  };

  if (!isSupportChatOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-2 md:p-4 no-print">
      <div className={cn(
        "bg-white dark:bg-zinc-900 w-full rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-zinc-200 dark:border-zinc-800 transition-all duration-300",
        userRole === 'admin' ? "max-w-6xl w-[95vw] h-[85vh]" : "max-w-2xl h-[70vh]"
      )}>
        {/* Header */}
        <div className={cn(
          "border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50",
          userRole === 'admin' ? "p-3 md:p-4" : "p-6"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-500/20",
              userRole === 'admin' ? "p-1.5" : "p-2"
            )}>
              <MessageCircle className={userRole === 'admin' ? "w-5 h-5" : "w-6 h-6"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={cn(
                  "font-black tracking-tighter uppercase text-black dark:text-white",
                  userRole === 'admin' ? "text-base" : "text-xl"
                )}>Suporte SmartPrice</h3>
                <div className={cn(
                  "w-2 h-2 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]",
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                )} />
              </div>
              <p className="text-[9px] font-bold text-black dark:text-white uppercase tracking-widest">
                {userRole === 'admin' ? 'Central de Atendimento' : 'Suporte Online'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setSupportChatOpen(false)} 
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500 dark:text-zinc-400"
          >
            <X className="w-5 h-5 md:w-6 h-6" />
          </button>
        </div>

        {!isConnected && !isLoading && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-amber-500" />
            <p className="text-[10px] text-amber-500 font-medium uppercase tracking-widest">Conectando ao chat...</p>
          </div>
        )}

        <div className="flex-grow flex overflow-hidden">
          {userRole === 'admin' && (
            <div className="w-48 md:w-56 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-y-auto">
              <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Lojas</p>
                <button 
                  onClick={() => window.location.reload()} 
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
                  title="Recarregar"
                >
                  <RefreshCw className="w-3 h-3 text-zinc-400" />
                </button>
              </div>
              {chatUsers.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-[10px] text-black dark:text-white font-medium">Nenhuma loja.</p>
                </div>
              ) : (
                chatUsers.map(user => (
                  <button
                    key={user.cnpj}
                    onClick={() => setSelectedUserCnpj(user.cnpj)}
                    className={cn(
                      "w-full p-3 flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left border-b border-zinc-100 dark:border-zinc-800/50",
                      selectedUserCnpj === user.cnpj && "bg-blue-50 dark:bg-blue-900/10 border-l-4 border-l-blue-600"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="overflow-hidden flex-grow">
                      <div className="flex justify-between items-start">
                        <p className="text-xs font-bold truncate text-black dark:text-white">{user.name}</p>
                        {user.timestamp && !isNaN(new Date(user.timestamp).getTime()) && (
                          <span className="text-[7px] text-zinc-400 dark:text-zinc-500">
                            {new Date(user.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-black dark:text-white truncate opacity-60">{user.cnpj}</p>
                      {user.groupName && (
                        <p className="text-[8px] font-black uppercase tracking-widest text-blue-600 truncate mt-0.5">{user.groupName}</p>
                      )}
                    </div>
                    {unreadPerUser[user.cnpj?.replace(/[^\d]/g, '') || ''] > 0 && (
                      <div className="bg-red-600 text-white text-[10px] font-black px-1.5 min-w-[20px] h-[20px] rounded-full flex items-center justify-center flex-shrink-0 shadow-md ring-2 ring-red-600/20">
                        {unreadPerUser[user.cnpj?.replace(/[^\d]/g, '') || '']}
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Chat Area */}
          <div className="flex-grow flex flex-col bg-white dark:bg-zinc-900 relative">
            {userRole === 'admin' && !selectedUserCnpj ? (
              <div className="flex-grow flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                  <MessageCircle className="w-10 h-10 text-zinc-400" />
                </div>
                <h4 className="text-lg font-bold mb-2 text-black dark:text-white">Selecione uma conversa</h4>
                <p className="text-sm text-black dark:text-white max-w-xs">
                  Escolha um usuário na lista ao lado para visualizar as mensagens e responder.
                </p>
              </div>
            ) : (
              <>
                {/* Messages List */}
                <div 
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="flex-grow overflow-y-auto p-4 space-y-2 bg-[#e5ddd5] dark:bg-zinc-950 relative"
                  style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay' }}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <>
                      <div className="sticky top-0 right-0 z-10 flex justify-end p-2 pointer-events-none">
                        <div className="pointer-events-auto">
                          {confirmClear ? (
                            <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 p-1 rounded-full border border-red-200 dark:border-red-900/30 shadow-lg animate-in fade-in zoom-in duration-200">
                              <span className="text-[8px] font-black uppercase tracking-widest text-red-500 px-2">Encerrar?</span>
                              <button 
                                onClick={handleClearChat}
                                className="px-3 py-1 bg-red-600 text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors"
                              >
                                Sim
                              </button>
                              <button 
                                onClick={() => setConfirmClear(false)}
                                className="px-3 py-1 bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => setConfirmClear(true)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700 rounded-full text-[10px] font-black uppercase tracking-widest text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shadow-sm"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {showScrollButton && (
                        <button 
                          onClick={scrollToBottom}
                          className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-xl animate-bounce flex items-center gap-2"
                        >
                          Novas Mensagens Abaixo
                        </button>
                      )}

                      {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                          <div className="p-4 bg-white/50 dark:bg-zinc-800/50 backdrop-blur-sm rounded-2xl">
                            <AlertCircle className="w-8 h-8 text-blue-600" />
                          </div>
                          <div className="max-w-xs bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm p-4 rounded-2xl">
                            <p className="text-sm font-bold text-black dark:text-white mb-1">Inicie uma conversa</p>
                            <p className="text-xs text-black dark:text-white">
                              {userRole === 'admin' 
                                ? "Envie uma resposta para ajudar o usuário." 
                                : "Descreva o problema ou o produto que está faltando. Nossa equipe responderá em breve."}
                            </p>
                          </div>
                        </div>
                      )}

                      {messages.map((msg, idx) => {
                        const isMe = userRole === 'admin' ? msg.sender_type === 'admin' : msg.sender_type === 'user';
                        const prevMsg = idx > 0 ? messages[idx - 1] : null;
                        const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
                        
                        return (
                          <div 
                            key={msg.id}
                            className={cn(
                              "flex flex-col w-full",
                              isMe ? "items-end" : "items-start",
                              isFirstInGroup ? "mt-4" : "mt-1"
                            )}
                          >
                            <div className={cn(
                              "relative max-w-[85%] px-3 py-1.5 shadow-sm",
                              isMe 
                                ? "bg-[#dcf8c6] dark:bg-emerald-900/40 text-black dark:text-white rounded-lg rounded-tr-none" 
                                : "bg-white dark:bg-zinc-800 text-black dark:text-white rounded-lg rounded-tl-none"
                            )}>
                              {/* Tail */}
                              {isFirstInGroup && (
                                <div className={cn(
                                  "absolute top-0 w-2 h-2",
                                  isMe 
                                    ? "right-[-8px] border-l-[8px] border-l-[#dcf8c6] dark:border-l-emerald-900/40 border-b-[8px] border-b-transparent" 
                                    : "left-[-8px] border-r-[8px] border-r-white dark:border-r-zinc-800 border-b-[8px] border-b-transparent"
                                )} />
                              )}
                              
                              {!isMe && isFirstInGroup && (
                                <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mb-0.5">
                                  {msg.sender_name}
                                </p>
                              )}
                              
                              <div className="flex flex-wrap items-end gap-2">
                                <p className="text-sm leading-relaxed break-words max-w-full text-black dark:text-white">
                                  {msg.text}
                                </p>
                                <div className="flex items-center gap-1 ml-auto pt-1">
                                  <span className="text-[9px] text-black dark:text-white font-medium opacity-60">
                                    {msg.timestamp && !isNaN(new Date(msg.timestamp).getTime()) 
                                      ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                      : '--:--'}
                                  </span>
                                  {isMe && (
                                    <div className="flex items-center -space-x-1">
                                      {msg.pending ? (
                                        <div className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <svg viewBox="0 0 16 15" width="12" height="11" className={cn(msg.read ? "text-blue-500" : "text-zinc-400", "fill-current")}>
                                          <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L5.066 9.879a.32.32 0 0 1-.484.033L1.582 7.13a.32.32 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l3.413 3.274c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z"></path>
                                        </svg>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Input Area */}
                <div className={cn(
                  "border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900",
                  userRole === 'admin' ? "p-2 md:p-3" : "p-4 md:p-6"
                )}>
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Digite sua mensagem..."
                      className="flex-grow bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={isSending || !activeConversationId}
                    />
                    <button
                      type="submit"
                      disabled={!inputText.trim() || isSending || !activeConversationId}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center min-w-[44px]"
                    >
                      {isSending ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
