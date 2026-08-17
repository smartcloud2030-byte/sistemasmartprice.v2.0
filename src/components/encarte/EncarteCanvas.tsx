import { useState } from 'react';
import { Undo2, Redo2, LayoutTemplate, Type, Palette, Maximize2, CalendarDays, Download, Share2, Package, Plus, ZoomIn, ZoomOut, Check, ChevronDown } from 'lucide-react';
import { Product } from '../../store';
import { getProxyUrl, cn } from '../../lib/utils';
import EncarteProductCard from './EncarteProductCard';

interface Formato {
  id: 'a4' | 'post';
  label: string;
  sublabel: string;
  ratio: number; // largura / altura
}

const FORMATOS: Formato[] = [
  { id: 'a4', label: 'A4 Vertical', sublabel: 'Impressão', ratio: 210 / 297 },
  { id: 'post', label: 'Post Vertical', sublabel: 'Instagram, Facebook', ratio: 1080 / 1350 },
];

const TOOLBAR_ITEMS = [
  { icon: Type, label: 'Fontes' },
  { icon: Type, label: 'Texto' },
  { icon: Palette, label: 'Cores' },
  { icon: Maximize2, label: 'Proporções' },
  { icon: CalendarDays, label: 'Validade' },
];

interface EncarteCanvasProps {
  backgroundUrl: string | null;
  produtos: Product[];
  onAdicionarProdutos: () => void;
}

export default function EncarteCanvas({ backgroundUrl, produtos, onAdicionarProdutos }: EncarteCanvasProps) {
  const [formato, setFormato] = useState<Formato>(FORMATOS[0]);
  const [posicaoAberta, setPosicaoAberta] = useState(false);

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

          <div className="relative">
            <button
              onClick={() => setPosicaoAberta((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors text-xs font-semibold"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              Posição
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {posicaoAberta && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-50">
                {FORMATOS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setFormato(f); setPosicaoAberta(false); }}
                    className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">{f.label}</p>
                      <p className="text-[10px] text-zinc-500">{f.sublabel}</p>
                    </div>
                    {formato.id === f.id && <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

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
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-black uppercase hover:bg-emerald-500 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-xs font-black uppercase hover:bg-zinc-800 transition-colors">
            <Share2 className="w-3.5 h-3.5" />
            Compartilhar
          </button>
        </div>
      </div>

      {/* Área de preview */}
      <div className="flex-grow overflow-auto flex items-center justify-center p-8" onClick={() => posicaoAberta && setPosicaoAberta(false)}>
        <div
          className="bg-black rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ width: 480, aspectRatio: `${formato.ratio}` }}
        >
          <div className="w-full flex-shrink-0" style={{ height: backgroundUrl ? undefined : '30%' }}>
            {backgroundUrl ? (
              <img src={getProxyUrl(backgroundUrl)} className="w-full h-auto block" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                <p className="text-[10px] text-zinc-600 font-semibold">Escolha um fundo na aba Temas</p>
              </div>
            )}
          </div>
          {produtos.length === 0 ? (
            <button
              onClick={onAdicionarProdutos}
              className="flex-grow flex flex-col items-center justify-center gap-3 bg-black hover:bg-zinc-900 transition-colors"
            >
              <div className="w-11 h-11 rounded-xl bg-zinc-800 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-zinc-400">Adicionar produtos no encarte</p>
            </button>
          ) : (
            <div className="flex-grow bg-black overflow-y-auto p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                {produtos.map((p) => (
                  <EncarteProductCard key={p.id} product={p} />
                ))}
              </div>
              <button
                onClick={onAdicionarProdutos}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-zinc-700 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-colors text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar mais produtos
              </button>
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
