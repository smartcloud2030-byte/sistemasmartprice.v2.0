import React from 'react';
import { useStore, TextSettings, Layout as LayoutType, isThreeProduct } from '../store';
import { Settings, Type, Image as ImageIcon, Layout, Eye, EyeOff, Lock, Unlock, AlignLeft, AlignCenter, AlignRight, Bold, Italic, AlertCircle, ChevronRight, Upload } from 'lucide-react';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { toast } from 'sonner';
import { cn, isValidImageUrl, getProxyUrl } from '../lib/utils';

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

// Component extracted to top level to prevent re-mounting when Adjustments re-renders. 
// This fixes the issue where the native color picker would close automatically when selecting a color.
const TextControl = ({ slot, label, elementKey, textElements }: { 
  slot: 1 | 2 | 3, 
  label: string, 
  elementKey: 'name' | 'subtitle' | 'description' | 'price',
  textElements: any
}) => {
  const { setElement, userRole } = useStore();
  const el = textElements[elementKey];
  
  if (!el) return null;

  return (
    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-xs flex items-center gap-2">
          <Type className="w-3.5 h-3.5 text-blue-500" />
          {label}
        </h4>
        {userRole === 'admin' && (
          <button
            onClick={() => setElement(slot, elementKey, { visible: !el.visible })}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wide transition-colors ${
              el.visible
                ? 'text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                : 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40'
            }`}
          >
            {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {el.visible ? 'Não exibir' : 'Exibir'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {userRole === 'admin' && (
          elementKey === 'description' ? (
            <textarea 
              rows={3}
              value={el.text}
              onChange={(e) => setElement(slot, elementKey, { text: e.target.value })}
              className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs resize-none"
            />
          ) : (
            <input 
              type="text" 
              value={el.text}
              onChange={(e) => setElement(slot, elementKey, { text: e.target.value })}
              className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs"
            />
          )
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-black dark:text-white opacity-60 block mb-0.5">Tamanho: {el.fontSize}px</label>
            <input 
              type="range" min="10" max="300" 
              value={el.fontSize}
              onChange={(e) => setElement(slot, elementKey, { fontSize: parseInt(e.target.value) })}
              className="w-full h-1.5"
            />
          </div>
          <div>
            <label className="text-[10px] text-black dark:text-white opacity-60 block mb-0.5">Cor</label>
            <input 
              type="color" 
              value={el.color}
              onChange={(e) => setElement(slot, elementKey, { color: e.target.value })}
              className="w-full h-6 p-0 border-none bg-transparent cursor-pointer"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={el.fontFamily || 'Inter'}
            onChange={(e) => setElement(slot, elementKey, { fontFamily: e.target.value })}
            className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] flex-1 outline-none"
          >
            <option value="Inter">Inter</option>
            <option value="Montserrat">Montserrat</option>
          </select>
          <button 
            onClick={() => setElement(slot, elementKey, { isBold: !el.isBold })}
            className={`p-1.5 rounded border transition-colors ${el.isBold ? 'bg-blue-100 border-blue-300 text-blue-600' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}
            title="Negrito"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setElement(slot, elementKey, { isItalic: !el.isItalic })}
            className={`p-1.5 rounded border transition-colors ${el.isItalic ? 'bg-blue-100 border-blue-300 text-blue-600' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}
            title="Itálico"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <div className="flex border border-zinc-200 dark:border-zinc-700 rounded overflow-hidden">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => setElement(slot, elementKey, { align })}
                className={`p-1.5 transition-colors ${el.align === align ? 'bg-blue-100 text-blue-600' : 'bg-white dark:bg-zinc-900'}`}
              >
                {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Component extracted to top level to prevent re-mounting during parent state updates.
const ProductImageControl = ({ slot, productImage }: { slot: 1 | 2 | 3, productImage: any }) => {
  const { setProductImage } = useStore();
  
  const handleProductImageUrlChange = (slot: 1 | 2 | 3, url: string) => {
    setProductImage(slot, { url });
  };

  return (
    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
          Imagem do Produto {slot === 1 ? 'Superior' : slot === 2 ? 'Central' : 'Inferior'}
        </span>
        <div className="flex gap-2">
          <button 
            onClick={() => setProductImage(slot, { visible: !productImage.visible })}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
          >
            {productImage.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-black dark:text-white opacity-40" />}
          </button>
          <button 
            onClick={() => setProductImage(slot, { locked: !productImage.locked })}
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
          >
            {productImage.locked ? <Lock className="w-3.5 h-3.5 text-blue-600" /> : <Unlock className="w-3.5 h-3.5 text-black dark:text-white opacity-40" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-black dark:text-white opacity-60 block mb-1">URL da Imagem</label>
          <input 
            type="text" 
            placeholder="https://exemplo.com/imagem.jpg"
            value={productImage.url || ''}
            onChange={(e) => handleProductImageUrlChange(slot, e.target.value)}
            className={`w-full px-2 py-1 bg-white dark:bg-zinc-900 border rounded text-[10px] text-black dark:text-white outline-none focus:ring-1 transition-all ${
              productImage.url && !isValidImageUrl(productImage.url)
                ? 'border-red-500 focus:ring-red-500'
                : 'border-zinc-200 dark:border-zinc-700 focus:ring-blue-500'
            }`}
          />
          {productImage.url && !isValidImageUrl(productImage.url) && (
            <p className="text-[8px] text-red-500 font-bold flex items-center gap-1 mt-1">
              <AlertCircle className="w-2.5 h-2.5" />
              URL de imagem possivelmente inválida.
            </p>
          )}
        </div>
        <div>
          <label className="text-[10px] text-black dark:text-white opacity-60 block mb-0.5">Opacidade: {Math.round(productImage.opacity * 100)}%</label>
          <input 
            type="range" min="0" max="1" step="0.1" 
            value={productImage.opacity}
            onChange={(e) => setProductImage(slot, { opacity: parseFloat(e.target.value) })}
            className="w-full h-1.5"
          />
        </div>
        <div>
          <label className="text-[10px] text-black dark:text-white opacity-60 block mb-0.5">Rotação: {productImage.rotation}°</label>
          <input 
            type="range" min="0" max="360" 
            value={productImage.rotation}
            onChange={(e) => setProductImage(slot, { rotation: parseInt(e.target.value) })}
            className="w-full h-1.5"
          />
        </div>
      </div>
    </div>
  );
};

const Adjustments = () => {
  const { 
    textElements1, textElements2, textElements3,
    productImage1, productImage2, productImage3,
    background, setElement, setProductImage, setBackground,
    userRole, layouts, setLayoutOrientation, activeLayoutIndex,
    setSlotVisibility,
    isSingleProduct, setSingleProduct,
    orientation,
    // optionalText1, optionalText2, optionalText3, setOptionalText,
    showOptionalTextControl, setShowOptionalTextControl,
    showSingleProductControl, setShowSingleProductControl,
    optionalText1, setOptionalText,
    toggleHasThirdProduct,
    setLayoutNamesModalOpen,
    setLayoutName
  } = useStore();

  const currentLayout = layouts[activeLayoutIndex];
  const currentLayoutName = currentLayout?.name || '';
  const canHaveThirdProduct = currentLayout?.hasThirdProduct || isThreeProduct(currentLayoutName, activeLayoutIndex);
  const showThirdProduct = productImage3.visible;

  const [isUploadingBackground, setIsUploadingBackground] = React.useState(false);
  const backgroundFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleBackgroundFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return; }

    setIsUploadingBackground(true);
    try {
      const category = `layout-${slugifyCategory(currentLayout?.bandeira || 'geral') || 'geral'}`;
      const { url } = await uploadBackgroundImage(file, category);
      setBackground({ url });
      toast.success('Fundo A4 enviado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Falha no upload do fundo.');
    } finally {
      setIsUploadingBackground(false);
    }
  };

  const applyToAllModels = (type: 'single' | 'optional') => {
    const { layouts, activeLayoutIndex } = useStore.getState();
    const currentVal = type === 'single' ? showSingleProductControl : showOptionalTextControl;
    
    useStore.setState((state) => ({
      layouts: state.layouts.map(l => ({
        ...l,
        [type === 'single' ? 'showSingleProductControl' : 'showOptionalTextControl']: currentVal
      }))
    }));
    
    useStore.getState().saveLayoutDebounced();
    toast.success(`Configuração aplicada a todos os ${layouts.length} modelos!`);
  };

  return (
    <div className="p-6 space-y-8 pb-20">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="w-6 h-6 text-blue-600" />
        Ajustes e Estilos
      </h2>

      {/* Admin: Rename Layouts */}
      {userRole === 'admin' && (
        <button
          onClick={() => setLayoutNamesModalOpen(true)}
          className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500/50 hover:shadow-md transition-all text-left"
        >
          <span className="flex items-center gap-3">
            <span className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 flex-shrink-0">
              <Layout className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-widest text-black dark:text-white">Modelos</span>
              <span className="block text-xs text-zinc-400">{layouts.length} modelos • editar nome, bandeira e localidade</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />
        </button>
      )}

      {/* Editor Settings Section */}
      {userRole === 'admin' && (
        <CollapsibleSection title="Configurações do Editor" icon={Settings}>
          <div className="space-y-6">
            {/* Optional Text Controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-tight opacity-80">Opção Texto Opcional</span>
                  <span className="text-[8px] text-zinc-500 font-medium">Habilita o controle para o usuário</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => applyToAllModels('optional')}
                    className="text-[8px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                  >
                    Aplicar a Todos
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer scale-90">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={showOptionalTextControl}
                      onChange={(e) => setShowOptionalTextControl(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] font-black uppercase tracking-tight text-blue-600">Ativar Texto Opcional agora</span>
                <label className="relative inline-flex items-center cursor-pointer scale-75">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={optionalText1.active}
                    onChange={(e) => setOptionalText(1, { active: e.target.checked })}
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="h-px bg-zinc-200 dark:bg-zinc-700 mx-4" />

            {/* Single Product Controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-tight opacity-80">Opção Apenas 1 Produto</span>
                  <span className="text-[8px] text-zinc-500 font-medium">Habilita o controle para o usuário</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => applyToAllModels('single')}
                    className="text-[8px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                  >
                    Aplicar a Todos
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer scale-90">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={showSingleProductControl}
                      onChange={(e) => setShowSingleProductControl(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-zinc-100 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <span className="text-[9px] font-black uppercase tracking-tight text-blue-600">Ativar Apenas 1 Produto agora</span>
                <label className="relative inline-flex items-center cursor-pointer scale-75">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={isSingleProduct}
                    onChange={(e) => setSingleProduct(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            <div className="h-px bg-zinc-200 dark:bg-zinc-700 mx-4" />

            {/* 3rd Product Controls */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-tight opacity-80">Habilitar 3º Produto</span>
                  <span className="text-[8px] text-zinc-500 font-medium">Força este modelo a aceitar 3 produtos</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer scale-90">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={canHaveThirdProduct}
                    onChange={() => toggleHasThirdProduct()}
                  />
                  <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Background Section */}
      {userRole === 'admin' && (
        <CollapsibleSection title="Fundo Geral" icon={Layout}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-grow space-y-2">
                <label className="block text-xs font-medium mb-1">Nome do Modelo</label>
                <input
                  type="text"
                  placeholder="Ex: Oferta Semana PL"
                  value={currentLayout?.name || ''}
                  onChange={(e) => setLayoutName(activeLayoutIndex, e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 transition-all text-black dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-grow space-y-2">
                <label className="block text-xs font-medium mb-1">Imagem de Fundo (A4)</label>
                <input
                  ref={backgroundFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBackgroundFileSelected}
                />
                <button
                  type="button"
                  onClick={() => backgroundFileInputRef.current?.click()}
                  disabled={isUploadingBackground}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-blue-400 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-widest hover:bg-blue-50/60 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                >
                  {isUploadingBackground ? (
                    <>
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {background.url ? 'Trocar Imagem de Fundo' : 'Enviar Imagem de Fundo'}
                    </>
                  )}
                </button>
                {background.url && (
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-12 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
                      <img src={getProxyUrl(background.url, { thumbnail: true })} className="w-full h-full object-cover" alt="Fundo atual" />
                    </div>
                    <p className="text-[10px] text-zinc-400">Fundo atual deste modelo</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <button 
                  onClick={() => setBackground({ mode: 'cover' })}
                  className={`px-3 py-1 text-xs rounded-full border ${background.mode === 'cover' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900'}`}
                >
                  Cover
                </button>
                <button 
                  onClick={() => setBackground({ mode: 'contain' })}
                  className={`px-3 py-1 text-xs rounded-full border ${background.mode === 'contain' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900'}`}
                >
                  Contain
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] font-bold uppercase opacity-60">Orientação:</span>
                <div className="flex border border-zinc-200 dark:border-zinc-700 rounded-full overflow-hidden">
                  <button 
                    onClick={() => setLayoutOrientation(activeLayoutIndex, 'portrait')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase ${orientation === 'portrait' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900 text-zinc-500'}`}
                  >
                    Retrato
                  </button>
                  <button 
                    onClick={() => setLayoutOrientation(activeLayoutIndex, 'landscape')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase ${orientation === 'landscape' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900 text-zinc-500'}`}
                  >
                    Paisagem
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setBackground({ locked: !background.locked })}
                className={`p-2 rounded ${background.locked ? 'text-blue-600' : 'text-zinc-400'}`}
              >
                {background.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Product 1 Section */}
      <CollapsibleSection title="Produto Superior" titleClassName="text-blue-600">
        {userRole === 'admin' && <ProductImageControl slot={1} productImage={productImage1} />}
        <TextControl slot={1} label="Nome" elementKey="name" textElements={textElements1} />
        <TextControl slot={1} label="Subtítulo" elementKey="subtitle" textElements={textElements1} />
        <TextControl slot={1} label="Descrição" elementKey="description" textElements={textElements1} />
        <TextControl slot={1} label="Preço" elementKey="price" textElements={textElements1} />
      </CollapsibleSection>

      {!isSingleProduct && (
        <CollapsibleSection title="Produto Central" titleClassName="text-blue-600">
          {userRole === 'admin' && <ProductImageControl slot={2} productImage={productImage2} />}
          <TextControl slot={2} label="Nome" elementKey="name" textElements={textElements2} />
          <TextControl slot={2} label="Subtítulo" elementKey="subtitle" textElements={textElements2} />
          <TextControl slot={2} label="Descrição" elementKey="description" textElements={textElements2} />
          <TextControl slot={2} label="Preço" elementKey="price" textElements={textElements2} />
        </CollapsibleSection>
      )}

      {(canHaveThirdProduct && !isSingleProduct) && (
        <CollapsibleSection
          title="Produto Inferior (Opcional)"
          titleClassName="text-blue-600"
          headerExtra={
            userRole === 'admin' && (
              <button
                onClick={(e) => { e.stopPropagation(); setSlotVisibility(3, !showThirdProduct); }}
                className={`p-1.5 rounded-lg transition-colors ${showThirdProduct ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800'}`}
                title={showThirdProduct ? "Ocultar Produto Inferior" : "Mostrar Produto Inferior"}
              >
                {showThirdProduct ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            )
          }
        >
          {showThirdProduct ? (
            <>
              {userRole === 'admin' && <ProductImageControl slot={3} productImage={productImage3} />}
              <TextControl slot={3} label="Nome" elementKey="name" textElements={textElements3} />
              <TextControl slot={3} label="Subtítulo" elementKey="subtitle" textElements={textElements3} />
              <TextControl slot={3} label="Descrição" elementKey="description" textElements={textElements3} />
              <TextControl slot={3} label="Preço" elementKey="price" textElements={textElements3} />
            </>
          ) : (
            <p className="text-xs text-zinc-400 text-center py-2">Produto inferior está oculto neste modelo.</p>
          )}
        </CollapsibleSection>
      )}

    </div>
  );
};

export default Adjustments;
