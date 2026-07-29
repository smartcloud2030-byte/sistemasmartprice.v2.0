import type { EncarteSlotDef } from '../store';

export interface SlotArea {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export function distributeSlots(cols: number, rows: number, area: SlotArea): EncarteSlotDef[] {
  const widthPct = area.widthPct / cols;
  const heightPct = area.heightPct / rows;
  const slots: EncarteSlotDef[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        id: `produto-${row}-${col}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tipo: 'produto',
        xPct: area.xPct + col * widthPct,
        yPct: area.yPct + row * heightPct,
        widthPct,
        heightPct,
      });
    }
  }

  return slots;
}
