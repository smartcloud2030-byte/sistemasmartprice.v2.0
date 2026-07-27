import assert from 'node:assert';
import { findImportConflicts } from './productReportConflicts';

// ids como string em todo o arquivo (catalog e rows) — bate com o formato
// real de producao: product.id vem do Postgres como string via BIGSERIAL, e
// ReportRow.id (definido em productReportConflicts.ts) so aceita string desde
// o Fix 3 da revisao final, justamente pra nao deixar esse tipo de teste
// "colar" com numeros e mascarar uma regressao da coercao pra number.
const catalog = [
  { id: '1', name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  { id: '2', name: 'Neosaldina Muscular', description: '', price: 'R$ 20,00', image: null, category: 'medicamento', barcode: '7891142033306', barcode2: null },
] as any;

function noConflictWhenRowMatchesOnlyItself() {
  const rows = [{ id: '1', name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0, 'linha editando o proprio produto sem mudar nome/codigo nao deveria conflitar');
}

function catalogConflictWhenBarcodeMatchesAnotherProduct() {
  const rows = [{ id: '1', name: 'Coca-Cola 350ml', barcode: '7891142033306', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].reason, 'catalog');
  assert.strictEqual((conflicts[0] as any).matchedProduct.id, '2');
}

function batchConflictWhenTwoRowsShareBarcode() {
  const rows = [
    { id: '1', name: 'Coca-Cola 350ml', barcode: '9999999999999', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' },
    { id: '2', name: 'Neosaldina Muscular', barcode: '9999999999999', barcode2: null, price: 'R$ 20,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 2, 'as duas linhas que colidem entre si deveriam ser reportadas');
  assert.ok(conflicts.every(c => c.reason === 'batch'));
}

function noConflictsForCleanImport() {
  const rows = [
    { id: '1', name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 6,00', category: 'conveniencia', description: 'nova descricao' },
    { id: '2', name: 'Neosaldina Muscular', barcode: '7891142033306', barcode2: '7891142033307', price: 'R$ 22,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0);
}

// product.id vem do Postgres como string via BIGSERIAL (o driver `pg` nao
// converte bigint pra number sem setTypeParser custom) — esse eh o formato
// real de producao. Esse teste prova que a auto-exclusao em
// findDuplicateProduct (product.id === excludeId, comparacao estrita) segue
// funcionando quando os dois lados sao string, pra impedir que o bug de
// coercao pra number (ja corrigido uma vez em ProductReport.tsx) volte sem
// nenhum teste acusar.
function noFalseConflictWithStringCatalogIds() {
  const stringCatalog = [
    { id: '1', name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  ] as any;
  const rows = [{ id: '1', name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 6,00', category: 'conveniencia', description: 'preco atualizado' }];
  const conflicts = findImportConflicts(rows, stringCatalog);
  assert.strictEqual(conflicts.length, 0, 'ids como string (formato real de producao via BIGSERIAL) devem se auto-excluir corretamente, sem falso conflito');
}

try {
  noConflictWhenRowMatchesOnlyItself();
  catalogConflictWhenBarcodeMatchesAnotherProduct();
  batchConflictWhenTwoRowsShareBarcode();
  noConflictsForCleanImport();
  noFalseConflictWithStringCatalogIds();
  console.log('PASS: todos os testes de productReportConflicts passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
