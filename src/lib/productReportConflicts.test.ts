import assert from 'node:assert';
import { findImportConflicts } from './productReportConflicts';

const catalog = [
  { id: 1, name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  { id: 2, name: 'Neosaldina Muscular', description: '', price: 'R$ 20,00', image: null, category: 'medicamento', barcode: '7891142033306', barcode2: null },
] as any;

function noConflictWhenRowMatchesOnlyItself() {
  const rows = [{ id: 1, name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0, 'linha editando o proprio produto sem mudar nome/codigo nao deveria conflitar');
}

function catalogConflictWhenBarcodeMatchesAnotherProduct() {
  const rows = [{ id: 1, name: 'Coca-Cola 350ml', barcode: '7891142033306', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].reason, 'catalog');
  assert.strictEqual((conflicts[0] as any).matchedProduct.id, 2);
}

function batchConflictWhenTwoRowsShareBarcode() {
  const rows = [
    { id: 1, name: 'Coca-Cola 350ml', barcode: '9999999999999', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' },
    { id: 2, name: 'Neosaldina Muscular', barcode: '9999999999999', barcode2: null, price: 'R$ 20,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 2, 'as duas linhas que colidem entre si deveriam ser reportadas');
  assert.ok(conflicts.every(c => c.reason === 'batch'));
}

function noConflictsForCleanImport() {
  const rows = [
    { id: 1, name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 6,00', category: 'conveniencia', description: 'nova descricao' },
    { id: 2, name: 'Neosaldina Muscular', barcode: '7891142033306', barcode2: '7891142033307', price: 'R$ 22,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0);
}

try {
  noConflictWhenRowMatchesOnlyItself();
  catalogConflictWhenBarcodeMatchesAnotherProduct();
  batchConflictWhenTwoRowsShareBarcode();
  noConflictsForCleanImport();
  console.log('PASS: todos os testes de productReportConflicts passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
