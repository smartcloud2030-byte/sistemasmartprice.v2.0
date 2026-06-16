import React, { useState, useEffect, useMemo } from 'react';
import { useStore, Product, isThreeProduct } from '../store';
import { Search, Package, Check, X, RefreshCw } from 'lucide-react';
import { getProxyUrl } from '../lib/utils';

const ProductSelector: React.FC<{ onSelect?: (product: Product) => void }> = ({ onSelect }) => {
  const { 
    products, fetchProducts, selectProduct, 
    textElements1, textElements2, textElements3, 
    productImage3, setElement,
    layouts, activeLayoutIndex,
    optionalText1, optionalText2, optionalText3, setOptionalText,
    isSingleProduct, showOptionalTextControl, showSingleProductControl
  } = useStore();

  const currentLayoutName = layouts[activeLayoutIndex]?.name || '';
  const isIdosoLayout = currentLayoutName === 'DIA DO IDOSO PL (PI)';

  const showThirdProduct = productImage3.visible;
  const [searchTerm1, setSearchTerm1] = useState('');
  const [searchTerm2, setSearchTerm2] = useState('');
  const [searchTerm3, setSearchTerm3] = useState('');
  const [generalSearchTerm, setGeneralSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetchProducts();
    } finally {
      setIsSyncing(false);
    }
  };

  const filterProducts = (term: string) => {
    if (!term.trim()) return products; // Show all products by default when not searching
    const lowerTerm = term.toLowerCase().trim();
    const tokens = lowerTerm.split(/\s+/).filter(t => t.length > 0);
    
    return products.filter(p => {
      const searchContent = `${p.name || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
      return tokens.every(token => searchContent.includes(token));
    });
  };

  const filteredProducts1 = useMemo(() => filterProducts(searchTerm1), [searchTerm1, products]);
  const filteredProducts2 = useMemo(() => filterProducts(searchTerm2), [searchTerm2, products]);
  const filteredProducts3 = useMemo(() => filterProducts(searchTerm3), [searchTerm3, products]);
  const generalFilteredProducts = useMemo(() => filterProducts(generalSearchTerm), [generalSearchTerm, products]);

  if (onSelect) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black dark:text-white opacity-40 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar produto pelo nome..."
            className="w-full pl-10 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800 border-none rounded-2xl text-sm text-black dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            value={generalSearchTerm}
            onChange={(e) => setGeneralSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {generalFilteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="w-full text-left p-3 rounded-2xl border border-zinc-100 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-white dark:bg-zinc-900 transition-all flex items-center gap-4 group"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                {product.image ? (
                  <img 
                    src={getProxyUrl(product.image)} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                    crossOrigin="anonymous"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Package className="w-full h-full p-2 text-black dark:text-white opacity-40" />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h4 className="font-bold text-sm truncate uppercase text-black dark:text-white">{product.name}</h4>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-emerald-600 font-black">{product.price}</p>
                  {product.description && (
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate italic">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
          {generalFilteredProducts.length === 0 && (
            <div className="text-center py-12 text-black dark:text-white opacity-60 text-sm italic">
              Nenhum produto encontrado.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <ProductSlot 
        slot={1}
        searchTerm={searchTerm1}
        setSearchTerm={setSearchTerm1}
        filteredProducts={filteredProducts1}
        currentPrice={textElements1.price.text}
        currentName={textElements1.name.text}
        currentDescription={textElements1.description.text}
        setElement={setElement}
        selectProduct={selectProduct}
        isSyncing={isSyncing}
        handleSync={handleSync}
        optionalText={optionalText1}
        setOptionalText={(updates) => setOptionalText(1, updates)}
        isIdosoLayout={isIdosoLayout}
        layouts={layouts}
        activeLayoutIndex={activeLayoutIndex}
        showOptionalTextControl={showOptionalTextControl}
        showSingleProductControl={showSingleProductControl}
      />
      
      {!isSingleProduct && (
        <>
          <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

          <ProductSlot 
            slot={2}
            searchTerm={searchTerm2}
            setSearchTerm={setSearchTerm2}
            filteredProducts={filteredProducts2}
            currentPrice={textElements2.price.text}
            currentName={textElements2.name.text}
            currentDescription={textElements2.description.text}
            setElement={setElement}
            selectProduct={selectProduct}
            isSyncing={isSyncing}
            handleSync={handleSync}
            optionalText={optionalText2}
            setOptionalText={(updates) => setOptionalText(2, updates)}
            isIdosoLayout={isIdosoLayout}
            layouts={layouts}
            activeLayoutIndex={activeLayoutIndex}
            showOptionalTextControl={showOptionalTextControl}
            showSingleProductControl={showSingleProductControl}
          />

          {showThirdProduct && (
            <>
              <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

              <ProductSlot 
                slot={3}
                searchTerm={searchTerm3}
                setSearchTerm={setSearchTerm3}
                filteredProducts={filteredProducts3}
                currentPrice={textElements3.price.text}
                currentName={textElements3.name.text}
                currentDescription={textElements3.description.text}
                setElement={setElement}
                selectProduct={selectProduct}
                isSyncing={isSyncing}
                handleSync={handleSync}
                optionalText={optionalText3}
                setOptionalText={(updates) => setOptionalText(3, updates)}
                isIdosoLayout={isIdosoLayout}
                layouts={layouts}
                activeLayoutIndex={activeLayoutIndex}
                showOptionalTextControl={showOptionalTextControl}
                showSingleProductControl={showSingleProductControl}
              />
            </>
          )}
        </>
      )}
    </div>
  );
};

const ProductSlot = ({ 
  slot, 
  searchTerm, 
  setSearchTerm, 
  filteredProducts, 
  currentPrice, 
  currentName,
  currentDescription,
  setElement,
  selectProduct,
  isSyncing,
  handleSync,
  optionalText,
  setOptionalText,
  isIdosoLayout,
  layouts,
  activeLayoutIndex,
  showOptionalTextControl,
  showSingleProductControl
}: { 
  slot: 1 | 2 | 3, 
  searchTerm: string, 
  setSearchTerm: (v: string) => void, 
  filteredProducts: any[], 
  currentPrice: string,
  currentName: string,
  currentDescription: string,
  setElement: any,
  selectProduct: any,
  isSyncing: boolean,
  handleSync: () => void,
  optionalText?: any,
  setOptionalText?: (updates: any) => void,
  isIdosoLayout?: boolean,
  layouts?: any[],
  activeLayoutIndex?: number,
  showOptionalTextControl?: boolean,
  showSingleProductControl?: boolean
}) => {
  const { isSingleProduct, setSingleProduct } = useStore();

  return (
    <div className="space-y-4 p-4 bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-blue-600 uppercase tracking-widest">
          Produto {slot === 1 ? 'Superior' : slot === 2 ? 'Inferior' : 'Central'}
        </h3>
        <button 
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-2 py-1 text-black dark:text-white opacity-60 hover:text-blue-600 transition-colors disabled:opacity-50 text-[10px] font-black uppercase tracking-tighter"
          title="Sincronizar produtos"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Toggles Row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Single Product Toggle */}
      {showSingleProductControl && (
        <div 
          className="flex items-center justify-between p-1.5 rounded-xl border border-white/5 shadow-lg bg-[#1a1614]"
        >
          <div className="flex items-center gap-1.5">
            <div 
              className="w-1 h-1 rounded-full bg-[#2563eb]" 
              style={{ boxShadow: `0 0 4px #2563eb99` }} 
            />
            <span className="text-[8px] font-black uppercase tracking-tight text-[#2563eb] leading-tight">
              (Apenas Um produto)
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer scale-[0.65] origin-right">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={isSingleProduct}
              onChange={(e) => setSingleProduct(e.target.checked)}
            />
            <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2563eb]"></div>
          </label>
        </div>
      )}

        {/* Optional Text Toggle */}
        {showOptionalTextControl && (
          <div 
            className="flex items-center justify-between p-1.5 rounded-xl border border-white/5 shadow-lg bg-[#1a1614]"
          >
            <div className="flex items-center gap-1.5">
              <div 
                className="w-1 h-1 rounded-full bg-[#ff6600]" 
                style={{ boxShadow: `0 0 4px #ff660099` }} 
              />
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-tight text-[#ff6600] leading-tight">
                  Texto Opcional
                </span>
                <div className="relative w-3 h-3 rounded-full border border-white/20 shadow-sm overflow-hidden flex-shrink-0" style={{ backgroundColor: optionalText?.color || '#000000' }}>
                  <input 
                    type="color"
                    value={optionalText?.color || '#000000'}
                    onChange={(e) => setOptionalText?.({ color: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                  />
                </div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer scale-[0.65] origin-right">
              <input 
                type="checkbox" 
                className="sr-only peer"
                checked={optionalText?.active || false}
                onChange={(e) => setOptionalText?.({ active: e.target.checked })}
              />
              <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#ff6600]"></div>
            </label>
          </div>
        )}
      </div>

      {optionalText?.active && showOptionalTextControl && (
        <div className="px-1 animate-in fade-in slide-in-from-top-1 duration-200">
          <input
            type="text"
            placeholder="Digite o texto opcional..."
            className="w-full px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#ff6600] outline-none transition-all shadow-sm"
            value={optionalText.text || ''}
            onChange={(e) => setOptionalText?.({ text: e.target.value })}
          />
        </div>
      )}

    {/* Manual Info Editing */}
    <div className="grid grid-cols-1 gap-3">
      <div className="space-y-1">
        <label className="text-[10px] font-black text-black dark:text-white opacity-60 uppercase tracking-widest">
          Nome do Produto
        </label>
        <input
          type="text"
          className="w-full px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
          value={currentName}
          onChange={(e) => setElement(slot, 'name', { text: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black text-black dark:text-white opacity-60 uppercase tracking-widest">
          Descrição
        </label>
        <textarea
          rows={2}
          className="w-full px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none text-black dark:text-white"
          value={currentDescription}
          onChange={(e) => setElement(slot, 'description', { text: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black text-black dark:text-white opacity-60 uppercase tracking-widest">
            {currentPrice.includes('%') ? 'Valor do Desconto' : 'Preço do Produto'}
          </label>
          
          {isIdosoLayout && (
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-800">
              <span className="text-[9px] font-black text-blue-600 uppercase tracking-tight">Ativar Desconto</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={currentPrice.includes('%')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setElement(slot, 'price', { text: '0%', visible: true });
                    } else {
                      setElement(slot, 'price', { text: 'R$ 0,00', visible: true });
                    }
                  }}
                />
                <div className="w-8 h-4 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder={currentPrice.includes('%') ? "Ex: 15" : "Ex: R$ 9,99"}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm font-black text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={currentPrice.includes('%') ? currentPrice.replace('%', '') : currentPrice}
            onChange={(e) => {
              const val = e.target.value;
              if (currentPrice.includes('%')) {
                // Ensure it always has the % suffix
                const cleanVal = val.replace('%', '');
                setElement(slot, 'price', { text: cleanVal + '%' });
              } else {
                setElement(slot, 'price', { text: val });
              }
            }}
          />
          {currentPrice.includes('%') && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 font-black text-sm">%</span>
          )}
        </div>
      </div>
    </div>

    {/* Search Input */}
    <div className="space-y-1">
      <label className="text-[10px] font-black text-black dark:text-white opacity-60 uppercase tracking-widest">
        Buscar Produto
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black dark:text-white opacity-40 w-3.5 h-3.5" />
        <input
          type="text"
          placeholder="Digite para pesquisar..."
          className="w-full pl-9 pr-10 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-black dark:text-white opacity-40 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>

    {/* Product List */}
    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
      {filteredProducts.length > 0 ? (
        filteredProducts.map((product) => {
          const isSelected = currentName === product.name;
          return (
            <button
              key={product.id}
              onClick={() => {
                selectProduct(slot, product);
                setSearchTerm('');
              }}
              className={`w-full text-left p-2 rounded-xl border transition-all flex items-center gap-3 group ${
                isSelected 
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                {product.image ? (
                  <img 
                    src={getProxyUrl(product.image)} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                    crossOrigin="anonymous"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <Package className="w-full h-full p-1.5 text-black dark:text-white opacity-40" />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h4 className="font-bold text-xs truncate uppercase text-black dark:text-white">{product.name}</h4>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-blue-600 font-black">{product.price}</p>
                  {product.description && (
                    <p className="text-[9px] text-zinc-500 dark:text-zinc-400 truncate italic">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
              {isSelected && <Check className="w-3 h-3 text-blue-500 flex-shrink-0" />}
            </button>
          );
        })
      ) : (
        <div className="text-center py-4 text-black dark:text-white opacity-60 text-xs">
          Nenhum produto encontrado.
        </div>
      )}
    </div>
  </div>
  );
};

export default ProductSelector;
