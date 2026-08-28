import { useRef, useState } from 'react';
import html2canvas from 'html2canvas-pro';
import { toast } from 'sonner';
import { Undo2, Redo2, Type, Palette, Maximize2, CalendarDays, Download, Share2, Package, Plus, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { getProxyUrl, cn } from '../../lib/utils';
import EncarteProductCard from './EncarteProductCard';
import { Formato } from './formatos';
import { EncarteProduto, EstiloEncarte } from './encarteProduto';

const TOOLBAR_ITEMS = [
  { icon: Type, label: 'Fontes' },
  { icon: Type, label: 'Texto' },
  { icon: Palette, label: 'Cores' },
  { icon: Maximize2, label: 'Proporções' },
  { icon: CalendarDays, label: 'Validade' },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

interface EncarteCanvasProps {
  backgroundUrl: string | null;
  produtos: EncarteProduto[];
  estilo: EstiloEncarte;
  formato: Formato;
  produtoDetalhadoId: string | number | null;
  onAdicionarProdutos: () => void;
  onAbrirDetalhes: (id?: string | number) => void;
  onMoverProduto: (id: string | number | undefined, xPct: number, yPct: number) => void;
}

interface DragState {
  id: string | number | undefined;
  pointerId: number;
  startX: number;
  startY: number;
  origXPct: number;
  origYPct: number;
  moved: boolean;
}

export default function EncarteCanvas({
  backgroundUrl,
  produtos,
  estilo,
  formato,
  produtoDetalhadoId,
  onAdicionarProdutos,
  onAbrirDetalhes,
  onMoverProduto,
}: EncarteCanvasProps) {
  const [exportando, setExportando] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const handleDownload = async () => {
    if (!canvasRef.current || exportando) return;
    setExportando(true);
    try {
      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        backgroundColor: '#000000',
        scale: 3,
      });
      const link = document.createElement('a');
      link.download = `encarte-${formato.id}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      toast.error('Não foi possível gerar a imagem do encarte. Tente novamente.');
    } finally {
      setExportando(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, ep: EncarteProduto) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id: ep.product.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origXPct: ep.xPct,
      origYPct: ep.yPct,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!st || !rect || e.pointerId !== st.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.moved && Math.hypot(dx, dy) < 4) return;
    st.moved = true;
    const xPct = clamp(st.origXPct + (dx / rect.width) * 100, 0, 92);
    const yPct = clamp(st.origYPct + (dy / rect.height) * 100, 0, 92);
    onMoverProduto(st.id, xPct, yPct);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, ep: EncarteProduto) => {
    const st = dragRef.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    if (st && !st.moved) onAbrirDetalhes(ep.product.id);
  };

  return (
    <div className="flex-grow flex flex-col bg-zinc-950 relative">
      {/* Barra de ferramentas */}
      <div className="h-14 flex-shrink-0 border-b border-zinc-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors" title="Desfazer">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors" title="Refazer">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-zinc-800 mx-2" />

          {TOOLBAR_ITEMS.map(({ icon: Icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={exportando}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exportando ? 'Gerando...' : 'Download'}
          </button>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-black uppercase hover:bg-zinc-800 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            Compartilhar
          </button>
        </div>
      </div>

      {/* Área de preview */}
      <div className="flex-grow overflow-auto flex items-center justify-center p-8 relative">
        {produtos.length > 0 && (
          <button
            onClick={onAdicionarProdutos}
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition-colors text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            Produtos
          </button>
        )}

        <div
          ref={canvasRef}
          className="relative bg-black rounded-2xl overflow-hidden shadow-2xl"
          style={{ width: 480, aspectRatio: `${formato.ratio}` }}
        >
          {/* Fundo — preenche a caixa toda, produtos ficam por cima */}
          <div className="absolute inset-0">
            {backgroundUrl ? (
              <img src={getProxyUrl(backgroundUrl)} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <p className="text-[10px] text-zinc-600 font-semibold">Escolha um fundo na aba Temas</p>
              </div>
            )}
          </div>

          {produtos.length === 0 ? (
            <button
              onClick={onAdicionarProdutos}
              data-html2canvas-ignore="true"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 hover:bg-black/20 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-zinc-900/80 backdrop-blur flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-white drop-shadow">Adicionar produtos no encarte</p>
            </button>
          ) : (
            <div className="absolute inset-0">
              {produtos.map((ep) => (
                <div
                  key={ep.product.id}
                  className="absolute touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: `${ep.xPct}%`, top: `${ep.yPct}%` }}
                  onPointerDown={(e) => handlePointerDown(e, ep)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, ep)}
                  onPointerCancel={(e) => handlePointerUp(e, ep)}
                >
                  <EncarteProductCard
                    produto={ep}
                    estilo={estilo}
                    selecionado={ep.product.id === produtoDetalhadoId}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Páginas */}
      <div className="absolute top-[4.5rem] right-4 bg-zinc-900 border border-zinc-800 rounded-xl p-2 w-16">
        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 text-center mb-1.5">Páginas</p>
        <div className={cn('rounded-lg border-2 border-emerald-500 bg-zinc-800 flex items-end justify-center pb-1')} style={{ aspectRatio: `${formato.ratio}` }}>
          <span className="text-[10px] font-bold text-zinc-400">1</span>
        </div>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-1 px-2 py-1.5">
        <button className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-bold text-zinc-400 w-9 text-center">100%</span>
        <button className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors">
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
