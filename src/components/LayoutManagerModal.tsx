import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  X, Layout as LayoutIcon, Search, Flag, MapPin, Wand2, Upload,
  Trash2, AlertTriangle, Pencil, Save, Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, getProxyUrl, extractGalleryPath } from '../lib/utils';

const GALLERY_PASSWORD = import.meta.env.VITE_GALLERY_PASSWORD || 'smartprice@admin2026';

function slugifyCategory(value: string): string {
  return value
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

async function uploadBackgroundImage(file: File, category: string): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/gallery/upload/${category}`, {
    method: 'POST',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload');
  }
  return res.json();
}

// Modal experimental ("Layout") que reúne, numa única tela: criação/edição de modelo
// (nome, grupo, localidade, imagem A4, espelhar estilo de outro modelo) e a lista dos
// modelos já criados, com exclusão completa (imagem + estilo).
export default function LayoutManagerModal() {
  const {
    isLayoutManagerModalOpen, setLayoutManagerModalOpen,
    layouts, flags,
    addLayout, deleteLayout,
    setLayoutName, setLayoutBandeira, setLayoutLocalidade, setLayoutBackground,
    applyLayoutFormatting,
  } = useStore();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [bandeira, setBandeira] = useState('');
  const [localidade, setLocalidade] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [styleSourceIndex, setStyleSourceIndex] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uniqueLocalidades = useMemo(() => Array.from(
    new Set(layouts.map((l) => l.localidade).filter((v): v is string => !!v && v.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b)), [layouts]);

  if (!isLayoutManagerModalOpen) return null;

  const resetForm = () => {
    setEditingIndex(null);
    setName('');
    setBandeira('');
    setLocalidade('');
    setBackgroundUrl(null);
    setStyleSourceIndex('');
  };

  const loadForEditing = (index: number) => {
    const l = layouts[index];
    if (!l) return;
    setEditingIndex(index);
    setName(l.name || '');
    setBandeira(l.bandeira || '');
    setLocalidade(l.localidade || '');
    setBackgroundUrl(l.background?.url ?? null);
    setStyleSourceIndex('');
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return; }

    setIsUploading(true);
    try {
      const category = `layout-${slugifyCategory(bandeira || 'geral') || 'geral'}`;
      const { url } = await uploadBackgroundImage(file, category);
      setBackgroundUrl(url);
      toast.success('Imagem enviada! Clique em Salvar Modelo para confirmar.');
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload da imagem.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Digite um nome para o modelo.'); return; }

    const index = editingIndex === null ? addLayout(name, bandeira || undefined, localidade || undefined) : editingIndex;
    if (editingIndex !== null) {
      setLayoutName(index, name);
      setLayoutBandeira(index, bandeira);
      setLayoutLocalidade(index, localidade);
    }
    setLayoutBackground(index, backgroundUrl);
    if (styleSourceIndex) {
      applyLayoutFormatting(index, parseInt(styleSourceIndex, 10));
    }

    toast.success(editingIndex === null ? 'Modelo criado com sucesso!' : 'Modelo salvo com sucesso!');
    resetForm();
  };

  const handleDelete = async (index: number) => {
    setIsDeleting(true);
    const layout = layouts[index];
    try {
      const path = extractGalleryPath(layout?.background?.url);
      if (path) {
        await fetch(`/gallery/delete/${path}`, { method: 'DELETE', headers: { 'x-gallery-token': GALLERY_PASSWORD } });
      }
    } catch {
      toast.error('Falha ao remover a imagem da galeria, mas o modelo será excluído mesmo assim.');
    } finally {
      deleteLayout(index);
      resetForm();
      setDeleteConfirmIndex(null);
      setIsDeleting(false);
      toast.success('Modelo excluído por completo (imagem e estilo removidos).');
    }
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
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <LayoutIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tighter uppercase text-black dark:text-white">Layout</h3>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{layouts.length} modelos cadastrados • criar, editar e excluir em uma só tela</p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); setLayoutManagerModalOpen(false); }}
            className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-hidden flex flex-col md:flex-row min-h-0">
          {/* Form */}
          <div className="w-full md:w-[340px] flex-shrink-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 p-5 space-y-4 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-black dark:text-white">
                {editingIndex === null ? 'Novo Modelo' : `Editando: ${layouts[editingIndex]?.name || ''}`}
              </p>
              {editingIndex !== null && (
                <button
                  onClick={resetForm}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase text-red-500 hover:text-red-600"
                  title="Cancelar edição e voltar para criar um novo modelo"
                >
                  <X className="w-3 h-3" /> Cancelar
                </button>
              )}
            </div>

            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Nome do Modelo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Oferta Semana PL"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-1">
                  <Flag className="w-2.5 h-2.5" /> Grupo
                </label>
                <select
                  value={bandeira}
                  onChange={(e) => setBandeira(e.target.value)}
                  className="w-full px-2 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecionar...</option>
                  {flags.map((flag) => (
                    <option key={flag} value={flag}>{flag}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-1">
                  <MapPin className="w-2.5 h-2.5" /> Localização
                </label>
                <select
                  value={localidade}
                  onChange={(e) => setLocalidade(e.target.value)}
                  className="w-full px-2 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecionar...</option>
                  {localidade && !uniqueLocalidades.includes(localidade) && (
                    <option value={localidade}>{localidade} (nova)</option>
                  )}
                  {uniqueLocalidades.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Imagem de Fundo (A4)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelected}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-widest hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {backgroundUrl ? 'Trocar Imagem' : 'Enviar Imagem'}
                  </>
                )}
              </button>
              {backgroundUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-9 h-12 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                    <img src={getProxyUrl(backgroundUrl, { thumbnail: true })} className="w-full h-full object-cover" alt="Fundo selecionado" />
                  </div>
                  <p className="text-[10px] text-zinc-400">Fundo deste modelo</p>
                </div>
              )}
            </div>

            <div className="h-px bg-zinc-200 dark:bg-zinc-700" />

            <div>
              <label className="text-[10px] font-medium mb-1 flex items-center gap-1"><Wand2 className="w-3 h-3" /> Estilo (espelhar de outro modelo)</label>
              <p className="text-[9px] text-zinc-400 -mt-0.5 mb-1.5">Copia o alinhamento de nome, descrição e preço de um modelo já pronto para este, sem mexer no fundo ou no nome.</p>
              <select
                value={styleSourceIndex}
                onChange={(e) => setStyleSourceIndex(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
              >
                <option value="">Nenhum (manter estilo atual)</option>
                {layouts.map((l, i) => (
                  i !== editingIndex && (
                    <option key={i} value={i}>{l.name || `Modelo ${i + 1}`}</option>
                  )
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              <Save className="w-4 h-4" />
              Salvar Modelo
            </button>
          </div>

          {/* Existing models list */}
          <div className="flex-grow flex flex-col min-h-0">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar modelo por nome, grupo ou localização..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
              </div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                {searchTerm.trim()
                  ? `${filteredIndexed.length} de ${layouts.length} modelos`
                  : `${layouts.length} modelos no total`}
              </p>
            </div>
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
              {filteredIndexed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                  <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                    <Search className="w-10 h-10 text-zinc-400" />
                  </div>
                  <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Nenhum modelo encontrado</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredIndexed.map(({ layout, index }) => (
                    <div
                      key={index}
                      className={cn(
                        "rounded-2xl border overflow-hidden bg-zinc-50 dark:bg-zinc-800/50 transition-all",
                        editingIndex === index ? "border-blue-500 ring-1 ring-blue-500" : "border-zinc-200 dark:border-zinc-700"
                      )}
                    >
                      <div className="aspect-[210/297] bg-zinc-200 dark:bg-zinc-900 flex items-center justify-center overflow-hidden">
                        {layout.background?.url ? (
                          <img
                            src={getProxyUrl(layout.background.url, { thumbnail: true })}
                            alt={layout.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <ImageIcon className="w-8 h-8 text-zinc-400" />
                        )}
                      </div>
                      <div className="p-2.5 space-y-1">
                        <p className="text-[11px] font-bold text-black dark:text-white truncate" title={layout.name}>{layout.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {layout.bandeira && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">{layout.bandeira}</span>
                          )}
                          {layout.localidade && (
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500 bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded">{layout.localidade}</span>
                          )}
                        </div>
                        <div className="flex gap-1 pt-1">
                          <button
                            onClick={() => loadForEditing(index)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Editar
                          </button>
                          <button
                            onClick={() => setDeleteConfirmIndex(index)}
                            className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Excluir modelo completo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Excluir Modelo Completo</h3>
            </div>
            <p className="text-sm text-black dark:text-white opacity-60">
              Isso vai apagar permanentemente "{layouts[deleteConfirmIndex]?.name}": nome, grupo, localização, imagem de fundo (removida da galeria) e o estilo configurado. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmIndex(null)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-bold text-black dark:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmIndex)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50"
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
