import React, { useState } from 'react';
import { useStore, createDefaultLayout } from '../store';
import { X, Layout as LayoutIcon, Search, Flag, MapPin, ChevronUp, ChevronDown, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export default function LayoutNamesModal() {
  const {
    isLayoutNamesModalOpen, setLayoutNamesModalOpen,
    layouts, activeLayoutIndex, flags,
    setLayoutName, setLayoutBandeira, setLayoutLocalidade,
    reorderLayouts, setLayoutHasThirdProduct,
  } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [creatingLocalidadeFor, setCreatingLocalidadeFor] = useState<number | null>(null);
  const [newLocalidadeValue, setNewLocalidadeValue] = useState('');

  if (!isLayoutNamesModalOpen) return null;

  const uniqueLocalidades = Array.from(
    new Set(layouts.map((l) => l.localidade).filter((v): v is string => !!v && v.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b));

  const confirmNewLocalidade = (index: number) => {
    if (newLocalidadeValue.trim()) {
      setLayoutLocalidade(index, newLocalidadeValue.trim());
    }
    setCreatingLocalidadeFor(null);
    setNewLocalidadeValue('');
  };

  const cancelNewLocalidade = () => {
    setCreatingLocalidadeFor(null);
    setNewLocalidadeValue('');
  };

  const handleReset = () => {
    useStore.setState((state) => ({
      layouts: Array.from({ length: 150 }, (_, i) => {
        const defaultNames: Record<number, string> = {
          0: 'QUARTA FRALDA PL',
          1: 'SABADÃO PL',
          2: 'QUI KIDS PL',
          3: 'DERMO PL',
          4: 'MARONBA',
          20: 'Padrão Ultra'
        };
        return createDefaultLayout(defaultNames[i] || `Modelo ${i + 1}`, i);
      })
    }));
    useStore.getState().saveLayout();
    toast.success('Modelos resetados com sucesso!');
    setShowResetConfirm(false);
  };

  const filteredIndexed = layouts
    .map((layout, index) => ({ layout, index }))
    .filter(({ layout }) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        layout.name?.toLowerCase().includes(term) ||
        layout.bandeira?.toLowerCase().includes(term) ||
        layout.localidade?.toLowerCase().includes(term)
      );
    });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-7xl h-full max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <LayoutIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tighter uppercase text-black dark:text-white">Nomes dos Modelos</h3>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{layouts.length} modelos cadastrados</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-grow md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar nome, bandeira ou localidade..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="text-[10px] font-bold text-black dark:text-white opacity-40 hover:opacity-100 uppercase tracking-widest transition-colors whitespace-nowrap"
            >
              Resetar Modelos
            </button>
            <button
              onClick={() => setLayoutNamesModalOpen(false)}
              className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
          {filteredIndexed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                <Search className="w-10 h-10 text-zinc-400" />
              </div>
              <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Nenhum modelo encontrado para "{searchTerm}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredIndexed.map(({ layout, index }) => (
                <div key={index} className={cn(
                  "space-y-2 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border transition-all",
                  index === activeLayoutIndex
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500"
                    : "border-zinc-200 dark:border-zinc-700"
                )}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-black uppercase tracking-tighter text-black dark:text-white opacity-60">Modelo {index + 1}</label>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => reorderLayouts(index, index - 1)}
                          disabled={index === 0}
                          className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded disabled:opacity-20"
                          title="Mover para cima"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => reorderLayouts(index, index + 1)}
                          disabled={index === layouts.length - 1}
                          className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded disabled:opacity-20"
                          title="Mover para baixo"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setLayoutHasThirdProduct(index, !layout.hasThirdProduct)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        layout.hasThirdProduct ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20" : "text-black dark:text-white opacity-40 bg-zinc-100 dark:bg-zinc-800"
                      )}
                      title={layout.hasThirdProduct ? "Desativar 3º Produto" : "Ativar 3º Produto"}
                    >
                      <LayoutIcon className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-0.5">Nome</label>
                      <input
                        type="text"
                        value={layout.name}
                        onChange={(e) => setLayoutName(index, e.target.value)}
                        className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[11px] font-bold text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-0.5">
                          <Flag className="w-2 h-2" /> Bandeira
                        </label>
                        <select
                          value={layout.bandeira || ''}
                          onChange={(e) => setLayoutBandeira(index, e.target.value)}
                          className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[11px] font-bold text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Selecionar...</option>
                          {layout.bandeira && !flags.includes(layout.bandeira) && (
                            <option value={layout.bandeira}>{layout.bandeira} (atual)</option>
                          )}
                          {flags.map((flag) => (
                            <option key={flag} value={flag}>{flag}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-0.5">
                          <MapPin className="w-2 h-2" /> Localidade
                        </label>
                        {creatingLocalidadeFor === index ? (
                          <div className="flex gap-1">
                            <input
                              autoFocus
                              type="text"
                              value={newLocalidadeValue}
                              onChange={(e) => setNewLocalidadeValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmNewLocalidade(index);
                                if (e.key === 'Escape') cancelNewLocalidade();
                              }}
                              placeholder="Nova localidade..."
                              className="w-full min-w-0 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-blue-400 rounded text-[11px] font-bold text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => confirmNewLocalidade(index)}
                              className="flex-shrink-0 p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                              title="Confirmar"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={cancelNewLocalidade}
                              className="flex-shrink-0 p-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-500 rounded hover:bg-zinc-300 dark:hover:bg-zinc-600"
                              title="Cancelar"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <select
                            value={layout.localidade || ''}
                            onChange={(e) => {
                              if (e.target.value === '__new__') {
                                setCreatingLocalidadeFor(index);
                                setNewLocalidadeValue('');
                              } else {
                                setLayoutLocalidade(index, e.target.value);
                              }
                            }}
                            className="w-full px-2 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[11px] font-bold text-black dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Selecionar...</option>
                            {layout.localidade && !uniqueLocalidades.includes(layout.localidade) && (
                              <option value={layout.localidade}>{layout.localidade} (atual)</option>
                            )}
                            {uniqueLocalidades.map((loc) => (
                              <option key={loc} value={loc}>{loc}</option>
                            ))}
                            <option value="__new__">+ Nova localidade...</option>
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Resetar Modelos</h3>
            </div>
            <p className="text-sm text-black dark:text-white opacity-60">
              Deseja resetar todos os modelos para o padrão? Isso apagará permanentemente as customizações de nomes e posições.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold"
              >
                Resetar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
