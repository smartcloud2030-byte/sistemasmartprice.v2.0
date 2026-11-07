import assert from 'node:assert/strict';
import { indiceModeloDaTela } from './modeloDaTela';

const L = [
  { id: 'a', background: { url: '/f/a.png' } },
  { id: 'b', background: { url: '/f/b.png' } },
  { id: 'c', background: { url: '/f/c.png' } },
  { id: 'd', background: { url: '/f/c.png' } }, // mesmo fundo do c
  { id: 'e', background: { url: null } },
];

assert.equal(indiceModeloDaTela(L, 'b', 0, '/f/b.png'), 1); // id e fundo batem
assert.equal(indiceModeloDaTela(L, 'b', 1, '/f/a.png'), 0); // id velho: acha pelo fundo
assert.equal(indiceModeloDaTela(L, 'a', 0, '/f/c.png'), -1); // fundo de 2 modelos: sem certeza
assert.equal(indiceModeloDaTela(L, 'd', 0, '/f/c.png'), 3); // id desempata
assert.equal(indiceModeloDaTela(L, 'x', 0, '/f/z.png'), -1); // nada bate
assert.equal(indiceModeloDaTela(L, null, 1, '/f/b.png'), 1); // dado antigo sem id: posição
assert.equal(indiceModeloDaTela(L, null, 2, '/f/b.png'), 1); // posição velha: pelo fundo
assert.equal(indiceModeloDaTela(L, 'e', 0, null), 4); // modelo sem fundo, id bate
assert.equal(indiceModeloDaTela(L, 'a', 0, null), -1);
console.log('modeloDaTela ok');
