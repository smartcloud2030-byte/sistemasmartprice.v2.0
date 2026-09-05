import { useRef } from 'react';
import { AreaProdutos } from './gerador';

interface AreaOverlayProps {
  area: AreaProdutos;
  onAreaChange: (a: AreaProdutos) => void;
}

const MIN_W = 20;
const MIN_H = 15;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

type Canto = 'nw' | 'ne' | 'sw' | 'se';

interface Drag {
  tipo: 'mover' | 'resize';
  canto?: Canto;
  pointerId: number;
  startX: number;
  startY: number;
  orig: AreaProdutos;
}

export default function AreaOverlay({ area, onAreaChange }: AreaOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const rect = () => rootRef.current?.getBoundingClientRect();

  const inicia = (e: React.PointerEvent<HTMLDivElement>, d: Omit<Drag, 'pointerId' | 'startX' | 'startY'>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { ...d, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const r = rect();
    if (!st || !r || e.pointerId !== st.pointerId) return;
    const dxPct = ((e.clientX - st.startX) / r.width) * 100;
    const dyPct = ((e.clientY - st.startY) / r.height) * 100;
    const o = st.orig;

    if (st.tipo === 'mover') {
      onAreaChange({
        ...o,
        xPct: clamp(o.xPct + dxPct, 0, 100 - o.wPct),
        yPct: clamp(o.yPct + dyPct, 0, 100 - o.hPct),
      });
      return;
    }

    // resize por canto
    let { xPct, yPct, wPct, hPct } = o;
    const oesteMax = o.xPct + o.wPct - MIN_W;
    const norteMax = o.yPct + o.hPct - MIN_H;
    if (st.canto === 'nw' || st.canto === 'sw') {
      xPct = clamp(o.xPct + dxPct, 0, oesteMax);
      wPct = o.xPct + o.wPct - xPct;
    }
    if (st.canto === 'ne' || st.canto === 'se') {
      wPct = clamp(o.wPct + dxPct, MIN_W, 100 - o.xPct);
    }
    if (st.canto === 'nw' || st.canto === 'ne') {
      yPct = clamp(o.yPct + dyPct, 0, norteMax);
      hPct = o.yPct + o.hPct - yPct;
    }
    if (st.canto === 'sw' || st.canto === 'se') {
      hPct = clamp(o.hPct + dyPct, MIN_H, 100 - o.yPct);
    }
    onAreaChange({ xPct, yPct, wPct, hPct });
  };

  const fim = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const handleCanto = (canto: Canto, cursor: string) => {
    const pos: Record<Canto, React.CSSProperties> = {
      nw: { left: -6, top: -6 },
      ne: { right: -6, top: -6 },
      sw: { left: -6, bottom: -6 },
      se: { right: -6, bottom: -6 },
    };
    return (
      <div
        key={canto}
        onPointerDown={(e) => inicia(e, { tipo: 'resize', canto, orig: area })}
        onPointerMove={move}
        onPointerUp={fim}
        onPointerCancel={fim}
        style={{ position: 'absolute', width: 14, height: 14, cursor, ...pos[canto] }}
        className="rounded-sm bg-emerald-500 border-2 border-white shadow"
      />
    );
  };

  return (
    <div ref={rootRef} className="absolute inset-0 select-none" style={{ touchAction: 'none' }}>
      <div
        className="absolute border-2 border-dashed border-emerald-400/90 bg-emerald-400/5 cursor-move"
        style={{
          left: `${area.xPct}%`,
          top: `${area.yPct}%`,
          width: `${area.wPct}%`,
          height: `${area.hPct}%`,
        }}
        onPointerDown={(e) => inicia(e, { tipo: 'mover', orig: area })}
        onPointerMove={move}
        onPointerUp={fim}
        onPointerCancel={fim}
      >
        <span className="absolute -top-5 left-0 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
          Área dos produtos
        </span>
        {(['nw', 'ne', 'sw', 'se'] as Canto[]).map((c) =>
          handleCanto(c, c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize'),
        )}
      </div>
    </div>
  );
}
