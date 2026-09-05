import { useEffect, useState } from 'react';
import { Upload, Check, Image, Ban, Repeat, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, deleteGalleryImage, GalleryImage } from '../../lib/gallery';
import { getProxyUrl, cn } from '../../lib/utils';
import { FUNDOS_BUILTIN } from './encarteProduto';

const CATEGORIA = 'encarte-temas';
const CATEGORIA_IMAGENS = 'encarte-elementos';
const API_SECRET = import.meta.env.VITE_API_SECRET;

const PRONTOS: { id: string; nome: string }[] = [
  { id: 'creme', nome: 'Creme' },
  { id: 'branco', nome: 'Branco' },
];

interface TemasTabProps {
  selecionada: string | null;
  onSelecionar: (url: string) => void;
  onAdicionarImagem: (url: string) => void;
}

export default function TemasTab({ selecionada, onSelecionar, onAdicionarImagem }: TemasTabProps) {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryImage | null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);

  const [imagensElementos, setImagensElementos] = useState<GalleryImage[]>([]);
  const [isLoadingElementos, setIsLoadingElementos] = useState(true);
  const [isUploadingElemento, setIsUploadingElemento] = useState(false);

  const carregarImagens = async () => {
    try {
      const lista = await listGalleryImages(CATEGORIA);
      setImagens(lista);
    } catch {
      toast.error('Não foi possível carregar os fundos salvos.');
    } finally {
      setIsLoading(false);
    }
  };

  const carregarImagensElementos = async () => {
    try {
      const lista = await listGalleryImages(CATEGORIA_IMAGENS);
      setImagensElementos(lista);
    } catch {
      toast.error('Não foi possível carregar as imagens salvas.');
    } finally {
      setIsLoadingElementos(false);
    }
  };

  useEffect(() => { carregarImagens(); carregarImagensElementos(); }, []);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await uploadBackgroundImage(file, CATEGORIA);
      await carregarImagens();
      onSelecionar(url);
      toast.success('Fundo enviado!');
    } catch {
      toast.error('Falha ao enviar o fundo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadElemento = async (file: File) => {
    setIsUploadingElemento(true);
    try {
      await uploadBackgroundImage(file, CATEGORIA_IMAGENS);
      await carregarImagensElementos();
      toast.success('Imagem enviada!');
    } catch {
      toast.error('Falha ao enviar a imagem. Tente novamente.');
    } finally {
      setIsUploadingElemento(false);
    }
  };

  const handleSubstituir = async (img: GalleryImage, file: File) => {
    setSubstituindo(img.fullPath);
    try {
      const { url } = await uploadBackgroundImage(file, CATEGORIA);
      await deleteGalleryImage(img.url);
      await carregarImagens();
      if (selecionada === img.url) onSelecionar(url);
      toast.success('Fundo substituído!');
    } catch {
      toast.error('Falha ao substituir o fundo. Tente novamente.');
    } finally {
      setSubstituindo(null);
    }
  };

  const closeDeleteConfirm = () => {
    setPendingDelete(null);
    setAuthUsername('');
    setAuthPassword('');
    setAuthError('');
    setIsVerifyingAuth(false);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    if (!authUsername.trim() || !authPassword) {
      setAuthError('Informe usuário e senha de administrador.');
      return;
    }
    setIsVerifyingAuth(true);
    setAuthError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
        body: JSON.stringify({ username: authUsername.trim(), password: authPassword }),
      });
      const data = await res.json();
      if (!data?.success) {
        setAuthError('Usuário ou senha de administrador incorretos.');
        setIsVerifyingAuth(false);
        return;
      }
      const img = pendingDelete;
      await deleteGalleryImage(img.url);
      await carregarImagens();
      if (selecionada === img.url) onSelecionar('');
      toast.success('Fundo apagado!');
      closeDeleteConfirm();
    } catch {
      setAuthError('Erro ao verificar credenciais.');
      setIsVerifyingAuth(false);
    }
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Image className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Temas</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Escolha o fundo do seu encarte</p>
        </div>
        <label
          title="Enviar novo fundo"
          className="ml-auto flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-500 transition-colors cursor-pointer"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </label>
      </div>

      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Temas prontos</h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onSelecionar('')}
            className={cn(
              'relative rounded-lg overflow-hidden border-2 aspect-[3/4] bg-zinc-800 flex items-center justify-center transition-colors',
              !selecionada ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600',
            )}
          >
            <Ban className="w-4 h-4 text-zinc-500" />
            <span className="absolute bottom-1 text-[8px] font-semibold text-zinc-400">Nenhum</span>
          </button>
          {PRONTOS.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelecionar(p.id)}
              className={cn(
                'relative rounded-lg overflow-hidden border-2 aspect-[3/4] transition-colors',
                selecionada === p.id ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600',
              )}
              style={{ background: FUNDOS_BUILTIN[p.id] }}
            >
              {selecionada === p.id && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <span className="absolute bottom-1 left-0 right-0 text-[8px] font-semibold text-zinc-600">{p.nome}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fundos já enviados</h3>
        {isLoading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Carregando...</p>
        ) : imagens.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">Nenhum fundo enviado ainda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imagens.map((img) => (
              <div
                key={img.fullPath}
                onClick={() => onSelecionar(img.url)}
                className={cn(
                  'group relative rounded-lg overflow-hidden border-2 aspect-[3/4] bg-zinc-800 transition-colors cursor-pointer',
                  selecionada === img.url ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600'
                )}
              >
                <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-cover" />
                {selecionada === img.url && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1.5 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <label
                    title="Substituir"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-emerald-400 cursor-pointer"
                  >
                    {substituindo === img.fullPath ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Repeat className="w-3.5 h-3.5" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={substituindo === img.fullPath}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleSubstituir(img, file);
                      }}
                    />
                  </label>
                  <button
                    title="Apagar"
                    onClick={(e) => { e.stopPropagation(); setPendingDelete(img); }}
                    className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-zinc-800 space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Imagens</h3>
          <label
            title="Enviar imagem"
            className="ml-auto flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-500 transition-colors cursor-pointer"
          >
            {isUploadingElemento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isUploadingElemento}
              onChange={(e) => e.target.files?.[0] && handleUploadElemento(e.target.files[0])}
            />
          </label>
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Clique numa imagem pra adicionar ao encarte — depois é só arrastar e redimensionar pelos cantos.
        </p>
        {isLoadingElementos ? (
          <p className="text-xs text-zinc-500 text-center py-6">Carregando...</p>
        ) : imagensElementos.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-6">Nenhuma imagem enviada ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {imagensElementos.map((img) => (
              <button
                key={img.fullPath}
                title="Adicionar ao encarte"
                onClick={() => { onAdicionarImagem(img.url); toast.success('Imagem adicionada ao encarte!'); }}
                className="relative rounded-lg overflow-hidden border-2 border-transparent hover:border-emerald-500 aspect-square bg-zinc-800 transition-colors"
              >
                <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-zinc-100">Apagar fundo</h3>
            </div>
            <p className="text-sm text-zinc-400">
              Essa imagem some da galeria pra sempre. Digite a senha de administrador para confirmar.
            </p>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Usuário administrador"
                autoComplete="off"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-red-500 outline-none"
                value={authUsername}
                onChange={(e) => { setAuthUsername(e.target.value); setAuthError(''); }}
              />
              <input
                type="password"
                placeholder="Senha do administrador"
                autoComplete="off"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:ring-2 focus:ring-red-500 outline-none"
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmDelete(); }}
              />
              {authError && <p className="text-xs font-bold text-red-500">{authError}</p>}
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteConfirm}
                className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-sm font-bold text-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isVerifyingAuth}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50"
              >
                {isVerifyingAuth ? 'Verificando...' : 'Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
