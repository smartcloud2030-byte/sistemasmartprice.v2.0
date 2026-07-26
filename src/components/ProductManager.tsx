import React, { useState, useEffect } from 'react';
import { useStore, Product } from '../store';
import { findDuplicateProduct } from '../lib/duplicateProductMatch';
import { Plus, Search, Edit2, Trash2, Package, RefreshCw, AlertTriangle, AlertCircle, Upload, Image, Loader2 } from 'lucide-react';
import { isValidImageUrl, getProxyUrl } from '../lib/utils';
import { toast } from 'sonner';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const GALLERY_PASSWORD = import.meta.env.VITE_GALLERY_PASSWORD || 'smartprice@admin2026';

const CATEGORY_FOLDER: Record<string, string> = {
  'MEDICAMENTO': 'medicamento', 'PERFUMARIA': 'perfumaria', 'INFANTIL': 'infantil',
  'SUPLEMENTO': 'suplementos-maromba', 'SUPLEMENTOS': 'suplementos-maromba',
  'DERMO': 'perfumaria', 'CONVENIÊNCIA': 'conveniencia', 'CONVENIENCIA': 'conveniencia',
  'LEITE': 'infantil', 'ELETRÔNICO': 'eletronicos', 'ELETRONICO': 'eletronicos',
  'PADRÃO': 'padrao', 'PADRAO': 'padrao', 'FITNESS': 'suplementos-maromba',
};

function getFolder(category: string): string {
  if (!category) return 'padrao';
  const upper = category.trim().toUpperCase();
  if (CATEGORY_FOLDER[upper]) return CATEGORY_FOLDER[upper];
  const lower = category.trim().toLowerCase();
  const valid = ['medicamento','perfumaria','infantil','suplementos-maromba','conveniencia','eletronicos','padrao','dermo','leite'];
  if (valid.includes(lower)) return lower;
  return lower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'padrao';
}

const CATEGORY_COLORS: Record<string, string> = {
  medicamento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  perfumaria: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  infantil: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  conveniencia: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  eletronicos: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  padrao: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};
function getCategoryColor(category: string) {
  const folder = getFolder(category);
  return CATEGORY_COLORS[folder] || 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
}

function formatCatName(cat: string) {
  return cat.replace(/-/g, ' ').toUpperCase();
}

type BulkDuplicate = { rowName: string; match: Product };

