import React, { useState, useEffect } from 'react';
import { useStore, Product } from '../store';
import { Plus, Search, Edit2, Trash2, Package, RefreshCw, AlertTriangle, AlertCircle, Upload, Image } from 'lucide-react';
import { cn, isValidImageUrl, getProxyUrl } from '../lib/utils';
import { toast } from 'sonner';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const GALLERY_PASSWORD = import.meta.env.VITE_GALLERY_PASSWORD || 'smartprice@admin2026';
const MINIO_PUBLIC_URL = 'https://imagens.sistemasmartprice.com.br';

// ── Mapeamento categoria → pasta MinIO ────────────────────────────────────────
const CATEGORY_FOLDER: Record<string, string> = {
  'MEDICAMENTO': 'medicamento',
  'PERFUMARIA': 'perfumaria',
  'INFANTIL': 'infantil',
  'SUPLEMENTO': 'suplementos-maromba',
  'SUPLEMENTOS': 'suplementos-maromba',
  'DERMO': 'perfumaria',
  'CONVENIÊNCIA': 'conveniencia',
  'CONVENIENCIA': 'conveniencia',
  'LEITE': 'infantil',
  'ELETRÔNICO': 'eletronicos',
  'ELETRONICO': 'eletronicos',
  'PADRÃO': 'padrao',
  'PADRAO': 'padrao',
  'FITNESS': 'suplementos-maromba',
};

function getFolder(category: string): string {
  return CATEGORY_FOLDER[category?.trim().toUpperCase()] || 'padrao';
}

async function uploadImageToMinio(file: File, category: string): Promise<string> {
  const folder = getFolder(category);
  const formData = new FormData();
  formData.append('image', file);
  
  

  const res = await fetch(`/gallery/upload-nobg3/${folder}`, {
    method: 'POST', headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });

  if (!res.ok) throw new Error('Falha no upload da imagem');
  const data = await res.json();
  return data.url || data.publicUrl || '';
}

