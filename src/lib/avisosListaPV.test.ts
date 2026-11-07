import assert from 'node:assert/strict';
import { marcoPV, avisosPendentes, chaveAviso, limparVistos } from './avisosListaPV';
import type { ItemPV } from './listaPV';

assert.equal(marcoPV(-1, 30), null);
assert.equal(marcoPV(0, 30), 'umDia');
assert.equal(marcoPV(1, 30), 'umDia');
assert.equal(marcoPV(2, 30), 'semana');
assert.equal(marcoPV(7, 30), 'semana');
assert.equal(marcoPV(8, 30), 'vermelho');
assert.equal(marcoPV(30, 30), 'vermelho');
assert.equal(marcoPV(31, 30), null);
assert.equal(marcoPV(10, 5), null); // período vermelho menor que 1 semana
assert.equal(marcoPV(6, 5), 'semana');

const hoje = new Date(2026, 10, 7);
const item = (id: string, vencimento: string): ItemPV => ({ id, produto: id, codigo: '', vencimento, quantidade: null, lote: '', loja: '' });
const itens = [item('a', '2026-11-08'), item('b', '2026-11-12'), item('c', '2026-11-27'), item('d', '2027-03-01'), item('e', '2026-11-01')];

let av = avisosPendentes(itens, 30, new Set(), hoje);
assert.deepEqual(av.map((a) => [a.item.id, a.marco]), [['a', 'umDia'], ['b', 'semana'], ['c', 'vermelho']]);

// já avisado não volta; marco seguinte avisa de novo
const vistos = new Set(av.map((a) => a.chave));
assert.equal(avisosPendentes(itens, 30, vistos, hoje).length, 0);
const depois = avisosPendentes(itens, 30, vistos, new Date(2026, 10, 20));
assert.deepEqual(depois.map((a) => [a.item.id, a.marco]), [['c', 'semana']]);

// vencimento editado reavisa
assert.equal(avisosPendentes([item('a', '2026-11-09')], 30, vistos, hoje).length, 1);

// limpeza tira itens removidos
assert.deepEqual([...limparVistos(new Set([chaveAviso(itens[0], 'umDia'), 'zz|2026-01-01|umDia']), itens)], [chaveAviso(itens[0], 'umDia')]);

console.log('avisosListaPV ok');
