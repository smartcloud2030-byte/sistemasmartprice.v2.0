import { useEffect, useState } from 'react';
import { Upload, Check, Image, Ban, Repeat, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, deleteGalleryImage, GalleryImage, nomeClassificacao } from '../../lib/gallery';
import { getProxyUrl, cn } from '../../lib/utils';
import { FUNDOS_BUILTIN } from './encarteProduto';
import ClassificacaoBar from './ClassificacaoBar';

const CATEGORIA = 'encarte-temas';

const PRONTOS: { id: string; nome: string }[] = [
  { id: 'creme', nome: 'Creme' },
  { id: 'branco', nome: 'Branco' },
];

interface TemasTabProps {
  selecionada: string | null;
  onSelecionar: (url: string) => void;
}

export default function TemasTab({ selecionada, onSelecionar }: TemasTabProps) {
  const [classificacao, setClassificacao] = useState(CATEGORIA);
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const carregarImagens = async () => {
    setIsLoading(true);
    try {
      const lista = await listGalleryImages(classificacao);
      setImagens(lista);
    } catch {
      toast.error('Não foi possível carregar os fundos salvos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { carregarImagens(); /* eslint-disable-next-line */ }, [classificacao]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await uploadBackgroundImage(file, classificacao);
      await carregarImagens();
      onSelecionar(url);
      toast.success('Fundo enviado!');
    } catch {
      toast.error('Falha ao enviar o fundo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubstituir = async (img: GalleryImage, file: File) => {
    setSubstituindo(img.fullPath);
    try {
      const { url } = await uploadBackgroundImage(file, classificacao);
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
    setIsDeleting(false);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const img = pendingDelete;
      await deleteGalleryImage(img.url);
      await carregarImagens();
      if (selecionada === img.url) onSelecionar('');
      toast.success('Fundo apagado!');
      closeDeleteConfirm();
    } catch {
      toast.error('Falha ao apagar o fundo. Tente novamente.');
      setIsDeleting(false);
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

      <div className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fundos já enviados</h3>

        <ClassificacaoBar
          base={CATEGORIA}
          ativa={classificacao}
          onMudar={setClassificacao}
          onEstruturaMudou={carregarImagens}
        />

        <p className="text-[10px] text-zinc-500">
          Classificação <b className="text-zinc-300">{nomeClassificacao(classificacao, CATEGORIA)}</b>.
        </p>

        {isLoading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Carregando...</p>
        ) : imagens.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">Nenhum fundo nesta classificação ainda.</p>
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

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-zinc-100">Apagar fundo?</h3>
            </div>
            <p className="text-sm text-zinc-400">
              Deseja realmente apagar esse fundo? Essa ação é irreversível.
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeDeleteConfirm}
                className="flex-1 px-4 py-2 border border-zinc-700 rounded-lg hover:bg-zinc-800 text-sm font-bold text-zinc-200"
              >
                Não
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-bold disabled:opacity-50"
              >
                {isDeleting ? 'Apagando...' : 'Sim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
