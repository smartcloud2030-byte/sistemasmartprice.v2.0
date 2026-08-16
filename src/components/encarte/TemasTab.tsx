import { useEffect, useState } from 'react';
import { Upload, Check, Image } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackgroundImage, listGalleryImages, GalleryImage } from '../../lib/gallery';
import { getProxyUrl, cn } from '../../lib/utils';

const CATEGORIA = 'encarte-temas';

interface TemasTabProps {
  selecionada: string | null;
  onSelecionar: (url: string) => void;
}

export default function TemasTab({ selecionada, onSelecionar }: TemasTabProps) {
  const [imagens, setImagens] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

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

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Image className="w-4 h-4 text-emerald-500" />
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Temas</h2>
          <p className="text-[11px] text-zinc-400 mt-0.5">Escolha o fundo do seu encarte</p>
        </div>
      </div>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-2xl py-8 cursor-pointer hover:border-emerald-500/50 transition-colors">
        <Upload className="w-6 h-6 text-zinc-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
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

      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fundos já enviados</h3>
        {isLoading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Carregando...</p>
        ) : imagens.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">Nenhum fundo enviado ainda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {imagens.map((img) => (
              <button
                key={img.fullPath}
                onClick={() => onSelecionar(img.url)}
                className={cn(
                  'relative rounded-lg overflow-hidden border-2 aspect-[3/4] bg-zinc-800 transition-colors',
                  selecionada === img.url ? 'border-emerald-500' : 'border-transparent hover:border-zinc-600'
                )}
              >
                <img src={getProxyUrl(img.url, { thumbnail: true })} className="w-full h-full object-cover" />
                {selecionada === img.url && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
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
