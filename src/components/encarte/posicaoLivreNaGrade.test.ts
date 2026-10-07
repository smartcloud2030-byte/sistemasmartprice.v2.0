import assert from 'node:assert';
import { organizarEmGrade, posicaoLivreNaGrade, criarEncarteProduto, getGrade, GRADES } from './encarteProduto';

// Adicionar produto não pode reorganizar a grade: o novo vai pra primeira
// célula vazia, que tem que ser EXATAMENTE onde o organizarEmGrade poria.
const perto = (a: { xPct: number; yPct: number }, b: { xPct: number; yPct: number }) =>
  Math.abs(a.xPct - b.xPct) < 1e-6 && Math.abs(a.yPct - b.yPct) < 1e-6;
const mk = (i: number) => criarEncarteProduto({ id: i, name: 'P' + i, price: '1' } as any, i);

for (const ratio of [210 / 297, 1, 9 / 16, 16 / 9]) {
  const formato = { id: 'x', nome: 'x', ratio } as any;
  for (const G of GRADES.filter((g) => g.cols > 0)) {
    for (const n of [1, 2, 3, 5, 8, 9, 12, 13, 16, 20]) {
      const lista = Array.from({ length: n }, (_, i) => mk(i));
      const g = organizarEmGrade(lista, G.id, formato);

      // vaga deixada por um produto removido/arrastado = a célula original dele
      for (let k = 0; k < n; k++) {
        const livre = posicaoLivreNaGrade(g.produtos.filter((_, i) => i !== k), G.id, formato, g.escalaCard);
        assert(livre && perto(livre, g.produtos[k]), `${G.id} ratio=${ratio} n=${n} vaga ${k}`);
      }

      // grade com espaço → próxima célula; grade cheia → null (nada se mexe)
      const rows = Math.max(getGrade(G.id).rows, Math.ceil(n / G.cols));
      const livre = posicaoLivreNaGrade(g.produtos, G.id, formato, g.escalaCard);
      if (n < rows * G.cols) {
        const prox = organizarEmGrade([...lista, mk(99)], G.id, formato);
        assert(livre && perto(livre, prox.produtos[n]), `${G.id} ratio=${ratio} n=${n} próxima`);
      } else {
        assert.strictEqual(livre, null, `${G.id} ratio=${ratio} n=${n} cheia`);
      }
    }
  }
}

assert.strictEqual(posicaoLivreNaGrade([mk(1)], 'livre', { id: 'x', nome: 'x', ratio: 1 } as any, 1), null);

console.log('PASS: todos os testes de posicaoLivreNaGrade passaram');
