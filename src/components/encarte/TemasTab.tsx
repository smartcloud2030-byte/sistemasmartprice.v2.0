import { useEffect, useState } from 'react';
import { Upload, Check } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, GalleryImage } from '../../lib/gallery';
import { getProxyUrl, cn } from '../../lib/utils';

const CATEGORIA = 'encarte-temas';

export default function TemasTab() {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);

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

  useEffect(() => { carregarImagens(); }, []);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadBackgroundImage(file, CATEGORIA);
      await carregarImagens();
      toast.success('Fundo enviado!');
    } catch {
      toast.error('Falha ao enviar o fundo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 w-full max-w-4xl mx-auto">
      <div>
        <h2 className="text-sm font-black uppercase tracking-widest">Temas</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Escolha o fundo do encarte que você vai subir.</p>
      </div>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl py-10 cursor-pointer hover:border-emerald-500/50 transition-colors">
        <Upload className="w-7 h-7 text-zinc-400" />
        <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
          {isUploading ? 'Enviando...' : 'Enviar novo fundo'}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        />
      </label>

      <div className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Fundos já enviados</h3>
        {isLoading ? (
          <p className="text-xs text-zinc-400 text-center py-8">Carregando...</p>
        ) : imagens.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">Nenhum fundo enviado ainda.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {imagens.map((img) => (
              <button
                key={img.fullPath}
                onClick={() => setSelecionada(img.url)}
                className={cn(
                  'relative rounded-xl overflow-hidden border-2 aspect-[3/4] bg-zinc-100 dark:bg-zinc-800 transition-colors',
                  selecionada === img.url ? 'border-emerald-500' : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-600'
                )}
              >
                <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-cover" />
                {selecionada === img.url && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
