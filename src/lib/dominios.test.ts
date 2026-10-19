import assert from 'node:assert';
import { diasParaVencer, statusDominio, dominiosAVencer, normalizarDominio, dominioValido, textoPrazo, formatarData, Dominio } from './dominios';

const hoje = new Date(2026, 9, 19, 15, 30);

function contaDiasSoPelaData() {
  assert.strictEqual(diasParaVencer('2026-10-19', hoje), 0);
  assert.strictEqual(diasParaVencer('2026-10-20', hoje), 1);
  assert.strictEqual(diasParaVencer('2026-10-18', hoje), -1);
  assert.strictEqual(diasParaVencer('2027-10-19', hoje), 365);
}

function avisaComTrintaDiasDeAntecedencia() {
  assert.strictEqual(statusDominio('2026-10-18', hoje), 'vencido');
  assert.strictEqual(statusDominio('2026-10-19', hoje), 'vence_em_breve');
  assert.strictEqual(statusDominio('2026-11-18', hoje), 'vence_em_breve');
  assert.strictEqual(statusDominio('2026-11-19', hoje), 'ok');
}

function listaSoOsUrgentesDoMaisProximo() {
  const lista: Dominio[] = [
    { id: 1, dominio: 'a.com.br', vencimento: '2027-09-08', registrador: null },
    { id: 2, dominio: 'b.site', vencimento: '2026-11-01', registrador: null },
    { id: 3, dominio: 'c.online', vencimento: '2026-10-10', registrador: null },
  ];
  assert.deepStrictEqual(dominiosAVencer(lista, hoje).map((d) => d.id), [3, 2]);
}

function limpaOQueForColadoDoNavegador() {
  assert.strictEqual(normalizarDominio(' https://www.CearaBolos.com.br/admin '), 'cearabolos.com.br');
  assert.strictEqual(normalizarDominio('hfcalcados.sbs'), 'hfcalcados.sbs');
  assert.strictEqual(dominioValido('cearabolos.com.br'), true);
  assert.strictEqual(dominioValido('cearabolos'), false);
  assert.strictEqual(dominioValido('-x.com'), false);
}

function textosDePrazo() {
  assert.strictEqual(textoPrazo('2026-10-19', hoje), 'Vence hoje');
  assert.strictEqual(textoPrazo('2026-10-20', hoje), 'Vence amanhã');
  assert.strictEqual(textoPrazo('2026-10-29', hoje), 'Vence em 10 dias');
  assert.strictEqual(textoPrazo('2026-10-18', hoje), 'Venceu há 1 dia');
  assert.strictEqual(textoPrazo('2026-10-14', hoje), 'Venceu há 5 dias');
  assert.strictEqual(formatarData('2027-09-08'), '08/09/2027');
}

const tests = [contaDiasSoPelaData, avisaComTrintaDiasDeAntecedencia, listaSoOsUrgentesDoMaisProximo, limpaOQueForColadoDoNavegador, textosDePrazo];
for (const t of tests) {
  t();
  console.log(`PASS ${t.name}`);
}