const ProductManager = () => {
  const { products, fetchProducts } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Omit<Product, 'id'>>({
    name: '', description: '', price: '', image: null, category: '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/gallery/categories', { headers: { 'x-gallery-token': GALLERY_PASSWORD } });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch { }
  };

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isMultiRegisterModalOpen, setIsMultiRegisterModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState('');

  const initialMultiFormData = Array(20).fill(null).map(() => ({
    name: '', description: '', price: '', image: '', category: '',
  }));
  const [multiFormData, setMultiFormData] = useState(initialMultiFormData);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string | number } | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [pendingBulkData, setPendingBulkData] = useState<any[]>([]);

  // ── API helpers ─────────────────────────────────────────────────────────────
  const apiCall = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-token': API_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} falhou: ${res.status}`);
    return res.json();
  };

  const fetchProductCount = async () => {
    try {
      const data = await apiCall('GET', '/products/count');
      setProductCount(data.count ?? null);
    } catch {
      // silencioso
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetchProducts();
      await fetchProductCount();
    } catch {
      toast.error('Erro ao sincronizar produtos.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        await fetchProducts();
        await fetchProductCount();
        await fetchCategories();
      } catch {
        toast.error('Falha ao carregar produtos.');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // ── Upload de imagem ─────────────────────────────────────────────────────────
  const handleImageUpload = async (file: File, category: string, onSuccess: (url: string) => void) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadImageToMinio(file, category);
      onSuccess(url);
      toast.success('Imagem enviada com sucesso!');
    } catch (e) {
      toast.error('Erro ao enviar imagem. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Submit formulário individual ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.image && !isValidImageUrl(formData.image)) {
      toast.error('URL de imagem inválida.');
      return;
    }
    try {
      if (editingProduct?.id) {
        await apiCall('PUT', `/products/${editingProduct.id}`, formData);
        toast.success('Produto atualizado com sucesso!');
      } else {
        await apiCall('POST', '/products', formData);
        toast.success('Produto cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', image: null, category: '' });
      await fetchProducts();
      await fetchProductCount();
    } catch {
      toast.error('Erro ao salvar produto.');
    }
  };

  // ── Bulk insert ──────────────────────────────────────────────────────────────
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(bulkData);
      if (!Array.isArray(parsed)) throw new Error('Formato inválido');
      const invalid = parsed.filter(p => p.image && !isValidImageUrl(p.image));
      if (invalid.length > 0) {
        setPendingBulkData(parsed);
        setShowBulkConfirm(true);
        return;
      }
      await executeBulkInsert(parsed);
    } catch {
      toast.error('Erro ao importar. Verifique o formato JSON.');
    }
  };

  const executeBulkInsert = async (data: any[]) => {
    try {
      await apiCall('POST', '/products/bulk', data.map(p => ({
        name: p.name || 'Sem nome',
        description: p.description || '',
        price: p.price || 'R$ 0,00',
        image: p.image || null,
        category: p.category || '',
      })));
      setIsBulkModalOpen(false);
      setBulkData('');
      setShowBulkConfirm(false);
      setPendingBulkData([]);
      await fetchProducts();
      await fetchProductCount();
      toast.success('Produtos importados com sucesso!');
    } catch {
      toast.error('Erro ao importar produtos.');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string | number) => {
    try {
      await apiCall('DELETE', `/products/${id}`);
      toast.success('Produto excluído com sucesso!');
      await fetchProducts();
      await fetchProductCount();
    } catch {
      toast.error('Erro ao excluir produto.');
    } finally {
      setConfirmDelete(null);
    }
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (p.name || '').toLowerCase().includes(term) ||
           (p.category || '').toLowerCase().includes(term) ||
           (p.description || '').toLowerCase().includes(term);
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-black dark:text-white">
            <Package className="w-6 h-6 text-blue-600" />
            Gerenciar Produtos
            <span className="text-sm font-normal text-black dark:text-white opacity-60 ml-2 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
              {productCount !== null ? productCount : products.length}{' '}
              {(productCount !== null ? productCount : products.length) === 1 ? 'produto' : 'produtos'}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={isSyncing}
            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button onClick={() => setIsBulkModalOpen(true)}
            className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold">
            Importar JSON
          </button>
          <button onClick={() => { setMultiFormData(initialMultiFormData); setIsMultiRegisterModalOpen(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-lg flex items-center justify-center transition-colors shadow-sm"
            title="Cadastrar Vários Produtos">
            <Plus className="w-5 h-5" />
          </button>
          <button onClick={() => { setEditingProduct(null); setFormData({ name: '', description: '', price: '', image: null, category: '' }); setIsModalOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-bold">
            <Plus className="w-4 h-4" /> Novo Produto
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
        <input type="text" placeholder="Buscar produtos..."
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      {/* Product list */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-black dark:text-white opacity-60 gap-4">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="font-medium">Carregando produtos...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          filteredProducts.map((product, index) => (
            <div key={product.id || `product-${index}`}
              className="bg-white dark:bg-zinc-800 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 flex items-center gap-4 hover:shadow-md transition-shadow group">
              <span className="text-zinc-400 dark:text-zinc-500 font-mono text-sm font-bold min-w-[28px] shrink-0">{index + 1}.</span>
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-700 rounded-lg overflow-hidden flex-shrink-0">
                {product.image ? (
                  <img src={getProxyUrl(product.image)} alt={product.name}
                    className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-400">
                    <Package className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="flex-grow">
                <h3 className="font-bold text-lg uppercase text-black dark:text-white">{product.name}</h3>
                <p className="text-sm text-black dark:text-white opacity-60 line-clamp-1">{product.description}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-blue-600 font-bold">{product.price}</span>
                  {product.category && (
                    <span className="text-xs bg-zinc-100 dark:bg-zinc-700 px-2 py-0.5 rounded text-black dark:text-white opacity-60">{product.category}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingProduct(product); setFormData({ name: product.name, description: product.description, price: product.price, image: product.image, category: product.category }); setIsModalOpen(true); }}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => product.id !== undefined && setConfirmDelete({ id: product.id })}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="py-20 text-center text-black dark:text-white opacity-40 bg-white dark:bg-zinc-800 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium text-black dark:text-white opacity-60">Nenhum produto encontrado.</p>
          </div>
        )}
      </div>

      {/* Modal: Novo/Editar Produto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-black dark:text-white">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-black dark:text-white opacity-60 hover:opacity-100">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-black dark:text-white">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 opacity-60">Nome do Produto</label>
                  <input required type="text"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white"
                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-60">Preço</label>
                  <input required type="text" placeholder="R$ 0,00"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white"
                    value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 opacity-60">Categoria</label>
                  {showNewCategory ? (
                    <div className="flex gap-2">
                      <input type="text" placeholder="Nome da nova categoria"
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white"
                        value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                      <button type="button"
                        className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700"
                        onClick={async () => {
                          if (!newCategory.trim()) return;
                          const folder = newCategory.trim().toLowerCase().replace(/\s+/g, '-');
                          try {
                            await fetch(`/gallery/categories`, {
                              method: 'POST',
                              headers: { 'x-gallery-token': GALLERY_PASSWORD, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: folder })
                            });
                          } catch {}
                          await fetchCategories();
                          setFormData({ ...formData, category: folder });
                          setNewCategory('');
                          setShowNewCategory(false);
                          toast.success(`Categoria "${folder}" criada!`);
                        }}>
                        Criar
                      </button>
                      <button type="button"
                        className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        onClick={() => { setShowNewCategory(false); setNewCategory(''); }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white"
                        value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                        <option value="">Selecione...</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <button type="button"
                        className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title="Nova categoria"
                        onClick={() => setShowNewCategory(true)}>
                        +
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 opacity-60">Descrição</label>
                  <textarea rows={3}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white"
                    value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 opacity-60">Imagem do Produto</label>
                  <div className="space-y-3">
                    {/* Upload direto */}
                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : 'border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}>
                      <Upload className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-blue-600 font-medium">{isUploading ? 'Enviando...' : 'Upload para MinIO'}</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, formData.category, url => setFormData(f => ({ ...f, image: url })));
                        }} />
                    </label>

                    {/* OU URL manual */}
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                      <span>ou cole a URL</span>
                      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                    </div>
                    <input type="text" placeholder="https://..."
                      className={`w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border rounded-lg text-black dark:text-white outline-none transition-all ${formData.image && !isValidImageUrl(formData.image) ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'}`}
                      value={formData.image || ''} onChange={e => setFormData({ ...formData, image: e.target.value })} />

                    {formData.image && !isValidImageUrl(formData.image) && (
                      <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> URL possivelmente inválida.
                      </p>
                    )}

                    {formData.image ? (
                      <div className="relative inline-block">
                        <img src={getProxyUrl(formData.image)} alt="Preview"
                          className="h-32 w-32 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
                          referrerPolicy="no-referrer" crossOrigin="anonymous"
                          onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=Erro'; }} />
                        <button type="button" onClick={() => setFormData({ ...formData, image: null })}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="py-8 border-2 border-zinc-300 dark:border-zinc-700 border-dashed rounded-lg text-center">
                        <Image className="mx-auto h-8 w-8 text-black dark:text-white opacity-20" />
                        <p className="text-xs text-black dark:text-white opacity-40 mt-2">Faça upload ou cole a URL da imagem</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Importar JSON */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-black dark:text-white">Importar JSON</h3>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-black dark:text-white opacity-60 hover:opacity-100">&times;</button>
            </div>
            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
              <textarea rows={10}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg font-mono text-xs text-black dark:text-white"
                placeholder='[{"name": "Produto A", "price": "R$ 10,00"}]'
                value={bulkData} onChange={e => setBulkData(e.target.value)} />
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsBulkModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Importar Produtos</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Cadastrar Vários */}
      {isMultiRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-7xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-emerald-600 text-white">
              <div>
                <h3 className="text-xl font-bold">Cadastrar Vários Produtos</h3>
                <p className="text-xs opacity-90">Preencha os campos abaixo para cadastrar múltiplos produtos de uma vez.</p>
              </div>
              <button onClick={() => setIsMultiRegisterModalOpen(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-zinc-50 dark:bg-zinc-950">
              <div className="grid grid-cols-[40px_1fr_100px_130px_1fr_1fr_80px_60px] gap-3 mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-300 px-2">
                <span>#</span><span>Nome</span><span>Preço</span><span>Categoria</span><span>Descrição</span><span>URL da Imagem</span><span>Upload</span><span>Preview</span>
              </div>
              <div className="space-y-2">
                {multiFormData.map((item, index) => (
                  <div key={index} className="grid grid-cols-[40px_1fr_100px_130px_1fr_1fr_80px_60px] gap-3 items-center bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
                    <span className="text-xs font-bold text-center text-zinc-400">{index + 1}</span>
                    <input type="text" placeholder="Nome" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.name} onChange={e => { const d = [...multiFormData]; d[index].name = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="R$ 0,00" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.price} onChange={e => { const d = [...multiFormData]; d[index].price = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="Categoria" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.category} onChange={e => { const d = [...multiFormData]; d[index].category = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="Descrição" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.description} onChange={e => { const d = [...multiFormData]; d[index].description = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="https://..." className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.image} onChange={e => { const d = [...multiFormData]; d[index].image = e.target.value; setMultiFormData(d); }} />
                    <label className="flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-md cursor-pointer hover:bg-blue-100 transition-colors">
                      <Upload className="w-3 h-3 text-blue-500" />
                      <span className="text-xs text-blue-600">Upload</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file, item.category, url => {
                            const d = [...multiFormData]; d[index].image = url; setMultiFormData(d);
                          });
                        }} />
                    </label>
                    <div className="flex justify-center">
                      <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center">
                        {item.image ? (
                          <img src={getProxyUrl(item.image)} alt="Preview" className="w-full h-full object-cover"
                            referrerPolicy="no-referrer" crossOrigin="anonymous"
                            onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40?text=Err'; }} />
                        ) : <Package className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex justify-end gap-3">
              <button onClick={() => setIsMultiRegisterModalOpen(false)}
                className="px-6 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold transition-all">Cancelar</button>
              <button disabled={isLoading}
                onClick={async () => {
                  const valid = multiFormData.filter(p => p.name.trim() !== '');
                  if (valid.length === 0) { toast.error('Preencha ao menos o nome de um produto.'); return; }
                  setIsLoading(true);
                  try {
                    await apiCall('POST', '/products/bulk', valid.map(p => ({ name: p.name, description: p.description, price: p.price || 'R$ 0,00', image: p.image || null, category: p.category })));
                    setIsMultiRegisterModalOpen(false);
                    await fetchProducts();
                    await fetchProductCount();
                    toast.success(`${valid.length} produtos cadastrados com sucesso!`);
                  } catch { toast.error('Erro ao cadastrar produtos em massa.'); }
                  finally { setIsLoading(false); }
                }}
                className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50">
                {isLoading ? 'Cadastrando...' : `Cadastrar ${multiFormData.filter(p => p.name.trim() !== '').length} Produtos`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
            </div>
            <p className="text-sm text-black dark:text-white opacity-60">Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-bold">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete.id)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar bulk com imagens inválidas */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl p-8 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-4 mb-6 text-amber-500">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-2xl">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black tracking-tight uppercase">Aviso de Imagens</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8 leading-relaxed">
              Foram encontradas URLs de imagem que parecem inválidas. Deseja continuar a importação assim mesmo?
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBulkConfirm(false); setPendingBulkData([]); }}
                className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-2xl font-black uppercase tracking-widest text-xs transition-all">Cancelar</button>
              <button onClick={() => executeBulkInsert(pendingBulkData)}
                className="flex-1 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-500/20 transition-all">Continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManager;
