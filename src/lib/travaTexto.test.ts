import assert from 'node:assert/strict';
import { ajustarCaixasTravadas, CaixaTexto, MedidorTexto } from './travaTexto';

// Medidor simples: cada letra ocupa 0,5 × fonte, linha com 1,2 × fonte.
const medidor: MedidorTexto = {
  larguraPalavra: (_c, p, fs) => p.length * fs * 0.5,
  altura: ({ text, width }, fs) => {
    let linhas = 1;
    let atual = 0;
    for (const p of text.split(/\s+/)) {
      const w = (p.length + 1) * fs * 0.5;
      if (atual > 0 && atual + w > width) { linhas++; atual = 0; }
      atual += w;
    }
    return linhas * fs * 1.2;
  },
};

const caixa = (c: Partial<CaixaTexto> & Pick<CaixaTexto, 'id' | 'y'>): CaixaTexto => ({
  tipo: 'texto', x: 0, width: 400, fontSize: 40, text: 'Dipirona', ...c,
});

// Texto curto que cabe: mantém o tamanho do modelo.
{
  const r = ajustarCaixasTravadas([caixa({ id: 'nome', y: 100 }), caixa({ id: 'desc', y: 200 })], 1123, medidor);
  assert.equal(r.nome, 40);
  assert.equal(r.desc, 40);
}

// Nome longo que quebraria em várias linhas e invadiria a descrição: encolhe.
{
  const nome = caixa({ id: 'nome', y: 100, text: 'Dipirona Monoidratada Gotas Infantil Frasco Grande Sabor Morango' });
  const r = ajustarCaixasTravadas([nome, caixa({ id: 'desc', y: 160 })], 1123, medidor);
  assert.ok(r.nome < 40, `nome devia encolher, ficou ${r.nome}`);
  assert.ok(medidor.altura(nome, r.nome) <= 160 - 6 - 100);
}

// Palavra mais larga que a caixa: encolhe até caber na largura.
{
  const r = ajustarCaixasTravadas([caixa({ id: 'nome', y: 100, width: 200, text: 'Paracetamolzinhoextraforte' })], 1123, medidor);
  assert.ok(26 * r.nome * 0.5 <= 200);
}

// Caixa de outra coluna não limita.
{
  const r = ajustarCaixasTravadas([
    caixa({ id: 'nome', y: 100, x: 0, width: 300, text: 'Nome bem comprido que quebra linha várias vezes' }),
    caixa({ id: 'preco', tipo: 'preco', y: 130, x: 400, width: 300 }),
  ], 1123, medidor);
  assert.equal(r.nome, 40);
}

// Preço logo acima da descrição: o preço encolhe pra não cobrir.
{
  const r = ajustarCaixasTravadas([
    caixa({ id: 'preco', tipo: 'preco', y: 100, fontSize: 200, width: 300 }),
    caixa({ id: 'desc', y: 220 }),
  ], 1123, medidor);
  assert.ok(r.preco * 1.05 <= 220 - 6 - 100);
}

console.log('travaTexto ok');
