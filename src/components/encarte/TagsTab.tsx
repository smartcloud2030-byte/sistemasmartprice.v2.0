import { useEffect, useState } from 'react';
import { Upload, Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, GalleryImage } from '../../lib/gallery';
import { getProxyUrl } from '../../lib/utils';

const CATEGORIA = 'encarte-elementos';

interface TagsTabProps {
  onAdicionarImagem: (url: string) => void;
}

export default function TagsTab({ onAdicionarImagem }: TagsTabProps) {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

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
    </div>
  );
}
