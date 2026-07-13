import React, { useRef, useState } from 'react';
import { useStore, createDefaultLayout, Layout } from '../store';
import { X, Save, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// Tela experimental: folha A4 em branco com réguas e caixas arrastáveis para
// montar um estilo do zero (em vez de espelhar um modelo já pronto). O
// resultado é salvo em `testLayouts` ("Meus Estilos"), separado dos modelos
// oficiais em `layouts`, para o admin poder excluir sem afetar nada existente.

const PAGE_WIDTH = 794; // 210mm @ 96dpi, mesma referência do CanvasPreview
const PAGE_HEIGHT = 1123; // 297mm @ 96dpi
const PREVIEW_WIDTH = 380;
const SCALE = PREVIEW_WIDTH / PAGE_WIDTH;
const PREVIEW_HEIGHT = PAGE_HEIGHT * SCALE;
const SNAP_THRESHOLD = 12; // px em coordenada real (794x1123)

type BoxKey = 'name' | 'subtitle' | 'description' | 'price' | 'image';

interface BoxState { x: number; y: number; width: number; height: number; }

const BOX_DEFS: { key: BoxKey; label: string; classes: string }[] = [
  { key: 'name', label: 'Nome', classes: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  { key: 'subtitle', label: 'Subtítulo', classes: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  { key: 'description', label: 'Descrição', classes: 'border-zinc-500 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  { key: 'price', label: 'Preço', classes: 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  { key: 'image', label: 'Imagem', classes: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
];

const INITIAL_BOXES: Record<BoxKey, BoxState> = {
  name: { x: 47, y: 100, width: 700, height: 60 },
  subtitle: { x: 47, y: 170, width: 700, height: 30 },
  description: { x: 47, y: 210, width: 700, height: 40 },
  price: { x: 247, y: 400, width: 300, height: 120 },
  image: { x: 272, y: 580, width: 250, height: 250 },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CriarEstiloModal({ isOpen, onClose }: Props) {
  const addTestLayout = useStore((s) => s.addTestLayout);
  const [name, setName] = useState('');
  const [boxes, setBoxes] = useState<Record<BoxKey, BoxState>>(INITIAL_BOXES);
  const [activeGuides, setActiveGuides] = useState({ h: false, v: false });
  const dragState = useRef<{ key: BoxKey; startX: number; startY: number; boxX: number; boxY: number; boxW: number; boxH: number; mode: 'move' | 'resize' } | null>(null);

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / SCALE;
    const dy = (e.clientY - drag.startY) / SCALE;
    setBoxes((prev) => {
      const b = prev[drag.key];
      if (drag.mode === 'resize') {
        const width = Math.max(40, Math.round(drag.boxW + dx));
        const height = Math.max(20, Math.round(drag.boxH + dy));
        return { ...prev, [drag.key]: { ...b, width, height } };
      }
      let newX = Math.round(drag.boxX + dx);
      let newY = Math.round(drag.boxY + dy);
      const centerX = newX + b.width / 2;
      const centerY = newY + b.height / 2;
      const snappedV = Math.abs(centerX - PAGE_WIDTH / 2) < SNAP_THRESHOLD;
      const snappedH = Math.abs(centerY - PAGE_HEIGHT / 2) < SNAP_THRESHOLD;
      if (snappedV) newX = Math.round(PAGE_WIDTH / 2 - b.width / 2);
      if (snappedH) newY = Math.round(PAGE_HEIGHT / 2 - b.height / 2);
      setActiveGuides({ h: snappedH, v: snappedV });
      return { ...prev, [drag.key]: { ...b, x: newX, y: newY } };
    });
  };

  const onPointerUp = () => {
    dragState.current = null;
    setActiveGuides({ h: false, v: false });
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  const startDrag = (key: BoxKey, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const b = boxes[key];
    dragState.current = { key, startX: e.clientX, startY: e.clientY, boxX: b.x, boxY: b.y, boxW: b.width, boxH: b.height, mode };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  if (!isOpen) return null;

  const centerBox = (key: BoxKey) => {
    setBoxes((prev) => ({ ...prev, [key]: { ...prev[key], x: Math.round((PAGE_WIDTH - prev[key].width) / 2) } }));
  };

  const handleClose = () => {
    setName('');
    setBoxes(INITIAL_BOXES);
    onClose();
  };

  const handleSave = () => {
    if (!name.trim()) { toast.error('Digite um nome para o estilo.'); return; }
    const base = createDefaultLayout(name.trim());
    const layout: Layout = {
      ...base,
      textElements1: {
        ...base.textElements1,
        name: { ...base.textElements1.name, x: boxes.name.x, y: boxes.name.y, width: boxes.name.width },
        subtitle: { ...base.textElements1.subtitle, x: boxes.subtitle.x, y: boxes.subtitle.y, width: boxes.subtitle.width },
        description: { ...base.textElements1.description, x: boxes.description.x, y: boxes.description.y, width: boxes.description.width },
        price: { ...base.textElements1.price, x: boxes.price.x, y: boxes.price.y, width: boxes.price.width },
      },
      productImage1: { ...base.productImage1, x: boxes.image.x, y: boxes.image.y, width: boxes.image.width, height: boxes.image.height },
    };
    addTestLayout(layout);
    toast.success('Estilo salvo em "Meus Estilos (Teste)"!');
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-amber-50 dark:bg-amber-900/10 flex-shrink-0">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tighter text-black dark:text-white">Criar Estilo (Teste)</h3>
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              Arraste as caixas na folha A4 • use "Centralizar" para alinhar
            </p>
          </div>
          <button onClick={handleClose} className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-grow overflow-auto p-5 flex flex-col md:flex-row gap-5 min-h-0">
          {/* Painel esquerdo: nome + centralizar cada caixa + salvar */}
          <div className="w-full md:w-52 flex-shrink-0 space-y-3">
            <div>
              <label className="text-[8px] font-bold text-zinc-500 uppercase block mb-1">Nome do Estilo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Teste 1"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-bold text-black dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="space-y-1.5">
              {BOX_DEFS.map((def) => (
                <button
                  key={def.key}
                  onClick={() => centerBox(def.key)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[10px] font-bold text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                >
                  {def.label}
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Crosshair className="w-3 h-3" /> Centralizar
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
            >
              <Save className="w-4 h-4" /> Salvar em Meus Estilos
            </button>
          </div>

          {/* Direita: réguas + folha A4 com as caixas */}
          <div className="flex-grow flex items-start justify-center overflow-auto bg-zinc-100 dark:bg-zinc-950/40 rounded-2xl p-4">
            <div className="relative select-none" style={{ width: PREVIEW_WIDTH + 20, height: PREVIEW_HEIGHT + 20 }}>
              {/* régua horizontal (cm) */}
              <div className="absolute top-0 left-5 h-5 bg-zinc-200 dark:bg-zinc-800 border-b border-zinc-300 dark:border-zinc-700 overflow-hidden" style={{ width: PREVIEW_WIDTH }}>
                {Array.from({ length: 22 }).map((_, i) => (
                  <div key={i} className="absolute top-0 h-full border-l border-zinc-400/60 dark:border-zinc-600 text-[6px] text-zinc-500 dark:text-zinc-400 pl-0.5" style={{ left: i * (PREVIEW_WIDTH / 21) }}>
                    {i}
                  </div>
                ))}
              </div>
              {/* régua vertical (cm) */}
              <div className="absolute top-5 left-0 w-5 bg-zinc-200 dark:bg-zinc-800 border-r border-zinc-300 dark:border-zinc-700 overflow-hidden" style={{ height: PREVIEW_HEIGHT }}>
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="absolute left-0 w-full border-t border-zinc-400/60 dark:border-zinc-600 text-[6px] text-zinc-500 dark:text-zinc-400" style={{ top: i * (PREVIEW_HEIGHT / 29) }} />
                ))}
              </div>

              {/* folha A4 */}
              <div className="absolute bg-white overflow-hidden shadow-inner border border-zinc-300 dark:border-zinc-600" style={{ left: 20, top: 20, width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
                {/* guias de centro */}
                <div
                  className={cn('absolute top-0 bottom-0 border-l border-dashed pointer-events-none', activeGuides.v ? 'border-rose-500' : 'border-zinc-200')}
                  style={{ left: PREVIEW_WIDTH / 2 }}
                />
                <div
                  className={cn('absolute left-0 right-0 border-t border-dashed pointer-events-none', activeGuides.h ? 'border-rose-500' : 'border-zinc-200')}
                  style={{ top: PREVIEW_HEIGHT / 2 }}
                />

                {BOX_DEFS.map((def) => {
                  const b = boxes[def.key];
                  return (
                    <div
                      key={def.key}
                      onPointerDown={startDrag(def.key, 'move')}
                      className={cn('absolute border-2 flex items-center justify-center text-center leading-tight cursor-move text-[8px] font-black uppercase', def.classes)}
                      style={{ left: b.x * SCALE, top: b.y * SCALE, width: b.width * SCALE, height: b.height * SCALE }}
                    >
                      {def.label}
                      <div
                        onPointerDown={startDrag(def.key, 'resize')}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border border-zinc-400 rounded-full cursor-se-resize"
                        title="Redimensionar"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
