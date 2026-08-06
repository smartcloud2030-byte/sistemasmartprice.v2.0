import assert from 'node:assert';
import { isDespesaAtivaNoMes, despesasDoMes, totalDespesasDoMes, formatMesAno, mesAnterior, mesSeguinte, Despesa } from './despesas';

const base: Despesa = {
  id: '1',
  descricao: 'Domínio sistemasmartprice.com.br',
  categoria: 'dominio',
  valor: 45,
  recorrente: false,
  data: '2026-08-06',
};

function despesaAvulsaSoContaNoMesExato() {
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 8), true);
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 7), false);
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 9), false);
}

function despesaRecorrenteContaNoMesDeInicioEEmMesesFuturos() {
  const d: Despesa = { ...base, recorrente: true, data: '2026-06-01' };
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 5), false);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 6), true);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 12), true);
}

function despesaRecorrenteComDataFimParaDeContarNoMesDefinido() {
  const d: Despesa = { ...base, recorrente: true, data: '2026-01-01', dataFim: '2026-09-01' };
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 8), true);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 9), false);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 10), false);
}

function despesasDoMesFiltraCorretamenteEntreRecorrentesEAvulsas() {
  const avulsaForaDoMes: Despesa = { ...base, id: '2', data: '2026-01-10' };
  const recorrenteAtiva: Despesa = { ...base, id: '3', recorrente: true, data: '2026-01-01', categoria: 'ia', valor: 100 };
  const lista = [base, avulsaForaDoMes, recorrenteAtiva];
  const doMes = despesasDoMes(lista, 2026, 8);
  assert.strictEqual(doMes.length, 2);
  assert.ok(doMes.some((d) => d.id === '1'));
  assert.ok(doMes.some((d) => d.id === '3'));
}

function totalDespesasDoMesSomaOsValoresAtivos() {
  const lista: Despesa[] = [
    { ...base, id: '1', valor: 45 },
    { ...base, id: '2', recorrente: true, data: '2026-01-01', valor: 100 },
    { ...base, id: '3', data: '2026-01-10', valor: 999 },
  ];
  assert.strictEqual(totalDespesasDoMes(lista, 2026, 8), 145);
}

function formatMesAnoFormataEmPortugues() {
  assert.strictEqual(formatMesAno(2026, 8), 'Agosto 2026');
  assert.strictEqual(formatMesAno(2026, 1), 'Janeiro 2026');
}

function mesAnteriorEMesSeguinteViramOAno() {
  assert.deepStrictEqual(mesAnterior(2026, 1), { ano: 2025, mes: 12 });
  assert.deepStrictEqual(mesSeguinte(2026, 12), { ano: 2027, mes: 1 });
  assert.deepStrictEqual(mesAnterior(2026, 8), { ano: 2026, mes: 7 });
  assert.deepStrictEqual(mesSeguinte(2026, 8), { ano: 2026, mes: 9 });
}

try {
  despesaAvulsaSoContaNoMesExato();
  despesaRecorrenteContaNoMesDeInicioEEmMesesFuturos();
  despesaRecorrenteComDataFimParaDeContarNoMesDefinido();
  despesasDoMesFiltraCorretamenteEntreRecorrentesEAvulsas();
  totalDespesasDoMesSomaOsValoresAtivos();
  formatMesAnoFormataEmPortugues();
  mesAnteriorEMesSeguinteViramOAno();
  console.log('PASS: todos os testes de despesas (calculo do DRE) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
