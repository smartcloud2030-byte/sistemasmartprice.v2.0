import React, { useRef, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { X } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { toast } from 'sonner';
import { ENCARTE_TEMAS, EncarteTema, MOLDE_WIDTH_PX, MOLDE_HEIGHT_PX } from '../../lib/encarteTemas';
import { DEFAULT_AREA } from './MoldeEditor';
import { uploadBackgroundImage } from '../../lib/gallery';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (MOLDE_HEIGHT_PX / MOLDE_WIDTH_PX));

interface TemaPickerProps {
  onApply: (result: { url: string; tema: EncarteTema; incluirLogo: boolean }) => void;
  onCancel: () => void;
}

export default function TemaPicker({ onApply, onCancel }: TemaPickerProps) {
  const [selected, setSelected] = useState<EncarteTema | null>(null);
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [incluirLogo, setIncluirLogo] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleSelectTema = (tema: EncarteTema) => {
    setSelected(tema);
    setTitulo(tema.nome);
    setSubtitulo('');
  };

  const handleApply = async () => {
    if (!selected || !previewRef.current) return;
    setIsGenerating(true);
    try {
      const scale = MOLDE_WIDTH_PX / PREVIEW_WIDTH;
      const canvas = await html2canvas(previewRef.current, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), 'image/png');
      });
      const file = new File([blob], `tema-${selected.id}.png`, { type: 'image/png' });
      const { url } = await uploadBackgroundImage(file, 'encarte-moldes');
      onApply({ url, tema: selected, incluirLogo });
    } catch {
      toast.error('Falha ao gerar a arte do tema.');
    } finally {
      setIsGenerating(false);
    }
  };

  const IconComp = selected ? ((LucideIcons as unknown) as Record<string, React.ElementType>)[selected.icone] : undefined;
  const tituloShadow = selected?.tituloComSombra ? '0 2px 8px rgba(0,0,0,.4)' : undefined;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest">Criar com tema</h3>
          <button onClick={onCancel} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selected ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {ENCARTE_TEMAS.map((tema) => (
              <button
                key={tema.id}
                onClick={() => handleSelectTema(tema)}
                className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative group"
                style={{
                  aspectRatio: `${MOLDE_WIDTH_PX} / ${MOLDE_HEIGHT_PX}`,
                  background: `linear-gradient(${tema.background.anguloDeg}deg, ${tema.background.cores.join(', ')})`,
                }}
              >
                <span className="absolute inset-x-0 bottom-0 p-2 text-[10px] font-black uppercase text-white bg-black/40 group-hover:bg-black/60 transition-colors">
                  {tema.nome}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="space-y-3 flex-shrink-0" style={{ width: PREVIEW_WIDTH }}>
              <div
                ref={previewRef}
                className="relative overflow-hidden"
                style={{
                  width: PREVIEW_WIDTH,
                  height: PREVIEW_HEIGHT,
                  background: `linear-gradient(${selected.background.anguloDeg}deg, ${selected.background.cores.join(', ')})`,
                }}
              >
                {IconComp && (
                  <IconComp
                    className="absolute"
                    style={{
                      left: `${selected.iconePosicao.xPct}%`,
                      top: `${selected.iconePosicao.yPct}%`,
                      width: `${selected.iconePosicao.sizePct}%`,
                      height: `${selected.iconePosicao.sizePct}%`,
                      opacity: selected.iconePosicao.opacity,
                      color: selected.tituloColor,
                    }}
                  />
                )}

                <div
                  className="absolute text-center px-2"
                  style={{ left: '5%', top: '6%', width: '90%', color: selected.tituloColor, fontFamily: selected.fontFamily }}
                >
                  <p className="font-black uppercase leading-tight" style={{ fontSize: PREVIEW_WIDTH * 0.11, textShadow: tituloShadow }}>
                    {titulo}
                  </p>
                  {subtitulo && (
                    <p className="font-semibold mt-1" style={{ fontSize: PREVIEW_WIDTH * 0.045, color: selected.subtituloColor, textShadow: tituloShadow }}>
                      {subtitulo}
                    </p>
                  )}
                </div>

                <div
                  className="absolute rounded-lg shadow-sm"
                  style={{
                    left: `${DEFAULT_AREA.xPct}%`,
                    top: `${DEFAULT_AREA.yPct}%`,
                    width: `${DEFAULT_AREA.widthPct}%`,
                    height: `${DEFAULT_AREA.heightPct}%`,
                    backgroundColor: selected.painelClaroColor,
                  }}
                />
              </div>
              <button onClick={() => setSelected(null)} className="text-[10px] font-black uppercase text-zinc-400 hover:text-zinc-600">
                ← Escolher outro tema
              </button>
            </div>

            <div className="flex-grow space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Título</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500">Subtítulo (opcional)</label>
                <input
                  type="text"
                  value={subtitulo}
                  onChange={(e) => setSubtitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <input type="checkbox" checked={incluirLogo} onChange={(e) => setIncluirLogo(e.target.checked)} />
                Incluir slot de logo
              </label>

              <div className="flex gap-2 pt-2">
                <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
                  Cancelar
                </button>
                <button
                  onClick={handleApply}
                  disabled={isGenerating || !titulo.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase disabled:opacity-50"
                >
                  {isGenerating ? 'Gerando...' : 'Usar este tema'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
