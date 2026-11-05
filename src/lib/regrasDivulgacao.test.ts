import assert from 'node:assert/strict';
import { avaliarProduto, frasesObrigatorias } from './regrasDivulgacao';

const nivel = (nome: string, tarja: any = null) => {
  const r = avaliarProduto({ nome }, tarja);
  return r ? (r.nivel === 'frase' ? `frase:${r.chave}` : 'bloqueado') : null;
};

// Medicamentos pela tarja da CMED
assert.equal(nivel('Losartana 50mg', 'V'), 'bloqueado');
assert.equal(nivel('Rivotril 2mg', 'P'), 'bloqueado');
assert.equal(nivel('Novalgina 1g', 'L'), 'frase:medicamento');
assert.equal(nivel('Remédio sem tarja informada', ''), 'frase:medicamento');

// Leites e fórmulas
assert.equal(nivel('Leite em Pó Ninho Integral 380g'), 'frase:leite');
assert.equal(nivel('Leite UHT Integral Piracanjuba 1L'), 'frase:leite');
assert.equal(nivel('Composto Lácteo Milnutri 800g'), 'frase:leite');
assert.equal(nivel('Mucilon Arroz e Aveia 180g'), 'frase:leite');
assert.equal(nivel('NAN 3 Supreme 800g'), 'frase:leite');
assert.equal(nivel('Aptamil Profutura 3'), 'frase:leite');
assert.equal(nivel('NAN Supreme 1 800g'), 'bloqueado');
assert.equal(nivel('Aptamil 2 Premium 800g'), 'bloqueado');
assert.equal(nivel('Pré NAN 400g'), 'bloqueado');
assert.equal(nivel('NAN Sem Lactose 400g'), 'bloqueado');
assert.equal(nivel('Fórmula Infantil para Lactentes Nestogeno 1'), 'bloqueado');
assert.equal(nivel('Mamadeira Lillo 260ml'), 'bloqueado');
assert.equal(nivel('Chupeta NUK Silicone'), 'bloqueado');

// Não é leite
assert.equal(nivel('Creme de Leite Nestlé 200g'), null);
assert.equal(nivel('Leite de Rosas 100ml'), null);
assert.equal(nivel('Hidratante Nivea Leite Corporal'), null);
assert.equal(nivel('Doce de Leite Itambé'), null);
assert.equal(nivel('Dipirona 500mg'), null); // fora da CMED → sem regra
assert.equal(nivel('Shampoo Seda 325ml'), null);

// Frases em ordem fixa, sem repetir
const f = frasesObrigatorias([avaliarProduto({ nome: 'Novalgina' }, 'L'), avaliarProduto({ nome: 'Leite Ninho' }, null), avaliarProduto({ nome: 'Leite Itambé' }, null), null]);
assert.equal(f.length, 2);
assert.ok(f[0].startsWith('O Ministério da Saúde informa'));
assert.ok(f[1].startsWith('Medicamentos'));

console.log('regrasDivulgacao: ok');
