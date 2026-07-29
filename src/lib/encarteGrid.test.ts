import assert from 'node:assert';
import { distributeSlots } from './encarteGrid';

function distributesA3x5GridInsideTheArea() {
  const slots = distributeSlots(3, 5, { xPct: 5, yPct: 20, widthPct: 90, heightPct: 70 });
  assert.strictEqual(slots.length, 15, 'deveria gerar 15 slots pra grade 3x5');
  assert.ok(slots.every(s => s.tipo === 'produto'));

  const first = slots[0];
  assert.strictEqual(first.xPct, 5);
  assert.strictEqual(first.yPct, 20);
  assert.strictEqual(first.widthPct, 30, 'largura de cada celula = 90 / 3 colunas');
  assert.strictEqual(first.heightPct, 14, 'altura de cada celula = 70 / 5 linhas');

  const last = slots[14];
  assert.strictEqual(last.xPct, 5 + 2 * 30, 'ultima celula: coluna 2 (0-indexed) da ultima linha');
  assert.strictEqual(last.yPct, 20 + 4 * 14, 'ultima celula: linha 4 (0-indexed)');
}

function generatesUniqueIdsInRowMajorOrder() {
  const slots = distributeSlots(2, 2, { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 });
  const ids = slots.map(s => s.id);
  assert.strictEqual(new Set(ids).size, 4, 'ids devem ser unicos');
  assert.strictEqual(slots[0].xPct, 0);
  assert.strictEqual(slots[0].yPct, 0);
  assert.strictEqual(slots[1].xPct, 50, 'segundo slot fica na proxima coluna, mesma linha');
  assert.strictEqual(slots[1].yPct, 0);
  assert.strictEqual(slots[2].xPct, 0, 'terceiro slot volta pra primeira coluna, proxima linha');
  assert.strictEqual(slots[2].yPct, 50);
}

function singleCellMatchesTheWholeArea() {
  const area = { xPct: 10, yPct: 10, widthPct: 80, heightPct: 80 };
  const slots = distributeSlots(1, 1, area);
  assert.strictEqual(slots.length, 1);
  assert.deepStrictEqual(
    { xPct: slots[0].xPct, yPct: slots[0].yPct, widthPct: slots[0].widthPct, heightPct: slots[0].heightPct },
    area
  );
}

try {
  distributesA3x5GridInsideTheArea();
  generatesUniqueIdsInRowMajorOrder();
  singleCellMatchesTheWholeArea();
  console.log('PASS: todos os testes de encarteGrid passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
