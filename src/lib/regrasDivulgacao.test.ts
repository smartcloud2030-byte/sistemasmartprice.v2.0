import assert from 'node:assert/strict';
import { avaliarProduto, montarAvisosLegais } from './regrasDivulgacao';

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

// Composto lácteo
assert.equal(avaliarProduto({ nome: 'Leite Ninho Fases 1+ Prebio 800g' }, null)?.['composto' as never], true);
assert.equal(avaliarProduto({ nome: 'Leite UHT Integral 1L' }, null)?.['composto' as never], false);

// Texto miúdo no padrão do encarte
const a = montarAvisosLegais([
  { nome: 'Sonrisal 2 CP', restricao: avaliarProduto({}, 'L'), registro: '1010701410011' },
  { nome: 'Vick Inalador', restricao: avaliarProduto({}, 'L'), registro: '1214200110045' },
  { nome: 'Leite Ninho Fases 1+', restricao: avaliarProduto({ nome: 'Leite Ninho Fases 1+' }, null) },
  { nome: 'Leite Itambé', restricao: avaliarProduto({ nome: 'Leite Itambé' }, null) },
  { nome: 'Shampoo', restricao: null },
])!;
assert.equal(a.texto, 'Sonrisal 2 CP. Reg. M.S 1010701410011. | Vick Inalador. Reg. M.S 1214200110045. Leite Ninho Fases 1+. ESTE COMPOSTO NÃO DEVE SER USADO PARA ALIMENTAR CRIANÇAS MENORES DE UM ANO. O MINISTÉRIO DA SAÚDE ADVERTE: O ALEITAMENTO MATERNO EVITA INFECÇÕES E ALERGIAS E É RECOMENDADO ATÉ OS DOIS ANOS DE IDADE OU MAIS.');
assert.ok(a.destaque.startsWith('ESTES SÃO MEDICAMENTOS'));
assert.equal(montarAvisosLegais([{ nome: 'Shampoo', restricao: null }]), null);
assert.equal(montarAvisosLegais([{ nome: 'Leite', restricao: avaliarProduto({ nome: 'Leite' }, null) }])!.destaque, '');

console.log('regrasDivulgacao: ok');
