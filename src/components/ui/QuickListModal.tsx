import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface QuickListItem {
  primary: string;
  secondary?: string;
  badge?: { text: string; className: string };
}

interface QuickListModalProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: QuickListItem[];
  emptyText: string;
  onClose: () => void;
  footerAction?: { label: string; onClick: () => void };
}

export function QuickListModal({ title, icon: Icon, items, emptyText, onClose, footerAction }: QuickListModalProps) {
  const [search, setSearch] = useState('');

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return item.primary.toLowerCase().includes(term) || item.secondary?.toLowerCase().includes(term);
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-lg max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-black dark:text-white uppercase tracking-tighter">{title}</h3>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest">{items.length} {items.length === 1 ? 'item' : 'itens'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-transparent rounded-xl text-sm focus:bg-white dark:focus:bg-zinc-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-black dark:text-white"
            />
          </div>
        </div>

        <div className="flex-grow overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800 custom-scrollbar">
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">{emptyText}</p>
          ) : (
            filtered.map((item, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-bold text-sm text-black dark:text-white truncate">{item.primary}</p>
                  {item.secondary && <p className="text-xs text-zinc-400 truncate">{item.secondary}</p>}
                </div>
                {item.badge && (
                  <span className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full flex-shrink-0', item.badge.className)}>
                    {item.badge.text}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {footerAction && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              onClick={footerAction.onClick}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-black uppercase tracking-tighter text-sm hover:bg-blue-700 transition-all active:scale-95"
            >
              {footerAction.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
