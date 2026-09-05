import { useEffect, useState } from 'react';
import { Upload, Tag, Loader2, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, deleteGalleryImage, GalleryImage } from '../../lib/gallery';
import { getProxyUrl } from '../../lib/utils';

const CATEGORIA = 'encarte-elementos';

interface TagsTabProps {
  onAdicionarImagem: (url: string) => void;
}

export default function TagsTab({ onAdicionarImagem }: TagsTabProps) {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [substituindo, setSubstituindo] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const carregarImagens = async () => {
    try {
      const lista = await listGalleryImages(CATEGORIA);
      setImagens(lista);
    } catch {
      toast.error('Não foi possível carregar as imagens salvas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { carregarImagens(); }, []);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadBackgroundImage(file, CATEGORIA);
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
      await uploadBackgroundImage(file, CATEGORIA);
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
        <Tag className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Tags</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Imagens soltas sobre o encarte</p>
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
            {imagens.map((img) => (
              <div
                key={img.fullPath}
                onClick={() => { onAdicionarImagem(img.url); toast.success('Imagem adicionada ao encarte!'); }}
                title="Adicionar ao encarte"
                className="group relative rounded-lg overflow-hidden border-2 border-transparent hover:border-emerald-500 aspect-square bg-zinc-800 transition-colors cursor-pointer"
              >
                <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-contain" />

                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-1 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
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
