import { useEffect, useState } from 'react';
import { Upload, Loader2, Repeat, Trash2, Check, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, deleteGalleryImage, GalleryImage } from '../../lib/gallery';
import { getProxyUrl } from '../../lib/utils';
import { ElementoImagem } from './encarteProduto';

interface GaleriaImagensTabProps {
  titulo: string;
  subtitulo: string;
  icon: React.ElementType;
  /** categoria da galeria — cada aba guarda suas imagens separadas das outras */
  categoria: string;
  /** elementos dessa categoria que já estão no encarte agora (pra marcar como ativos) */
  elementosAtivos: ElementoImagem[];
  onAdicionarImagem: (url: string, multiplo: boolean) => void;
  onRemoverDoEncarte: (url: string) => void;
}

/**
 * Aba genérica de "enviar imagem + galeria + adicionar ao encarte como
 * elemento livre". Usada por Tags e Marca (e qualquer aba futura do mesmo
 * tipo) — só muda o texto, o ícone e a categoria da galeria.
 *
 * Por padrão, escolher uma imagem substitui a que já estava no encarte
 * (mesma posição/tamanho de antes) — é o modo "uma imagem só". Ativando
 * "Permitir várias imagens", cada clique soma uma nova em vez de trocar.
 */
export default function GaleriaImagensTab({
  titulo,
  subtitulo,
  icon: Icon,
  categoria,
  elementosAtivos,
  onAdicionarImagem,
  onRemoverDoEncarte,
}: GaleriaImagensTabProps) {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [multiplo, setMultiplo] = useState(false);

  const urlsAtivas = new Set(elementosAtivos.map((im) => im.url));

  const carregarImagens = async () => {
    try {
      const lista = await listGalleryImages(categoria);
      setImagens(lista);
    } catch {
      toast.error('Não foi possível carregar as imagens salvas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { carregarImagens(); }, [categoria]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadBackgroundImage(file, categoria);
      await carregarImagens();
      toast.success('Imagem enviada!');
    } catch {
      toast.error('Falha ao enviar a imagem. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubstituir = async (img: GalleryImage, file: File) => {
    setSubstituindo(img.fullPath);
    try {
      await uploadBackgroundImage(file, categoria);
      await deleteGalleryImage(img.url);
      await carregarImagens();
      toast.success('Imagem substituída!');
    } catch {
      toast.error('Falha ao substituir a imagem. Tente novamente.');
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
      await deleteGalleryImage(pendingDelete.url);
      await carregarImagens();
      toast.success('Imagem apagada!');
      closeDeleteConfirm();
    } catch {
      toast.error('Falha ao apagar a imagem. Tente novamente.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">{titulo}</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">{subtitulo}</p>
        </div>
        <label
          title="Enviar imagem"
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

      <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2.5 cursor-pointer">
        <div>
          <p className="text-xs font-semibold text-zinc-200">Permitir várias imagens</p>
          <p className="text-[10px] text-zinc-500">
            {multiplo ? 'Cada imagem escolhida soma uma nova no encarte.' : 'Escolher outra substitui a atual, no mesmo lugar e tamanho.'}
          </p>
        </div>
        <input
          type="checkbox"
          checked={multiplo}
          onChange={(e) => setMultiplo(e.target.checked)}
          className="w-4 h-4 accent-emerald-500 flex-shrink-0"
        />
      </label>

      <div className="space-y-2">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          Clique numa imagem pra adicionar ao encarte — depois é só arrastar e redimensionar pelos cantos.
        </p>
        {isLoading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Carregando...</p>
        ) : imagens.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">Nenhuma imagem enviada ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {imagens.map((img) => {
              const ativa = urlsAtivas.has(img.url);
              return (
                <div
                  key={img.fullPath}
                  onClick={() => { onAdicionarImagem(img.url, multiplo); toast.success('Imagem adicionada ao encarte!'); }}
                  title="Adicionar ao encarte"
                  className={`group relative rounded-lg overflow-hidden border-2 aspect-square bg-zinc-800 transition-colors cursor-pointer ${
                    ativa ? 'border-emerald-500' : 'border-transparent hover:border-emerald-500'
                  }`}
                >
                  <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-contain" />

                  {ativa && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    {ativa && (
                      <button
                        title="Retirar do encarte"
                        onClick={(e) => { e.stopPropagation(); onRemoverDoEncarte(img.url); }}
                        className="flex items-center justify-center w-6 h-6 rounded bg-zinc-900/80 text-zinc-200 hover:text-amber-400"
                      >
                        <ImageOff className="w-3.5 h-3.5" />
                      </button>
                    )}
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
              );
            })}
          </div>
        )}
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-zinc-100">Apagar imagem?</h3>
            </div>
            <p className="text-sm text-zinc-400">
              Deseja realmente apagar essa imagem? Essa ação é irreversível.
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
