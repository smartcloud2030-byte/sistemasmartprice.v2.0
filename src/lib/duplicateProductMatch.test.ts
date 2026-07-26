import assert from 'node:assert';
import { findDuplicateProduct } from './duplicateProductMatch';

const existing = [
  { id: 1, name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  { id: 2, name: 'Neosaldina Muscular', description: '', price: 'R$ 20,00', image: null, category: 'medicamento', barcode: '7891142033306', barcode2: '7891142033307' },
] as any;

function matchesByBarcode() {
  const result = findDuplicateProduct({ name: 'Refrigerante qualquer', barcode: '7894900011517' }, existing);
  assert.strictEqual(result?.id, 1, 'deveria achar o produto pelo codigo de barras principal');
}

function matchesByBarcode2() {
  const result = findDuplicateProduct({ name: 'Outro nome', barcode: '', barcode2: '7891142033307' }, existing);
  assert.strictEqual(result?.id, 2, 'deveria achar batendo o barcode novo com o barcode2 do produto existente');
}

function matchesByNormalizedName() {
  const result = findDuplicateProduct({ name: '  coca-cola   350ML  ', barcode: '' }, existing);
  assert.strictEqual(result?.id, 1, 'deveria achar pelo nome ignorando maiusculas/espacos extras');
}

function noMatchForNewProduct() {
  const result = findDuplicateProduct({ name: 'Produto Totalmente Novo', barcode: '0000000000000' }, existing);
  assert.strictEqual(result, null, 'produto sem batida nenhuma nao deveria retornar duplicata');
}

function excludesOwnIdWhenEditing() {
  const result = findDuplicateProduct({ name: 'Coca-Cola 350ml', barcode: '7894900011517' }, existing, 1);
  assert.strictEqual(result, null, 'ao editar o proprio produto (excludeId=1), nao deveria acusar duplicata dele mesmo');
}

function emptyBarcodesDontMatchEachOther() {
  const withEmpty = [{ id: 3, name: 'Produto sem codigo', description: '', price: 'R$ 1,00', image: null, category: 'padrao', barcode: '', barcode2: null }] as any;
  const result = findDuplicateProduct({ name: 'Outro produto sem codigo', barcode: '', barcode2: '' }, withEmpty);
  assert.strictEqual(result, null, 'codigos de barras vazios nao deveriam contar como match entre si');
}

function matchesWithWhitespacePaddedBarcode() {
  const result = findDuplicateProduct({ name: 'Produto qualquer', barcode: '  7894900011517  ' }, existing);
  assert.strictEqual(result?.id, 1, 'codigo de barras com espacos nas pontas deveria bater com o mesmo codigo ja cadastrado sem espacos');
}

try {
  matchesByBarcode();
  matchesByBarcode2();
  matchesByNormalizedName();
  noMatchForNewProduct();
  excludesOwnIdWhenEditing();
  emptyBarcodesDontMatchEachOther();
  matchesWithWhitespacePaddedBarcode();
  console.log('PASS: todos os testes de duplicateProductMatch passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
