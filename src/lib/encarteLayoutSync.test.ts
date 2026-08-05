import assert from 'node:assert';
import { extractLayoutFields, applyLayoutToAll, buildMoldeDefaults } from './encarteLayoutSync';
import type { SelectedProduct } from '../store';

const baseProduct: SelectedProduct = {
  id: 'p1',
  name: 'Produto A',
  description: '',
  price: '9,99',
  image: 'https://imagens.sistemasmartprice.com.br/smartprice-images/a.webp',
  category: 'geral',
  offsetX: 12,
  offsetY: 8,
  width: 70,
  height: 75,
  elementLayout: { name: { xPct: 1, yPct: 1, widthPct: 50, heightPct: 15 } },
  nameFontSize: 7,
  subtitleFontSize: 5,
  priceFontSize: 12,
};

function extractLayoutFieldsPicksOnlyLayoutNotContent() {
  const fields = extractLayoutFields(baseProduct);
  assert.deepStrictEqual(fields, {
    offsetX: 12, offsetY: 8, width: 70, height: 75,
    elementLayout: { name: { xPct: 1, yPct: 1, widthPct: 50, heightPct: 15 } },
    nameFontSize: 7, subtitleFontSize: 5, priceFontSize: 12,
  });
  // conteúdo (name/price/image/id) não deve vazar pro layout
  assert.strictEqual((fields as any).name, undefined);
  assert.strictEqual((fields as any).price, undefined);
}

function applyLayoutToAllOverwritesLayoutKeepsContentOnListedSlots() {
  const layout = extractLayoutFields(baseProduct);
  const produtos: Record<string, SelectedProduct | null> = {
    'slot-1': baseProduct,
    'slot-2': { ...baseProduct, id: 'p2', name: 'Produto B', offsetX: 99, offsetY: 99 },
    'slot-3': null,
    'slot-outro-lado': { ...baseProduct, id: 'p3', name: 'Produto C', offsetX: 1, offsetY: 1 },
  };

  const result = applyLayoutToAll(produtos, ['slot-1', 'slot-2', 'slot-3'], layout);

  assert.strictEqual(result['slot-2']!.name, 'Produto B'); // conteúdo preservado
  assert.strictEqual(result['slot-2']!.offsetX, 12);        // layout sobrescrito
  assert.strictEqual(result['slot-3'], null);                // slot vazio continua vazio
  assert.strictEqual(result['slot-outro-lado']!.offsetX, 1); // fora da lista, intocado
}

function buildMoldeDefaultsSkipsPartialCardRect() {
  const partial = { elementLayout: baseProduct.elementLayout, nameFontSize: 7 }; // sem offsetX/Y/width/height
  const defaults = buildMoldeDefaults(partial);
  assert.strictEqual(defaults.defaultCardRect, undefined);
  assert.deepStrictEqual(defaults.defaultElementLayout, baseProduct.elementLayout);
  assert.strictEqual(defaults.defaultNameFontSize, 7);
}

function buildMoldeDefaultsIncludesCardRectWhenComplete() {
  const layout = extractLayoutFields(baseProduct);
  const defaults = buildMoldeDefaults(layout);
  assert.deepStrictEqual(defaults.defaultCardRect, { offsetX: 12, offsetY: 8, width: 70, height: 75 });
}

try {
  extractLayoutFieldsPicksOnlyLayoutNotContent();
  applyLayoutToAllOverwritesLayoutKeepsContentOnListedSlots();
  buildMoldeDefaultsSkipsPartialCardRect();
  buildMoldeDefaultsIncludesCardRectWhenComplete();
  console.log('PASS: todos os testes de encarteLayoutSync passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
