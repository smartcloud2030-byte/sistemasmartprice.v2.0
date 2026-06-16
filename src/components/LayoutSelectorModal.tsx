import React from 'react';
import { useStore, Layout as LayoutType } from '../store';
import { X, Layout as LayoutIcon, Search, Flag, MapPin, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getProxyUrl } from '../lib/utils';

interface LayoutSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  layouts: (LayoutType & { originalIndex: number })[];
  onSelect: (index: number) => void;
  activeLayoutIndex: number;
}

export default function LayoutSelectorModal({ isOpen, onClose, layouts, onSelect, activeLayoutIndex }: LayoutSelectorModalProps) {
  const [searchTerm, setSearchTerm] = React.useState('');

  const groupedLayouts = React.useMemo(() => {
    return layouts.reduce((acc, layout) => {
      const key = layout.bandeira || 'Outros';
      if (!acc[key]) acc[key] = [];
      acc[key].push(layout);
      return acc;
    }, {} as Record<string, typeof layouts>);
  }, [layouts]);

  const filteredGroups = React.useMemo(() => {
    if (!searchTerm) return groupedLayouts;

    const filtered: Record<string, typeof layouts> = {};
    Object.entries(groupedLayouts).forEach(([group, items]) => {
      const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.localidade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredItems.length > 0) {
        filtered[group] = filteredItems;
      }
    });
    return filtered;
  }, [groupedLayouts, searchTerm]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8"
      >
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="bg-white dark:bg-zinc-900 w-full max-w-6xl h-full max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/10"
        >
          {/* Header */}
          <div className="p-6 md:p-8 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                <LayoutIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-black tracking-tighter uppercase text-black dark:text-white">Modelos Disponíveis</h3>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Escolha o melhor layout para sua oferta</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative flex-grow md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black dark:text-white opacity-60" />
                <input 
                  type="text"
                  placeholder="Buscar modelo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-grow overflow-y-auto p-6 md:p-10 space-y-16 custom-scrollbar">
            {Object.entries(filteredGroups).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                  <Search className="w-10 h-10 text-zinc-400" />
                </div>
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Nenhum modelo encontrado para "{searchTerm}"</p>
              </div>
            ) : (
              Object.entries(filteredGroups).map(([group, items]) => (
                <div key={group} className="space-y-8">
                  <div className="flex items-center justify-between border-b-2 border-zinc-100 dark:border-zinc-800 pb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                        <Flag className="w-5 h-5 text-blue-600" />
                      </div>
                      <h4 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">{group}</h4>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black bg-blue-50 dark:bg-blue-900/30 px-4 py-1.5 rounded-full text-blue-600 uppercase tracking-widest">
                        {items.length} {items.length === 1 ? 'Modelo' : 'Modelos'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {items.map((layout) => (
                      <motion.button
                        key={layout.originalIndex}
                        whileHover={{ y: -8, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onMouseEnter={() => {
                          if (layout.background.url) {
                            const img = new Image();
                            img.src = getProxyUrl(layout.background.url);
                          }
                        }}
                        onClick={() => {
                          onSelect(layout.originalIndex);
                          onClose();
                        }}
                        className={cn(
                          "group relative flex flex-col bg-white dark:bg-zinc-800 rounded-[2.5rem] overflow-hidden border-2 transition-all shadow-sm hover:shadow-2xl",
                          activeLayoutIndex === layout.originalIndex 
                            ? "border-blue-600 ring-8 ring-blue-600/5" 
                            : "border-zinc-100 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-800"
                        )}
                      >
                        {/* Preview Image */}
                        <div className="aspect-[16/9] w-full bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden">
                          {layout.background.url ? (
                            <img 
                              src={getProxyUrl(layout.background.url, { thumbnail: true })} 
                              alt={layout.name}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-700 p-8 text-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900">
                              <LayoutIcon className="w-12 h-12 mb-3 opacity-20" />
                              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Prévia Indisponível</span>
                            </div>
                          )}
                          
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                            <div className="flex items-center justify-between text-white">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Clique para</span>
                                <span className="text-sm font-black uppercase tracking-tighter">Usar este modelo</span>
                              </div>
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                                <ChevronRight className="w-6 h-6" />
                              </div>
                            </div>
                          </div>

                          {activeLayoutIndex === layout.originalIndex && (
                            <div className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl border-2 border-white/20">
                              Modelo Atual
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-6 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-black text-base uppercase tracking-tighter text-black dark:text-white leading-tight">
                              {layout.name}
                            </h5>
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {layout.localidade && (
                              <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100 dark:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-400">
                                <MapPin className="w-3 h-3" />
                                <span className="text-[9px] font-black uppercase tracking-widest truncate max-w-[100px]">{layout.localidade}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400">
                              <LayoutIcon className="w-3 h-3" />
                              <span className="text-[9px] font-black uppercase tracking-widest">
                                {layout.hasThirdProduct ? '3 Produtos' : '2 Produtos'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex justify-center">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              SmartPrice • Seleção de Modelos Profissionais
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