async function uploadToMinio(file: File, category: string, productName: string, duplicate: boolean): Promise<{ url: string; thumbUrl: string; duplicated: boolean }> {
  const folder = getFolder(category);
  const formData = new FormData();
  formData.append('image', file);
  formData.append('name', productName || '');
  formData.append('duplicate', duplicate ? 'true' : 'false');
  const res = await fetch(`/gallery/upload-nobg2/${folder}`, {
    method: 'POST',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload');
  }
  const data = await res.json();
  return { url: data.url || '', thumbUrl: data.thumbUrl || data.url || '', duplicated: data.duplicated === true };
}

const ProductManager = () => {
  const { products, fetchProducts } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Omit<Product, 'id'>>({ name: '', description: '', price: '', image: null, category: '' });
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicateOption, setDuplicateOption] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
  const [bulkDuplicates, setBulkDuplicates] = useState<BulkDuplicate[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isMultiRegisterModalOpen, setIsMultiRegisterModalOpen] = useState(false);
  const [bulkData, setBulkData] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string | number } | null>(null);
  const [deleteAuthUsername, setDeleteAuthUsername] = useState('');
  const [deleteAuthPassword, setDeleteAuthPassword] = useState('');
  const [deleteAuthError, setDeleteAuthError] = useState('');
  const [isVerifyingDeleteAuth, setIsVerifyingDeleteAuth] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [pendingBulkData, setPendingBulkData] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const initialMultiFormData = Array(20).fill(null).map(() => ({ name: '', description: '', price: '', image: '', thumb_image: '' as string | null, category: '', barcode: '', barcode2: '' }));
  const [multiFormData, setMultiFormData] = useState(initialMultiFormData);
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState('');
  const [bulkPendingFiles, setBulkPendingFiles] = useState<Record<number, File>>({});
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkUploadStatus, setBulkUploadStatus] = useState('');
  const [bulkUploadProgress, setBulkUploadProgress] = useState({ done: 0, total: 0 });
  const [isBulkDragOver, setIsBulkDragOver] = useState(false);
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);

  const lookupBarcode = async (rawCode: string) => {
    const code = rawCode.replace(/\D/g, '');
    if (code.length < 8 || isLookingUpBarcode) return;
    setIsLookingUpBarcode(true);
    try {
      const res = await fetch(`/api/barcode-lookup/${code}`, { headers: { 'x-api-token': API_SECRET } });
      if (res.status === 404) { toast.error('Produto não encontrado na base de dados.'); return; }
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Falha ao buscar produto.'); return; }
      const data = await res.json();

      // Baixa a foto e trata como se o usuário tivesse selecionado um arquivo
      // manualmente — assim, ao salvar, ela sobe pro nosso MinIO pelo mesmo
      // caminho de sempre (com remoção de fundo), em vez de ficar "emprestada"
      // direto da Cosmos.
      let imagePreview: string | null = null;
      if (data.thumbnail && !formData.image) {
        try {
          const imgRes = await fetch(data.thumbnail);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const file = new File([blob], `${code}.jpg`, { type: blob.type || 'image/jpeg' });
            setPendingFile(file);
            setDuplicateOption(false);
            imagePreview = URL.createObjectURL(file);
          }
        } catch {
          // segue sem foto se o download falhar — o resto do preenchimento continua valendo
        }
      }

      setFormData(f => ({
        ...f,
        name: f.name?.trim() ? f.name : (data.description || f.name),
        description: f.description?.trim() ? f.description : (data.brand ? `${data.brand} — ${data.description}` : (data.description || f.description)),
        image: f.image || imagePreview || f.image,
      }));
      toast.success(`Produto encontrado: ${data.description}`);
    } catch {
      toast.error('Falha ao consultar o código de barras.');
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  const filenameToName = (filename: string) => {
    const noExt = filename.replace(/\.[^.]+$/, '');
    const cleaned = noExt.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const handleBulkMultiFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!bulkDefaultCategory) { toast.error('Selecione a categoria padrão primeiro!'); return; }
    const fileArr = Array.from(files);
    let current = [...multiFormData];
    const pending = { ...bulkPendingFiles };
    let rowIndex = current.findIndex(r => !r.name.trim());
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const name = filenameToName(file.name);
      if (rowIndex === -1 || rowIndex >= current.length) {
        current = [...current, { name: '', description: '', price: '', image: '', thumb_image: '', category: '', barcode: '', barcode2: '' }];
        rowIndex = current.length - 1;
      }
      current[rowIndex] = { ...current[rowIndex], name, category: bulkDefaultCategory, image: URL.createObjectURL(file) };
      pending[rowIndex] = file;
      rowIndex = current.findIndex((r, idx) => idx > rowIndex && !r.name.trim());
      if (rowIndex === -1) rowIndex = current.length;
    }
    setMultiFormData(current);
    setBulkPendingFiles(pending);
    toast.success(fileArr.length + ' imagens selecionadas! Serão enviadas ao clicar em Cadastrar.');
  };

  const apiCall = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} falhou: ${res.status}`);
    return res.json();
  };

  const fetchProductCount = async () => {
    try { const d = await apiCall('GET', '/products/count'); setProductCount(d.count ?? null); } catch {}
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/gallery/categories', { headers: { 'x-gallery-token': GALLERY_PASSWORD } });
      const data = await res.json();
      const filtered = Array.isArray(data) ? data.filter((c: string) => !c.toLowerCase().startsWith('layout')) : [];
      setCategories(filtered);
    } catch {}
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try { await fetchProducts(); await fetchProductCount(); } catch { toast.error('Erro ao sincronizar.'); } finally { setIsSyncing(false); }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try { await fetchProducts(); await fetchProductCount(); await fetchCategories(); }
      catch { toast.error('Falha ao carregar produtos.'); }
      finally { setIsLoading(false); }
    };
    init();
  }, []);

  const selectFile = (file: File) => {
    if (!formData.category) { toast.error('Selecione uma categoria antes de escolher a imagem!'); return; }
    setPendingFile(file);
    setDuplicateOption(false);
    setFormData(f => ({ ...f, image: URL.createObjectURL(file) }));
  };

  const doUpload = async (file: File, category: string, name: string, duplicate: boolean): Promise<{ url: string; thumbUrl: string; duplicated: boolean } | null> => {
    setIsUploading(true);
    setUploadProgress(5);
    setUploadStep('Enviando imagem...');
    const steps = duplicate
      ? [
          { p: 20, l: 'Enviando para o servidor...' },
          { p: 40, l: 'Verificando fundo da imagem...' },
          { p: 60, l: 'Duplicando foto...' },
          { p: 80, l: 'Quase pronto...' },
        ]
      : [
          { p: 20, l: 'Enviando para o servidor...' },
          { p: 40, l: 'Verificando fundo da imagem...' },
          { p: 65, l: 'Processando...' },
          { p: 80, l: 'Quase pronto...' },
        ];
    let i = 0;
    const iv = setInterval(() => {
      if (i < steps.length) { setUploadProgress(steps[i].p); setUploadStep(steps[i].l); i++; }
    }, 2000);
    try {
      const result = await uploadToMinio(file, category, name, duplicate);
      clearInterval(iv);
      setUploadProgress(100); setUploadStep('Concluído!');
      await new Promise(r => setTimeout(r, 700));
      return result;
    } catch (e: any) {
      clearInterval(iv);
      toast.error('Erro no upload: ' + (e.message || 'tente novamente'));
      return null;
    } finally {
      setIsUploading(false); setUploadProgress(0); setUploadStep('');
    }
  };

  const saveProduct = async () => {
    let finalImage = formData.image;
    let finalThumb = formData.thumb_image;

    if (pendingFile) {
      const result = await doUpload(pendingFile, formData.category, formData.name, duplicateOption);
      if (!result) return;
      finalImage = result.url;
      finalThumb = result.thumbUrl;
      if (duplicateOption && !result.duplicated) {
        toast.warning('Não foi possível duplicar a foto desta vez — a imagem foi salva normalmente, sem o efeito de 2 unidades.');
      }
    }

    const dataToSave = { ...formData, image: finalImage?.startsWith('blob:') ? null : finalImage, thumb_image: finalThumb?.startsWith('blob:') ? null : finalThumb };

    try {
      if (editingProduct?.id) {
        await apiCall('PUT', `/products/${editingProduct.id}`, dataToSave);
        toast.success('Produto atualizado!');
      } else {
        await apiCall('POST', '/products', dataToSave);
        toast.success('Produto cadastrado!');
      }
      setIsModalOpen(false);
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', image: null, category: '' });
      setPendingFile(null);
      setDuplicateOption(false);
      await fetchProducts(); await fetchProductCount();
    } catch { toast.error('Erro ao salvar produto.'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) { toast.error('Informe a identificação do produto.'); return; }
    if (!formData.description?.trim()) { toast.error('Informe a descrição do produto.'); return; }
    if (!formData.price?.trim()) { toast.error('Informe o preço do produto.'); return; }
    if (!formData.category) { toast.error('Selecione uma categoria.'); return; }

    const match = findDuplicateProduct({ name: formData.name, barcode: formData.barcode, barcode2: formData.barcode2 }, products, editingProduct?.id);
    if (match) { setDuplicateMatch(match); return; }

    await saveProduct();
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(bulkData);
      if (!Array.isArray(parsed)) throw new Error('Formato inválido');
      const invalid = parsed.filter(p => p.image && !isValidImageUrl(p.image));
      if (invalid.length > 0) { setPendingBulkData(parsed); setShowBulkConfirm(true); return; }
      await executeBulkInsert(parsed);
    } catch { toast.error('Erro ao importar. Verifique o formato JSON.'); }
  };

  const executeBulkInsert = async (data: any[]) => {
    try {
      await apiCall('POST', '/products/bulk', data.map(p => ({ name: p.name || 'Sem nome', description: p.description || '', price: p.price || 'R$ 0,00', image: p.image || null, category: p.category || '' })));
      setIsBulkModalOpen(false); setBulkData(''); setShowBulkConfirm(false); setPendingBulkData([]);
      await fetchProducts(); await fetchProductCount();
      toast.success('Produtos importados!');
    } catch { toast.error('Erro ao importar produtos.'); }
  };

  const handleDelete = async (id: string | number) => {
    try {
      const product = products.find(p => p.id == id);
      await apiCall('DELETE', `/products/${id}`);
      if (product?.image && product.image.includes('imagens.sistemasmartprice.com.br')) {
        try {
          const url = new URL(product.image);
          const objectPath = url.pathname.split('/').filter(Boolean).slice(1).join('/');
          await fetch(`/gallery/delete/${objectPath}`, { method: 'DELETE', headers: { 'x-gallery-token': GALLERY_PASSWORD } });
        } catch {}
      }
      toast.success('Produto excluído!');
      closeDeleteConfirm();
      fetchProducts(); fetchProductCount();
    } catch { toast.error('Erro ao excluir produto.'); closeDeleteConfirm(); }
  };

  const closeDeleteConfirm = () => {
    setConfirmDelete(null);
    setDeleteAuthUsername('');
    setDeleteAuthPassword('');
    setDeleteAuthError('');
  };

  const handleConfirmDeleteWithAuth = async () => {
    if (!confirmDelete) return;
    if (!deleteAuthUsername.trim() || !deleteAuthPassword) {
      setDeleteAuthError('Informe usuário e senha de administrador.');
      return;
    }
    setIsVerifyingDeleteAuth(true);
    setDeleteAuthError('');
    try {
      const result = await apiCall('POST', '/admin/login', { username: deleteAuthUsername.trim(), password: deleteAuthPassword });
      if (!result?.success) {
        setDeleteAuthError('Usuário ou senha de administrador incorretos.');
        setIsVerifyingDeleteAuth(false);
        return;
      }
      await handleDelete(confirmDelete.id);
    } catch {
      setDeleteAuthError('Erro ao verificar credenciais.');
    } finally {
      setIsVerifyingDeleteAuth(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    const matchesTerm = !term || (p.name || '').toLowerCase().includes(term) || (p.category || '').toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term) || (p.barcode2 || '').toLowerCase().includes(term);
    const matchesCategory = !categoryFilter || (p.category || '').trim().toLowerCase() === categoryFilter.trim().toLowerCase();
    return matchesTerm && matchesCategory;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ name: product.name, description: product.description, price: product.price, image: product.image, thumb_image: product.thumb_image || null, category: product.category, barcode: product.barcode || '', barcode2: product.barcode2 || '' });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', description: '', price: '', image: null, category: '' });
    }
    setPendingFile(null);
    setDuplicateOption(false);
    setDuplicateMatch(null);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2 text-black dark:text-white">
            <Package className="w-5 h-5 text-blue-600" />
            Gerenciar produtos
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {productCount ?? products.length} {(productCount ?? products.length) === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setMultiFormData(initialMultiFormData); setBulkPendingFiles({}); setBulkDefaultCategory(''); setBulkDuplicates([]); setIsMultiRegisterModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold">
            <Upload className="w-4 h-4" /> Cadastrar em massa
          </button>
          <button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold">
            <Plus className="w-4 h-4" /> Novo produto
          </button>
        </div>
      </div>

      {/* Search + filtro */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
          <input type="text" placeholder="Buscar por nome, categoria ou código de barras" className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none text-sm text-black dark:text-white focus:ring-2 focus:ring-blue-500"
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <select className="sm:w-52 px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none text-sm text-black dark:text-white"
          value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">Todas categorias</option>
          {categories.map(cat => <option key={cat} value={cat}>{formatCatName(cat)}</option>)}
        </select>
      </div>

      {/* Lista em cards */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center gap-4 opacity-60">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <p className="font-medium text-black dark:text-white">Carregando produtos...</p>
        </div>
      ) : filteredProducts.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredProducts.map((product, index) => (
            <div key={product.id || index} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
              <div className="h-28 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center overflow-hidden">
                {product.image ? (
                  <img src={(product.thumb_image || product.image).startsWith('blob:') ? (product.thumb_image || product.image) : getProxyUrl(product.thumb_image || product.image)} alt={product.name} className="w-full h-full object-cover" loading="lazy" decoding="async" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                ) : <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />}
              </div>
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                <h3 className="font-medium text-sm text-black dark:text-white leading-snug line-clamp-2">{product.name}</h3>
                <div className="flex items-center gap-2 flex-wrap mt-auto">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">{product.price}</span>
                  {product.category && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${getCategoryColor(product.category)}`}>{formatCatName(product.category)}</span>
                  )}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <button onClick={() => openModal(product)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button onClick={() => product.id !== undefined && setConfirmDelete({ id: product.id })} className="px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center opacity-40 bg-white dark:bg-zinc-800 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-20 text-black dark:text-white" />
          <p className="font-medium text-black dark:text-white">Nenhum produto encontrado.</p>
        </div>
      )}

      {/* Modal Novo/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[95vh]">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-base font-semibold text-black dark:text-white">{editingProduct ? 'Editar produto' : 'Novo produto'}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Preencha os dados abaixo.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-black dark:text-white opacity-60 hover:opacity-100 text-2xl leading-none">&times;</button>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3 custom-scrollbar">
              {isUploading && (
                <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-blue-500 animate-bounce" />
                      <span className="text-sm text-blue-600 font-medium">{uploadStep}</span>
                    </div>
                    <span className="text-xs font-bold text-blue-500">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all duration-700" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <form id="product-form" onSubmit={handleSubmit} className="space-y-3 text-black dark:text-white">

                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Identificação</p>
                  <input required type="text" placeholder="Nome do produto" spellCheck lang="pt-BR" className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <input type="text" placeholder="Código de barras (bipe ou digite)" className="w-full pl-3 pr-9 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                        value={formData.barcode || ''}
                        onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupBarcode(formData.barcode || ''); } }}
                        onBlur={e => lookupBarcode(e.target.value)} />
                      <button type="button" onClick={() => lookupBarcode(formData.barcode || '')} disabled={isLookingUpBarcode}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
                        title="Buscar produto pelo código de barras">
                        {isLookingUpBarcode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </button>
                    </div>
                    <input type="text" placeholder="2º código de barras" className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                      value={formData.barcode2 || ''} onChange={e => setFormData({ ...formData, barcode2: e.target.value })} />
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Preço e categoria</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input required type="text" placeholder="0,00" className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                      value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} />
                    <div>
                      {showNewCategory ? (
                        <div className="flex gap-1">
                          <input type="text" placeholder="Nova categoria" className="flex-1 min-w-0 px-2 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-black dark:text-white"
                            value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                          <button type="button" className="shrink-0 px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700"
                            onClick={async () => {
                              if (!newCategory.trim()) return;
                              const folder = newCategory.trim().toLowerCase().replace(/\s+/g, '-');
                              try { await fetch('/gallery/categories', { method: 'POST', headers: { 'x-gallery-token': GALLERY_PASSWORD, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: folder }) }); } catch {}
                              await fetchCategories();
                              setFormData({ ...formData, category: folder });
                              setNewCategory(''); setShowNewCategory(false);
                              toast.success('Categoria criada!');
                            }}>OK</button>
                          <button type="button" className="shrink-0 px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-black dark:text-white"
                            onClick={() => { setShowNewCategory(false); setNewCategory(''); }}>✕</button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <select required className="flex-1 min-w-0 px-2 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                            value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                            <option value="">Selecione...</option>
                            {categories.map(cat => <option key={cat} value={cat}>{formatCatName(cat)}</option>)}
                          </select>
                          <button type="button" className="shrink-0 w-9 h-9 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-lg font-bold hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center justify-center text-black dark:text-white"
                            onClick={() => setShowNewCategory(true)}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Descrição</p>
                  <textarea required rows={2} spellCheck lang="pt-BR" className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none text-black dark:text-white"
                    value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Imagem</p>
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-20 h-20 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center relative">
                      {formData.image ? (
                        <>
                          <img src={formData.image.startsWith('blob:') ? formData.image : getProxyUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                          <button type="button" onClick={() => { setFormData({ ...formData, image: null }); setPendingFile(null); setDuplicateOption(false); }}
                            className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </>
                      ) : <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-xs text-blue-600 font-medium truncate">
                          {pendingFile ? `✓ ${pendingFile.name}` : 'Selecionar imagem'}
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }} />
                      </label>
                      <input type="text" placeholder="ou cole a URL aqui"
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                        value={formData.image?.startsWith('blob:') ? '' : (formData.image || '')}
                        onChange={e => { setPendingFile(null); setDuplicateOption(false); setFormData({ ...formData, image: e.target.value }); }} />
                      {pendingFile && (
                        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                          <input type="checkbox" checked={duplicateOption} onChange={e => setDuplicateOption(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500" />
                          Duplicar foto (2 unidades sobrepostas)
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium text-black dark:text-white">Cancelar</button>
              <button type="submit" form="product-form" disabled={isUploading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold disabled:opacity-50">
                {isUploading ? uploadStep : (editingProduct ? 'Salvar alterações' : 'Cadastrar produto')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar JSON */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-black dark:text-white">Importar JSON</h3>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-black dark:text-white opacity-60 hover:opacity-100 text-xl">&times;</button>
            </div>
            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
              <textarea rows={10} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg font-mono text-xs text-black dark:text-white"
                placeholder='[{"name": "Produto A", "price": "R$ 10,00"}]' value={bulkData} onChange={e => setBulkData(e.target.value)} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsBulkModalOpen(false)} className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-black dark:text-white">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Importar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cadastrar Vários */}
      {isMultiRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-7xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-emerald-600 text-white">
              <div>
                <h3 className="text-xl font-bold">Cadastrar Vários Produtos</h3>
                <p className="text-xs opacity-90">Preencha os campos abaixo para cadastrar múltiplos produtos de uma vez.</p>
              </div>
              <button onClick={() => setIsMultiRegisterModalOpen(false)} className="hover:bg-white/20 p-2 rounded-full"><Plus className="w-6 h-6 rotate-45" /></button>
            </div>
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Categoria padrão do lote:</label>
                  <select className="px-2 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-black dark:text-white"
                    value={bulkDefaultCategory} onChange={e => setBulkDefaultCategory(e.target.value)}>
                    <option value="">Selecione...</option>
                    {categories.map(cat => <option key={cat} value={cat}>{formatCatName(cat)}</option>)}
                  </select>
                </div>
              </div>

              <label
                onDragOver={e => { e.preventDefault(); if (bulkDefaultCategory && !isBulkUploading) setIsBulkDragOver(true); }}
                onDragLeave={() => setIsBulkDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsBulkDragOver(false);
                  if (!bulkDefaultCategory || isBulkUploading) return;
                  handleBulkMultiFileSelect(e.dataTransfer.files);
                }}
                className={`flex items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors ${
                  !bulkDefaultCategory || isBulkUploading
                    ? 'border-zinc-300 dark:border-zinc-700 text-zinc-400 cursor-not-allowed'
                    : isBulkDragOver
                      ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 cursor-pointer'
                      : 'border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/30 cursor-pointer'
                }`}
              >
                <Upload className="w-4 h-4" />
                Arraste várias imagens aqui ou clique para selecionar (remove fundo com IA)
                <input type="file" accept="image/*" multiple disabled={!bulkDefaultCategory || isBulkUploading} className="hidden"
                  onChange={e => handleBulkMultiFileSelect(e.target.files)} />
              </label>

              {isBulkUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {bulkUploadStatus}
                    </span>
                    <span>{bulkUploadProgress.done}/{bulkUploadProgress.total}</span>
                  </div>
                  <div className="w-full h-2 bg-emerald-200 dark:bg-emerald-900/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                      style={{ width: `${bulkUploadProgress.total ? (bulkUploadProgress.done / bulkUploadProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto p-6 bg-zinc-50 dark:bg-zinc-950 custom-scrollbar">
              <div className="grid grid-cols-[40px_1fr_100px_100px_120px_120px_1fr_1fr_60px] gap-3 mb-4 text-xs font-bold uppercase tracking-wider text-zinc-500 px-2">
                <span>#</span><span>Nome</span><span>Preço</span><span>Categoria</span><span>Cód. Barras 1</span><span>Cód. Barras 2</span><span>Descrição</span><span>URL da Imagem</span><span>Preview</span>
              </div>
              <div className="space-y-2">
                {multiFormData.map((item, index) => (
                  <div key={index} className="grid grid-cols-[40px_1fr_100px_100px_120px_120px_1fr_1fr_60px] gap-3 items-center bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <span className="text-xs font-bold text-center text-zinc-400">{index + 1}</span>
                    <input type="text" placeholder="Nome" spellCheck lang="pt-BR" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.name} onChange={e => { const d = [...multiFormData]; d[index].name = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="R$ 0,00" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.price} onChange={e => { const d = [...multiFormData]; d[index].price = e.target.value; setMultiFormData(d); }} />
                    <select className="w-full px-2 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.category} onChange={e => { const d = [...multiFormData]; d[index].category = e.target.value; setMultiFormData(d); }}>
                      <option value="">Categoria...</option>
                      {categories.map(cat => <option key={cat} value={cat}>{formatCatName(cat)}</option>)}
                    </select>
                    <input type="text" placeholder="Cód. barras 1" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.barcode || ''} onChange={e => { const d = [...multiFormData]; d[index].barcode = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="Cód. barras 2" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.barcode2 || ''} onChange={e => { const d = [...multiFormData]; d[index].barcode2 = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="Descrição" spellCheck lang="pt-BR" className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.description} onChange={e => { const d = [...multiFormData]; d[index].description = e.target.value; setMultiFormData(d); }} />
                    <input type="text" placeholder="https://..." className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-sm text-black dark:text-white"
                      value={item.image} onChange={e => { const d = [...multiFormData]; d[index].image = e.target.value; setMultiFormData(d); }} />
                    <div className="flex justify-center">
                      <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded border overflow-hidden flex items-center justify-center">
                        {item.image ? <img src={item.image.startsWith('blob:') ? item.image : getProxyUrl(item.image)} alt="Preview" className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/40x40?text=Err'; }} />
                          : <Package className="w-4 h-4 text-zinc-300" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex justify-end gap-3">
              <button onClick={() => setIsMultiRegisterModalOpen(false)} className="px-6 py-2.5 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 font-bold text-black dark:text-white">Cancelar</button>
              <button disabled={isLoading || isBulkUploading} onClick={async () => {
                const rows = [...multiFormData];

                const validForDuplicateCheck = rows.filter(p => p.name.trim());
                if (!validForDuplicateCheck.length) { toast.error('Preencha ao menos um produto.'); return; }

                const duplicates: BulkDuplicate[] = [];
                for (const row of validForDuplicateCheck) {
                  const match = findDuplicateProduct({ name: row.name, barcode: row.barcode, barcode2: row.barcode2 }, products);
                  if (match) duplicates.push({ rowName: row.name, match });
                }
                if (duplicates.length > 0) { setBulkDuplicates(duplicates); return; }

                const pendingEntries = Object.entries(bulkPendingFiles);
                if (pendingEntries.length > 0) {
                  setIsBulkUploading(true);
                  setBulkUploadProgress({ done: 0, total: pendingEntries.length });

                  const CONCURRENCY = 3; // processa várias imagens ao mesmo tempo (a IA de remoção de fundo suporta chamadas simultâneas)
                  let doneCount = 0;
                  let cursor = 0;
                  const advance = () => { doneCount++; setBulkUploadProgress({ done: doneCount, total: pendingEntries.length }); };

                  const worker = async () => {
                    while (cursor < pendingEntries.length) {
                      const myIndex = cursor++;
                      const [idxStr, file] = pendingEntries[myIndex];
                      const idx = Number(idxStr);
                      const row = rows[idx];
                      if (!row) { advance(); continue; }
                      setBulkUploadStatus(`Removendo fundo: ${row.name}`);
                      try {
                        const result = await uploadToMinio(file, row.category || bulkDefaultCategory, row.name, false);
                        rows[idx] = { ...row, image: result.url, thumb_image: result.thumbUrl };
                      } catch (e: any) {
                        toast.error(`Falha em ${row.name}: ${e.message || 'erro no upload'}`);
                      }
                      advance();
                    }
                  };

                  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pendingEntries.length) }, worker));

                  setMultiFormData(rows);
                  setBulkPendingFiles({});
                  setIsBulkUploading(false);
                  setBulkUploadStatus('');
                  setBulkUploadProgress({ done: 0, total: 0 });
                }

                const valid = rows.filter(p => p.name.trim());
                setIsLoading(true);
                try {
                  await apiCall('POST', '/products/bulk', valid.map(p => ({ name: p.name, description: p.description, price: p.price || 'R$ 0,00', image: p.image || null, thumb_image: p.thumb_image || null, category: p.category, barcode: p.barcode || null, barcode2: p.barcode2 || null })));
                  setIsMultiRegisterModalOpen(false);
                  await fetchProducts(); await fetchProductCount();
                  toast.success(`${valid.length} produtos cadastrados!`);
                } catch { toast.error('Erro ao cadastrar produtos.'); } finally { setIsLoading(false); }
              }} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold disabled:opacity-50">
                {isBulkUploading ? bulkUploadStatus : isLoading ? 'Cadastrando...' : `Cadastrar ${multiFormData.filter(p => p.name.trim()).length} Produtos`}
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
            <p className="text-sm text-black dark:text-white opacity-60">Esta ação não pode ser desfeita. Peça ao administrador para digitar a senha dele para confirmar.</p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Usuário administrador"
                autoComplete="off"
                className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none text-black dark:text-white"
                value={deleteAuthUsername}
                onChange={e => { setDeleteAuthUsername(e.target.value); setDeleteAuthError(''); }}
              />
              <input
                type="password"
                placeholder="Senha do administrador"
                autoComplete="off"
                className="w-full px-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none text-black dark:text-white"
                value={deleteAuthPassword}
                onChange={e => { setDeleteAuthPassword(e.target.value); setDeleteAuthError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirmDeleteWithAuth(); }}
              />
              {deleteAuthError && <p className="text-xs font-bold text-red-500">{deleteAuthError}</p>}
            </div>
            <div className="flex gap-3">
              <button onClick={closeDeleteConfirm} className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-bold text-black dark:text-white">Cancelar</button>
              <button onClick={handleConfirmDeleteWithAuth} disabled={isVerifyingDeleteAuth} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50">
                {isVerifyingDeleteAuth ? 'Verificando...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar bulk */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-4 mb-6 text-amber-500">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase">Aviso de Imagens</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8">Há URLs de imagem possivelmente inválidas. Deseja continuar mesmo assim?</p>
            <div className="flex gap-3">
              <button onClick={() => { setShowBulkConfirm(false); setPendingBulkData([]); }} className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Cancelar</button>
              <button onClick={() => executeBulkInsert(pendingBulkData)} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs">Continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar produto duplicado */}
      {duplicateMatch && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-4 mb-6 text-amber-500">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase">Produto já cadastrado</h3>
            </div>
            <div className="flex items-center gap-4 mb-6 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
              <div className="w-16 h-16 shrink-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center">
                {duplicateMatch.image ? (
                  <img src={(duplicateMatch.thumb_image || duplicateMatch.image).startsWith('blob:') ? (duplicateMatch.thumb_image || duplicateMatch.image) : getProxyUrl(duplicateMatch.thumb_image || duplicateMatch.image)} alt={duplicateMatch.name} className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                ) : <Package className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-black dark:text-white truncate">{duplicateMatch.name}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{duplicateMatch.category}</p>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8">Deseja editá-lo em vez de cadastrar um novo?</p>
            <div className="flex gap-3">
              <button onClick={() => setDuplicateMatch(null)} className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Cancelar</button>
              <button onClick={() => { const match = duplicateMatch; setDuplicateMatch(null); if (match) openModal(match); }} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs">Editar produto existente</button>
            </div>
            <button onClick={() => { setDuplicateMatch(null); saveProduct(); }} className="w-full mt-3 py-2 text-xs font-bold uppercase text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-center">
              {editingProduct?.id ? 'Salvar mesmo assim' : 'Cadastrar mesmo assim'}
            </button>
          </div>
        </div>
      )}

      {/* Duplicatas no cadastro em massa */}
      {bulkDuplicates.length > 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-4 mb-6 text-amber-500 shrink-0">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase">Produtos já cadastrados</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-4 shrink-0">
              {bulkDuplicates.length} {bulkDuplicates.length === 1 ? 'linha bate' : 'linhas batem'} com produtos já existentes. Ajuste ou remova essas linhas antes de cadastrar.
            </p>
            <div className="space-y-2 overflow-y-auto mb-6">
              {bulkDuplicates.map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
                  <div className="w-12 h-12 shrink-0 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center">
                    {d.match.image ? (
                      <img src={(d.match.thumb_image || d.match.image).startsWith('blob:') ? (d.match.thumb_image || d.match.image) : getProxyUrl(d.match.thumb_image || d.match.image)} alt={d.match.name} className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                    ) : <Package className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />}
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-black dark:text-white truncate">{d.rowName}</p>
                    <p className="text-zinc-500 dark:text-zinc-400 truncate">já existe como "{d.match.name}"</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setBulkDuplicates([])} className="shrink-0 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManager;
