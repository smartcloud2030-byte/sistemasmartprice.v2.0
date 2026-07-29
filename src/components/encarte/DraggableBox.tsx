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
  // Quando true (padrão), mostra a alça de redimensionar no canto. Passe
  // false pra um box que só pode ser movido, não redimensionado (ex:
  // conteúdo de produto arrastável dentro de um slot de tamanho fixo).
  resizable?: boolean;
  // Conteúdo a renderizar dentro do box, no lugar do label/moldura
  // decorativa padrão — usado quando o DraggableBox embrulha conteúdo real
  // (que deve aparecer no export) em vez de só marcar uma posição no editor.
  children?: React.ReactNode;
}

const MIN_PCT = 3;

// forwardRef: permite aninhar um DraggableBox dentro de outro — o pai passa
// a própria ref (capturada aqui) como `containerRef` de um DraggableBox
// filho, pra esse filho poder ser arrastado/redimensionado relativo ao
// tamanho JÁ RENDERIZADO do pai (ex: mover a foto do produto dentro do
// card do produto, que por sua vez já é movível dentro do slot).
const DraggableBox = React.forwardRef<HTMLDivElement, DraggableBoxProps>(function DraggableBox(
  { rect, containerRef, onChange, onRemove, label, color = '#10b981', resizable = true, children },
  ref
) {
  const dragState = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; startRect: BoxRect } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

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
      const widthPct = clamp(state.startRect.widthPct + dxPct, MIN_PCT, 100 - state.startRect.xPct);
      const heightPct = clamp(state.startRect.heightPct + dyPct, MIN_PCT, 100 - state.startRect.yPct);
      onChangeRef.current({ ...state.startRect, widthPct, heightPct });
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

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      ref={ref}
      onPointerDown={startDrag('move')}
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
      {resizable && (
        <div
          onPointerDown={startDrag('resize')}
          className="no-print absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-full cursor-se-resize"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
});

export default DraggableBox;
