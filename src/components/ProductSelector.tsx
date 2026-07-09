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
    if (!term.trim()) return [];
    const lowerTerm = term.toLowerCase().trim();
    const tokens = lowerTerm.split(/\s+/).filter(t => t.length > 0);

    return products.filter(p => {
      const searchContent = `${p.name || ''} ${p.category || ''} ${p.description || ''} ${p.barcode || ''} ${p.barcode2 || ''}`.toLowerCase();
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar por nome ou código de barras..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            value={generalSearchTerm}
            onChange={(e) => setGeneralSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {generalFilteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="w-full text-left p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-zinc-900 transition-colors flex items-center gap-3 group"
            >
              <div className="w-11 h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
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
                  <Package className="w-full h-full p-2 text-zinc-400" />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h4 className="font-medium text-sm truncate text-black dark:text-white">{product.name}</h4>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{product.price}</p>
                  {product.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {product.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
          {generalFilteredProducts.length === 0 && (
            <div className="text-center py-12 text-zinc-400 text-sm">
              Nenhum produto encontrado.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
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

  const slotLabel = slot === 1 ? 'Superior' : slot === 2 ? 'Central' : 'Inferior';

  return (
    <div className="space-y-4 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">
          Produto {slotLabel}
        </h3>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 text-xs font-medium"
          title="Sincronizar produtos"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Sincronizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-2">
        {showSingleProductControl && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Só um produto</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isSingleProduct}
                onChange={(e) => setSingleProduct(e.target.checked)}
              />
              <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        )}

        {showOptionalTextControl && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Texto opcional</span>
              <div className="relative w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 overflow-hidden flex-shrink-0" style={{ backgroundColor: optionalText?.color || '#000000' }}>
                <input
                  type="color"
                  value={optionalText?.color || '#000000'}
                  onChange={(e) => setOptionalText?.({ color: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
                />
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={optionalText?.active || false}
                onChange={(e) => setOptionalText?.({ active: e.target.checked })}
              />
              <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
            </label>
          </div>
        )}
      </div>

      {optionalText?.active && showOptionalTextControl && (
        <input
          type="text"
          placeholder="Digite o texto opcional..."
          className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-orange-400 outline-none text-black dark:text-white"
          value={optionalText.text || ''}
          onChange={(e) => setOptionalText?.({ text: e.target.value })}
        />
      )}

      {/* Campos manuais */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Nome do produto</label>
          <input
            type="text"
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
            value={currentName}
            onChange={(e) => setElement(slot, 'name', { text: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Descrição</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none text-black dark:text-white"
            value={currentDescription}
            onChange={(e) => setElement(slot, 'description', { text: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {currentPrice.includes('%') ? 'Valor do desconto' : 'Preço do produto'}
            </label>

            {isIdosoLayout && (
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-lg">
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Ativar desconto</span>
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
                  <div className="w-8 h-4 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder={currentPrice.includes('%') ? "Ex: 15" : "Ex: R$ 9,99"}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-semibold text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 outline-none"
              value={currentPrice.includes('%') ? currentPrice.replace('%', '') : currentPrice}
              onChange={(e) => {
                const val = e.target.value;
                if (currentPrice.includes('%')) {
                  const cleanVal = val.replace('%', '');
                  setElement(slot, 'price', { text: cleanVal + '%' });
                } else {
                  setElement(slot, 'price', { text: val });
                }
              }}
            />
            {currentPrice.includes('%') && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400 font-semibold text-sm">%</span>
            )}
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Buscar produto</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Nome ou código de barras..."
            className="w-full pl-9 pr-9 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de produtos */}
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
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
                className={`w-full text-left p-2 rounded-lg border transition-colors flex items-center gap-2.5 ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
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
                    <Package className="w-full h-full p-1.5 text-zinc-400" />
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="font-medium text-xs truncate text-black dark:text-white">{product.name}</h4>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">{product.price}</p>
                    {product.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />}
              </button>
            );
          })
        ) : (
          <div className="text-center py-4 text-zinc-400 text-xs">
            {searchTerm.trim() ? 'Nenhum produto encontrado.' : 'Digite para buscar produtos.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductSelector;