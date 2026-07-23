import React, { useMemo, useRef, useState } from 'react';
import { useStore, Layout } from '../store';
import {
  X, Layout as LayoutIcon, Search, Flag, MapPin, Wand2, Upload,
  Trash2, AlertTriangle, Pencil, Save, Image as ImageIcon, FlaskConical, ArrowUpCircle,
  Images, FolderOpen, ArrowLeft, RectangleVertical, RectangleHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, getProxyUrl } from '../lib/utils';
import { GALLERY_PASSWORD, slugifyCategory, uploadBackgroundImage, deleteGalleryImage } from '../lib/gallery';
import CriarEstiloModal from './CriarEstiloModal';

// Modal experimental ("Layout") que reúne, numa única tela: criação/edição de modelo
// (nome, grupo, localidade, imagem A4, espelhar estilo de outro modelo) e a lista dos
// modelos já criados, com exclusão completa (imagem + estilo).
export default function LayoutManagerModal() {
  const {
    isLayoutManagerModalOpen, setLayoutManagerModalOpen,
    layouts, flags,
    addLayout, deleteLayout,
    setLayoutName, setLayoutBandeira, setLayoutLocalidade, setLayoutBackground, setLayoutOrientation,
    applyLayoutFormatting, applyTestStyleToLayout,
    testLayouts, deleteTestLayout, promoteTestLayout, ensureTestLayoutId,
  } = useStore();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [bandeira, setBandeira] = useState('');
  const [localidade, setLocalidade] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [styleSourceIndex, setStyleSourceIndex] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [criarEstiloTarget, setCriarEstiloTarget] = useState<{ index: number; layout: Layout } | 'new' | null>(null);
  const [deleteTestConfirmIndex, setDeleteTestConfirmIndex] = useState<number | null>(null);
  const [isDeletingTest, setIsDeletingTest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);
  const [galleryFolders, setGalleryFolders] = useState<string[]>([]);
  const [selectedGalleryFolder, setSelectedGalleryFolder] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<any[]>([]);
  const [isLoadingGalleryFolders, setIsLoadingGalleryFolders] = useState(false);
  const [isLoadingGalleryImages, setIsLoadingGalleryImages] = useState(false);

  const uniqueLocalidades = useMemo(() => Array.from(
    new Set(layouts.map((l) => l.localidade).filter((v): v is string => !!v && v.trim().length > 0))
  ).sort((a, b) => a.localeCompare(b)), [layouts]);

  // Estilos de teste salvos antes do campo `id` existir precisam de um id
  // estável para poderem ser espelhados/editados — garante isso ao abrir.
  React.useEffect(() => {
    if (!isLayoutManagerModalOpen) return;
    testLayouts.forEach((l, i) => { if (!l.id) ensureTestLayoutId(i); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLayoutManagerModalOpen]);

  if (!isLayoutManagerModalOpen) return null;

  const resetForm = () => {
    setEditingIndex(null);
    setName('');
    setBandeira('');
    setLocalidade('');
    setBackgroundUrl(null);
    setOrientation('portrait');
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
    setOrientation(l.orientation || 'portrait');
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

  const openGalleryPicker = async () => {
    setIsGalleryPickerOpen(true);
    setSelectedGalleryFolder(null);
    setGalleryImages([]);
    setIsLoadingGalleryFolders(true);
    try {
      const res = await fetch('/gallery/categories?all=1', { headers: { 'x-gallery-token': GALLERY_PASSWORD } });
      const data = await res.json();
      const folders = Array.isArray(data) ? data.filter((f: string) => f.toLowerCase().startsWith('layout')) : [];
      setGalleryFolders(folders);
    } catch {
      toast.error('Falha ao carregar pastas da galeria.');
    } finally {
      setIsLoadingGalleryFolders(false);
    }
  };

  const openGalleryFolder = async (folder: string) => {
    setSelectedGalleryFolder(folder);
    setIsLoadingGalleryImages(true);
    try {
      const res = await fetch(`/gallery/list/${folder}`, { headers: { 'x-gallery-token': GALLERY_PASSWORD } });
      const data = await res.json();
      setGalleryImages(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Falha ao carregar imagens da pasta.');
    } finally {
      setIsLoadingGalleryImages(false);
    }
  };

  const selectGalleryImage = (url: string) => {
    setBackgroundUrl(url);
    setIsGalleryPickerOpen(false);
    toast.success('Imagem selecionada! Clique em Salvar Modelo para confirmar.');
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Digite um nome para o modelo.'); return; }

    const isCreating = editingIndex === null;
    const index = isCreating ? addLayout(name, bandeira || undefined, localidade || undefined) : editingIndex;
    if (editingIndex !== null) {
      setLayoutName(index, name);
      setLayoutBandeira(index, bandeira);
      setLayoutLocalidade(index, localidade);
    }
    setLayoutBackground(index, backgroundUrl);
    setLayoutOrientation(index, orientation);
    if (styleSourceIndex.startsWith('test:')) {
      applyTestStyleToLayout(index, styleSourceIndex.slice('test:'.length));
    } else if (styleSourceIndex) {
      // addLayout empurra todo mundo um índice pra frente (modelo novo entra em
      // primeiro), então o índice escolhido no dropdown antes de salvar ficou defasado.
      const sourceIndex = parseInt(styleSourceIndex, 10) + (isCreating ? 1 : 0);
      applyLayoutFormatting(index, sourceIndex);
    }

    toast.success(editingIndex === null ? 'Modelo criado com sucesso!' : 'Modelo salvo com sucesso!');
    resetForm();
  };

  const handleDelete = async (index: number) => {
    setIsDeleting(true);
    const layout = layouts[index];
    try {
      await deleteGalleryImage(layout?.background?.url);
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

            <button
              type="button"
              onClick={() => setCriarEstiloTarget('new')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest hover:bg-amber-50/60 dark:hover:bg-amber-900/20 transition-colors"
              title="Monta um estilo do zero numa folha A4 com réguas, sem espelhar nenhum modelo pronto"
            >
              <FlaskConical className="w-3.5 h-3.5" />
              Criar Estilo (Teste)
            </button>

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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openGalleryPicker}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border-2 border-dashed border-purple-400 dark:border-purple-700 text-purple-700 dark:text-purple-300 text-[10px] font-bold uppercase tracking-widest hover:bg-purple-50/60 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Escolher imagem já enviada na SmartGaleria"
                >
                  <Images className="w-4 h-4" />
                  SmartGaleria
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border-2 border-dashed border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Enviar imagem do computador"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {isUploading ? 'Enviando...' : 'Do Computador'}
                </button>
              </div>
              {backgroundUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-9 h-12 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                    <img src={getProxyUrl(backgroundUrl, { thumbnail: true })} className="w-full h-full object-cover" alt="Fundo selecionado" />
                  </div>
                  <p className="text-[10px] text-zinc-400">Fundo deste modelo</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Orientação da Plaquinha</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors',
                    orientation === 'portrait'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-blue-400'
                  )}
                >
                  <RectangleVertical className="w-3.5 h-3.5" /> Vertical
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-colors',
                    orientation === 'landscape'
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-blue-400'
                  )}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" /> Horizontal
                </button>
              </div>
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
                {testLayouts.length > 0 && (
                  <optgroup label="Estilos de Teste">
                    {testLayouts.map((l, i) => (
                      <option key={l.id || `test-${i}`} value={`test:${l.id || ''}`}>
                        🧪 {l.name || `Estilo ${i + 1}`}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Modelos Oficiais">
                  {layouts.map((l, i) => (
                    i !== editingIndex && (
                      <option key={i} value={i}>{l.name || `Modelo ${i + 1}`}</option>
                    )
                  ))}
                </optgroup>
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
              {testLayouts.length > 0 && (
                <div className="mb-5 pb-5 border-b border-dashed border-amber-300 dark:border-amber-800">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-3">
                    <FlaskConical className="w-3 h-3" /> Meus Estilos (Teste) • {testLayouts.length}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {testLayouts.map((layout, index) => (
                      <div key={index} className="rounded-2xl border border-dashed border-amber-400 dark:border-amber-700 overflow-hidden bg-amber-50/50 dark:bg-amber-900/10">
                        <div className={cn(
                          "bg-zinc-200 dark:bg-zinc-900 flex items-center justify-center",
                          layout.orientation === 'landscape' ? "aspect-[297/210]" : "aspect-[210/297]"
                        )}>
                          <ImageIcon className="w-8 h-8 text-zinc-400" />
                        </div>
                        <div className="p-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-black dark:text-white truncate" title={layout.name}>{layout.name}</p>
                          <div className="flex gap-1 pt-1">
                            <button
                              onClick={() => {
                                const id = layout.id || ensureTestLayoutId(index);
                                setCriarEstiloTarget({ index, layout: { ...layout, id } });
                              }}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                              title="Editar este estilo"
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </button>
                            <button
                              onClick={() => { promoteTestLayout(index); toast.success('Estilo movido para os modelos oficiais!'); }}
                              className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                              title="Tornar este estilo um modelo oficial"
                            >
                              <ArrowUpCircle className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeleteTestConfirmIndex(index)}
                              className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              title="Excluir estilo de teste"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                      <div className={cn(
                        "bg-zinc-200 dark:bg-zinc-900 flex items-center justify-center overflow-hidden",
                        layout.orientation === 'landscape' ? "aspect-[297/210]" : "aspect-[210/297]"
                      )}>
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

      {deleteTestConfirmIndex !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Excluir Estilo de Teste</h3>
            </div>
            <p className="text-sm text-black dark:text-white opacity-60">
              Isso vai apagar permanentemente o estilo de teste "{testLayouts[deleteTestConfirmIndex]?.name}" (e o guia enviado na galeria, se houver). Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteTestConfirmIndex(null)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-bold text-black dark:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setIsDeletingTest(true);
                  const testLayout = testLayouts[deleteTestConfirmIndex];
                  try {
                    await deleteGalleryImage(testLayout?.moldUrl);
                  } catch {
                    toast.error('Falha ao remover o guia da galeria, mas o estilo será excluído mesmo assim.');
                  } finally {
                    deleteTestLayout(deleteTestConfirmIndex);
                    setDeleteTestConfirmIndex(null);
                    setIsDeletingTest(false);
                    toast.success('Estilo de teste excluído por completo.');
                  }
                }}
                disabled={isDeletingTest}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50"
              >
                {isDeletingTest ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isGalleryPickerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl h-full max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {selectedGalleryFolder && (
                  <button
                    onClick={() => { setSelectedGalleryFolder(null); setGalleryImages([]); }}
                    className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 flex-shrink-0"
                    title="Voltar para as pastas"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-sm font-black uppercase tracking-widest text-black dark:text-white truncate">
                  {selectedGalleryFolder || 'SmartGaleria • Pastas de Layout'}
                </h3>
              </div>
              <button
                onClick={() => setIsGalleryPickerOpen(false)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-4 custom-scrollbar">
              {!selectedGalleryFolder ? (
                isLoadingGalleryFolders ? (
                  <p className="text-center text-sm text-zinc-400 py-10">Carregando pastas...</p>
                ) : galleryFolders.length === 0 ? (
                  <p className="text-center text-sm text-zinc-400 py-10">Nenhuma pasta de layout encontrada na galeria.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {galleryFolders.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => openGalleryFolder(folder)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-purple-400 hover:bg-purple-50/40 dark:hover:bg-purple-900/10 transition-colors"
                      >
                        <FolderOpen className="w-8 h-8 text-purple-500" />
                        <span className="text-[11px] font-bold text-black dark:text-white truncate w-full text-center">{folder}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : isLoadingGalleryImages ? (
                <p className="text-center text-sm text-zinc-400 py-10">Carregando imagens...</p>
              ) : galleryImages.length === 0 ? (
                <p className="text-center text-sm text-zinc-400 py-10">Nenhuma imagem nesta pasta.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {galleryImages.map((img) => (
                    <button
                      key={img.fullPath}
                      onClick={() => selectGalleryImage(img.url)}
                      className="aspect-[210/297] rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:ring-2 hover:ring-purple-500 transition-all bg-zinc-100 dark:bg-zinc-800"
                      title={img.displayName}
                    >
                      <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-cover" alt={img.displayName} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <CriarEstiloModal
        isOpen={criarEstiloTarget !== null}
        editTarget={typeof criarEstiloTarget === 'object' ? criarEstiloTarget : null}
        onClose={() => setCriarEstiloTarget(null)}
      />
    </div>
  );
}
