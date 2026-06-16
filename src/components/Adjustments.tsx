import React from 'react';
import { useStore, TextSettings, createDefaultLayout, Layout as LayoutType, isThreeProduct } from '../store';
import { Settings, Type, Image as ImageIcon, Layout, Eye, EyeOff, Lock, Unlock, AlignLeft, AlignCenter, AlignRight, Bold, Italic, AlertTriangle, ChevronUp, ChevronDown, Flag, MapPin, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn, isValidImageUrl } from '../lib/utils';

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
            className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
          >
            {el.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-400" />}
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
          Imagem do Produto {slot === 1 ? 'Superior' : slot === 2 ? 'Inferior' : 'Central'}
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
    userRole, layouts, setLayoutName, setLayoutBandeira, setLayoutLocalidade, reorderLayouts, setLayoutHasThirdProduct, setLayoutOrientation, activeLayoutIndex,
    setSlotVisibility,
    isSingleProduct, setSingleProduct,
    orientation,
    // optionalText1, optionalText2, optionalText3, setOptionalText,
    showOptionalTextControl, setShowOptionalTextControl,
    showSingleProductControl, setShowSingleProductControl,
    optionalText1, setOptionalText,
    toggleHasThirdProduct
  } = useStore();

  const [showResetConfirm, setShowResetConfirm] = React.useState(false);

  const currentLayout = layouts[activeLayoutIndex];
  const currentLayoutName = currentLayout?.name || '';
  const canHaveThirdProduct = currentLayout?.hasThirdProduct || isThreeProduct(currentLayoutName, activeLayoutIndex);
  const showThirdProduct = productImage3.visible;

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

  const handleBackgroundUrlChange = (url: string) => {
    setBackground({ url });
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

      {/* Editor Settings Section */}
      {userRole === 'admin' && (
        <section className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-40 flex items-center gap-2">
            <Settings className="w-3.5 h-3.5" />
            Configurações do Editor
          </h3>
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-6">
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
        </section>
      ) as any}

      {/* Admin: Rename Layouts */}
      {userRole === 'admin' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-black dark:text-white opacity-60 flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Nomes dos Modelos
            </h3>
            <button 
              onClick={() => setShowResetConfirm(true)}
              className="text-[10px] font-bold text-black dark:text-white opacity-40 hover:opacity-100 uppercase tracking-widest transition-colors"
            >
              Resetar Modelos
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            <div className="grid grid-cols-2 gap-3">
              {layouts.map((layout, index) => (
                <div key={index} className={cn(
                  "space-y-1 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border transition-all",
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
                      <Layout className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-0.5">Nome</label>
                      <input 
                        type="text"
                        value={layout.name}
                        onChange={(e) => setLayoutName(index, e.target.value)}
                        className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-0.5">
                          <Flag className="w-2 h-2" /> Bandeira
                        </label>
                        <input 
                          type="text"
                          value={layout.bandeira || ''}
                          onChange={(e) => setLayoutBandeira(index, e.target.value)}
                          className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-bold text-zinc-500 uppercase flex items-center gap-1 mb-0.5">
                          <MapPin className="w-2 h-2" /> Localidade
                        </label>
                        <input 
                          type="text"
                          value={layout.localidade || ''}
                          onChange={(e) => setLayoutLocalidade(index, e.target.value)}
                          className="w-full px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Background Section */}
      {userRole === 'admin' && (
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-black dark:text-white opacity-60 flex items-center gap-2">
            <Layout className="w-4 h-4" />
            Fundo Geral
          </h3>
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-grow">
                <label className="block text-xs font-medium mb-1">URL da Imagem de Fundo (A4)</label>
                <input 
                  type="text" 
                  placeholder="https://exemplo.com/fundo.jpg"
                  value={background.url || ''}
                  onChange={(e) => handleBackgroundUrlChange(e.target.value)}
                  className={`w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border rounded text-xs outline-none focus:ring-1 transition-all ${
                    background.url && !isValidImageUrl(background.url)
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-zinc-200 dark:border-zinc-700 focus:ring-blue-500'
                  }`}
                />
                {background.url && !isValidImageUrl(background.url) && (
                  <p className="text-[10px] text-red-500 font-bold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    URL de imagem possivelmente inválida.
                  </p>
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
        </section>
      )}

      {/* Product 1 Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
            Produto Superior
          </h3>
        </div>
        <div className="space-y-4">
          {userRole === 'admin' && <ProductImageControl slot={1} productImage={productImage1} />}
          <TextControl slot={1} label="Nome" elementKey="name" textElements={textElements1} />
          <TextControl slot={1} label="Subtítulo" elementKey="subtitle" textElements={textElements1} />
          <TextControl slot={1} label="Descrição" elementKey="description" textElements={textElements1} />
          <TextControl slot={1} label="Preço" elementKey="price" textElements={textElements1} />
        </div>
      </section>

      {!isSingleProduct && (
        <>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Product 2 Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                Produto Inferior
              </h3>
            </div>
            <div className="space-y-4">
              {userRole === 'admin' && <ProductImageControl slot={2} productImage={productImage2} />}
              <TextControl slot={2} label="Nome" elementKey="name" textElements={textElements2} />
              <TextControl slot={2} label="Subtítulo" elementKey="subtitle" textElements={textElements2} />
              <TextControl slot={2} label="Descrição" elementKey="description" textElements={textElements2} />
              <TextControl slot={2} label="Preço" elementKey="price" textElements={textElements2} />
            </div>
          </section>
        </>
      )}

      {(canHaveThirdProduct && !isSingleProduct) && (
        <>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Product 3 Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 flex items-center gap-2">
                Produto Central (Opcional)
              </h3>
              {userRole === 'admin' && (
                <button 
                  onClick={() => setSlotVisibility(3, !showThirdProduct)}
                  className={`p-1.5 rounded-lg transition-colors ${showThirdProduct ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-zinc-400 bg-zinc-100 dark:bg-zinc-800'}`}
                  title={showThirdProduct ? "Ocultar Produto Central" : "Mostrar Produto Central"}
                >
                  {showThirdProduct ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              )}
            </div>
            
            {showThirdProduct && (
              <div className="space-y-4">
                {userRole === 'admin' && <ProductImageControl slot={3} productImage={productImage3} />}
                <TextControl slot={3} label="Nome" elementKey="name" textElements={textElements3} />
                <TextControl slot={3} label="Subtítulo" elementKey="subtitle" textElements={textElements3} />
                <TextControl slot={3} label="Descrição" elementKey="description" textElements={textElements3} />
                <TextControl slot={3} label="Preço" elementKey="price" textElements={textElements3} />
              </div>
            )}
          </section>
        </>
      )}

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
};

export default Adjustments;
