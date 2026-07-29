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
        // Id determinístico (só row/col) — reabrir um molde chama distributeSlots
        // de novo com os mesmos cols/rows/area; ids estáveis evitam que os
        // produtos já preenchidos em EncarteSemanal.produtos (indexado por
        // slot id) fiquem órfãos só por causa de reabrir a tela.
        id: `produto-${row}-${col}`,
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
