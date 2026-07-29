import React, { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface BoxRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

interface DraggableBoxProps {
  rect: BoxRect;
  containerRef: React.RefObject<HTMLElement>;
  onChange: (rect: BoxRect) => void;
  onRemove?: () => void;
  label?: string;
  color?: string;
  // Quando true (padrão), mostra as alças de redimensionar (bordas +
  // cantos). Passe false pra um box que só pode ser movido, não
  // redimensionado (ex: conteúdo de produto arrastável dentro de um slot
  // de tamanho fixo).
  resizable?: boolean;
  // Conteúdo a renderizar dentro do box, no lugar do label/moldura
  // decorativa padrão — usado quando o DraggableBox embrulha conteúdo real
  // (que deve aparecer no export) em vez de só marcar uma posição no editor.
  children?: React.ReactNode;
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_PCT = 3;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Aplica o arrasto de uma alça específica ao retângulo original — bordas
// (n/s/e/w) mexem só numa dimensão, cantos (ne/nw/se/sw) mexem nas duas.
function applyResize(handle: ResizeHandle, start: BoxRect, dxPct: number, dyPct: number): BoxRect {
  let { xPct, yPct, widthPct, heightPct } = start;

  if (handle.includes('e')) {
    widthPct = clamp(start.widthPct + dxPct, MIN_PCT, 100 - start.xPct);
  }
  if (handle.includes('w')) {
    const newX = clamp(start.xPct + dxPct, 0, start.xPct + start.widthPct - MIN_PCT);
    widthPct = start.xPct + start.widthPct - newX;
    xPct = newX;
  }
  if (handle.includes('s')) {
    heightPct = clamp(start.heightPct + dyPct, MIN_PCT, 100 - start.yPct);
  }
  if (handle.includes('n')) {
    const newY = clamp(start.yPct + dyPct, 0, start.yPct + start.heightPct - MIN_PCT);
    heightPct = start.yPct + start.heightPct - newY;
    yPct = newY;
  }

  return { xPct, yPct, widthPct, heightPct };
}

// Alça de borda: barra comprida ao longo do lado inteiro (alvo grande, fácil
// de acertar). Alça de canto: quadrado nos cantos, redimensiona os dois
// eixos junto. O alvo de clique (hitbox) é maior que o desenho visual — a
// margem negativa estende a área clicável sem deixar a alça grande demais.
const HANDLES: { id: ResizeHandle; cursor: string; hitboxClassName: string; visualClassName: string }[] = [
  { id: 'n', cursor: 'ns-resize', hitboxClassName: 'top-0 left-2 right-2 h-3 -translate-y-1/2', visualClassName: 'inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full' },
  { id: 's', cursor: 'ns-resize', hitboxClassName: 'bottom-0 left-2 right-2 h-3 translate-y-1/2', visualClassName: 'inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full' },
  { id: 'e', cursor: 'ew-resize', hitboxClassName: 'right-0 top-2 bottom-2 w-3 translate-x-1/2', visualClassName: 'inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full' },
  { id: 'w', cursor: 'ew-resize', hitboxClassName: 'left-0 top-2 bottom-2 w-3 -translate-x-1/2', visualClassName: 'inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full' },
  { id: 'nw', cursor: 'nwse-resize', hitboxClassName: 'top-0 left-0 w-4 h-4 -translate-x-1/2 -translate-y-1/2', visualClassName: 'inset-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-sm' },
  { id: 'ne', cursor: 'nesw-resize', hitboxClassName: 'top-0 right-0 w-4 h-4 translate-x-1/2 -translate-y-1/2', visualClassName: 'inset-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-sm' },
  { id: 'sw', cursor: 'nesw-resize', hitboxClassName: 'bottom-0 left-0 w-4 h-4 -translate-x-1/2 translate-y-1/2', visualClassName: 'inset-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-sm' },
  { id: 'se', cursor: 'nwse-resize', hitboxClassName: 'bottom-0 right-0 w-4 h-4 translate-x-1/2 translate-y-1/2', visualClassName: 'inset-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-sm' },
];

// forwardRef: permite aninhar um DraggableBox dentro de outro — o pai passa
// a própria ref (capturada aqui) como `containerRef` de um DraggableBox
// filho, pra esse filho poder ser arrastado/redimensionado relativo ao
// tamanho JÁ RENDERIZADO do pai (ex: mover a foto do produto dentro do
// card do produto, que por sua vez já é movível dentro do slot).
const DraggableBox = React.forwardRef<HTMLDivElement, DraggableBoxProps>(function DraggableBox(
  { rect, containerRef, onChange, onRemove, label, color = '#10b981', resizable = true, children },
  ref
) {
  const dragState = useRef<{ mode: 'move'; startX: number; startY: number; startRect: BoxRect } | { mode: 'resize'; handle: ResizeHandle; startX: number; startY: number; startRect: BoxRect } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const state = dragState.current;
    const container = containerRef.current;
    if (!state || !container) return;
    const bounds = container.getBoundingClientRect();
    const dxPct = ((e.clientX - state.startX) / bounds.width) * 100;
    const dyPct = ((e.clientY - state.startY) / bounds.height) * 100;

    if (state.mode === 'move') {
      const xPct = clamp(state.startRect.xPct + dxPct, 0, 100 - state.startRect.widthPct);
      const yPct = clamp(state.startRect.yPct + dyPct, 0, 100 - state.startRect.heightPct);
      onChangeRef.current({ ...state.startRect, xPct, yPct });
    } else {
      onChangeRef.current(applyResize(state.handle, state.startRect, dxPct, dyPct));
    }
  }, [containerRef]);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const startMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, startRect: rect };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const startResize = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { mode: 'resize', handle, startX: e.clientX, startY: e.clientY, startRect: rect };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      ref={ref}
      onPointerDown={startMove}
      className={children ? 'absolute cursor-move select-none' : 'absolute border-2 border-dashed cursor-move flex items-center justify-center select-none'}
      style={{
        left: `${rect.xPct}%`,
        top: `${rect.yPct}%`,
        width: `${rect.widthPct}%`,
        height: `${rect.heightPct}%`,
        ...(children ? {} : { borderColor: color, backgroundColor: `${color}22` }),
      }}
    >
      {children}

      {label && !children && (
        <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
          {label}
        </span>
      )}
      {onRemove && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="no-print absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {resizable && HANDLES.map((h) => (
        <div
          key={h.id}
          onPointerDown={startResize(h.id)}
          className={`no-print absolute ${h.hitboxClassName}`}
          style={{ cursor: h.cursor }}
        >
          <div className={`absolute ${h.visualClassName} pointer-events-none`} style={{ backgroundColor: color }} />
        </div>
      ))}
    </div>
  );
});

export default DraggableBox;
