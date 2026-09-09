import assert from 'node:assert';
import {
  centavosParaBRL, totalCentavos, resumoPorCategoria, linhasRelatorio,
  rotuloCategoria, formatarDataBR, reaisParaCentavos, CATEGORIAS_VALIDAS, type ItemDespesa,
} from './despesasViagemReport';

const itens: ItemDespesa[] = [
  { categoria: 'combustivel', descricao: 'Tanque cheio', valorCentavos: 25000, dataDespesa: '2026-09-08', estabelecimento: 'Posto Ipiranga' },
  { categoria: 'pedagio',     descricao: null,           valorCentavos: 1230,  dataDespesa: '2026-09-07', estabelecimento: 'CLF' },
  { categoria: 'combustivel', descricao: null,           valorCentavos: 18050, dataDespesa: '2026-09-10', estabelecimento: 'Shell' },
  { categoria: 'refeicao',    descricao: 'Almoço',       valorCentavos: 4500,  dataDespesa: '2026-09-08', estabelecimento: 'Restaurante do Zé' },
];

function centavosFormataEmReal() {
  assert.strictEqual(centavosParaBRL(0), 'R$ 0,00');
  assert.strictEqual(centavosParaBRL(5), 'R$ 0,05');
  assert.strictEqual(centavosParaBRL(1230), 'R$ 12,30');
  assert.strictEqual(centavosParaBRL(25000), 'R$ 250,00');
  assert.strictEqual(centavosParaBRL(123456789), 'R$ 1.234.567,89');
  assert.strictEqual(centavosParaBRL(-1230), '-R$ 12,30');
}

function totalSomaTodosOsItens() {
  assert.strictEqual(totalCentavos(itens), 25000 + 1230 + 18050 + 4500);
  assert.strictEqual(totalCentavos([]), 0);
}

function resumoAgrupaPorCategoriaEOrdenaPorTotal() {
  const r = resumoPorCategoria(itens);
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].categoria, 'combustivel');
  assert.strictEqual(r[0].totalCentavos, 43050);
  assert.strictEqual(r[0].qtd, 2);
  assert.strictEqual(r[0].rotulo, 'Combustível');
  assert.strictEqual(r[1].categoria, 'refeicao');
  assert.strictEqual(r[2].categoria, 'pedagio');
}

function linhasSaoOrdenadasPorDataEFormatadas() {
  const l = linhasRelatorio(itens);
  assert.deepStrictEqual(l.map((x) => x.data), ['07/09/2026', '08/09/2026', '08/09/2026', '10/09/2026']);
  assert.strictEqual(l[0].categoria, 'Pedágio');
  assert.strictEqual(l[0].estabelecimento, 'CLF');
  assert.strictEqual(l[0].descricao, '');
  assert.strictEqual(l[0].valor, 'R$ 12,30');
}

function rotuloCategoriaCobreAsValidasEFazFallback() {
  for (const c of CATEGORIAS_VALIDAS) {
    assert.ok(typeof rotuloCategoria(c) === 'string' && rotuloCategoria(c).length > 0);
  }
  assert.strictEqual(rotuloCategoria('combustivel'), 'Combustível');
  assert.strictEqual(rotuloCategoria('xpto'), 'xpto');
}

function formatarDataBRLidaComISOComOuSemHora() {
  assert.strictEqual(formatarDataBR('2026-09-08'), '08/09/2026');
  assert.strictEqual(formatarDataBR('2026-09-08T13:00:00Z'), '08/09/2026');
  assert.strictEqual(formatarDataBR('sem-data'), 'sem-data');
}

function reaisParaCentavosCobreOsFormatosBR() {
  assert.strictEqual(reaisParaCentavos(''), null);
  assert.strictEqual(reaisParaCentavos('abc'), null);
  assert.strictEqual(reaisParaCentavos('0'), null);
  assert.strictEqual(reaisParaCentavos('-5'), null);
  assert.strictEqual(reaisParaCentavos('250'), 25000);
  assert.strictEqual(reaisParaCentavos('250,00'), 25000);
  assert.strictEqual(reaisParaCentavos('250.00'), 25000);
  assert.strictEqual(reaisParaCentavos('1.234,56'), 123456);
  assert.strictEqual(reaisParaCentavos('12,5'), 1250);
  assert.strictEqual(reaisParaCentavos('1234'), 123400);
  assert.strictEqual(reaisParaCentavos('12.50'), 1250);
  assert.strictEqual(reaisParaCentavos('1.234'), 123400);
  assert.strictEqual(reaisParaCentavos('R$ 1.234,56'), 123456);
  assert.strictEqual(reaisParaCentavos('  99,90 '), 9990);
}

try {
  centavosFormataEmReal();
  totalSomaTodosOsItens();
  resumoAgrupaPorCategoriaEOrdenaPorTotal();
  linhasSaoOrdenadasPorDataEFormatadas();
  rotuloCategoriaCobreAsValidasEFazFallback();
  formatarDataBRLidaComISOComOuSemHora();
  reaisParaCentavosCobreOsFormatosBR();
  console.log('PASS: todos os testes de despesasViagemReport passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
