import React from 'react';
import { Announcement } from '../store';
import { Megaphone, X, Calendar, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserAnnouncementModalProps {
  announcements: Announcement[];
  onClose: () => void;
}

export default function UserAnnouncementModal({ announcements, onClose }: UserAnnouncementModalProps) {
  if (announcements.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 no-print">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white dark:bg-zinc-900 w-full max-w-2xl max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-amber-100 dark:border-amber-900/30"
      >
        {/* Header */}
        <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/30 animate-bounce">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white uppercase">
                Comunicados Importantes
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-400 font-bold uppercase tracking-widest opacity-80">
                Avisos da Administração
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/50 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-8 space-y-6">
          {announcements.map((ann, index) => (
            <div 
              key={ann.id}
              className="relative group bg-zinc-50 dark:bg-zinc-800/50 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-700 hover:border-amber-500/50 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  <Calendar className="w-3 h-3" />
                  {new Date(ann.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                {index === 0 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full animate-pulse">
                    Novo
                  </span>
                )}
              </div>
              
              <h4 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 group-hover:text-amber-600 transition-colors">
                {ann.title}
              </h4>
              
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-sm whitespace-pre-wrap">
                {ann.message}
              </p>

              <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                <ChevronRight className="w-3 h-3" />
                Mensagem do Sistema
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-center">
          <button
            onClick={onClose}
            className="px-12 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            Entendido, fechar avisos
          </button>
        </div>
      </motion.div>
    </div>
  );
}
