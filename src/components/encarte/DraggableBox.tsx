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
  // Controla se as alças/realce de seleção aparecem. Por padrão (undefined)
  // fica sempre true — mantém o comportamento antigo pra quem não usa
  // seleção (ex: MoldeEditor, onde todas as áreas do molde ficam visíveis
  // ao mesmo tempo). Quem implementa clique-pra-selecionar (EncarteWeekly)
  // passa true só pro elemento atualmente selecionado.
  selected?: boolean;
  // Chamado no pointerdown (mover ou redimensionar) — quem usa seleção
  // aproveita esse gancho pra marcar este box como o selecionado.
  onSelect?: () => void;
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

// Estilo "Figma/PowerPoint": um quadradinho discreto em cada borda/canto,
// centralizado exatamente no ponto (translate -50%/-50%), com uma área de
// clique (hitArea) maior que o quadrado visível pra facilitar acertar com
// o mouse sem deixar a alça grande/pesada na tela.
const HANDLE_DEFS: { id: ResizeHandle; cursor: string; top: string; left: string }[] = [
  { id: 'n', cursor: 'ns-resize', top: '0%', left: '50%' },
  { id: 's', cursor: 'ns-resize', top: '100%', left: '50%' },
  { id: 'e', cursor: 'ew-resize', top: '50%', left: '100%' },
  { id: 'w', cursor: 'ew-resize', top: '50%', left: '0%' },
  { id: 'nw', cursor: 'nwse-resize', top: '0%', left: '0%' },
  { id: 'ne', cursor: 'nesw-resize', top: '0%', left: '100%' },
  { id: 'sw', cursor: 'nesw-resize', top: '100%', left: '0%' },
  { id: 'se', cursor: 'nwse-resize', top: '100%', left: '100%' },
];
const HIT_AREA = 18;
const HANDLE_SIZE = 8;

// forwardRef: permite aninhar um DraggableBox dentro de outro — o pai passa
// a própria ref (capturada aqui) como `containerRef` de um DraggableBox
// filho, pra esse filho poder ser arrastado/redimensionado relativo ao
// tamanho JÁ RENDERIZADO do pai (ex: mover a foto do produto dentro do
// card do produto, que por sua vez já é movível dentro do slot).
const DraggableBox = React.forwardRef<HTMLDivElement, DraggableBoxProps>(function DraggableBox(
  { rect, containerRef, onChange, onRemove, label, color = '#10b981', resizable = true, selected = true, onSelect, children },
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
    onSelect?.();
    dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, startRect: rect };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const startResize = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect?.();
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
        ...(children
          ? (selected ? { outline: `1.5px solid ${color}`, outlineOffset: 1 } : {})
          : { borderColor: color, backgroundColor: `${color}22` }),
      }}
    >
      {children}

      {label && !children && (
        <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
          {label}
        </span>
      )}
      {onRemove && selected && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="no-print absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {resizable && selected && HANDLE_DEFS.map((h) => (
        <div
          key={h.id}
          onPointerDown={startResize(h.id)}
          className="no-print absolute flex items-center justify-center"
          style={{ top: h.top, left: h.left, width: HIT_AREA, height: HIT_AREA, marginLeft: -HIT_AREA / 2, marginTop: -HIT_AREA / 2, cursor: h.cursor }}
        >
          <div
            className="rounded-[2px] bg-white pointer-events-none shadow-sm"
            style={{ width: HANDLE_SIZE, height: HANDLE_SIZE, border: `1.5px solid ${color}` }}
          />
        </div>
      ))}
    </div>
  );
});

export default DraggableBox;
