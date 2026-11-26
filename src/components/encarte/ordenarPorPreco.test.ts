import assert from 'node:assert';
import { ordenarPorPreco, EncarteProduto } from './encarteProduto';

const p = (id: number, preco: string, xPct: number, yPct: number, nd?: { xPct: number; yPct: number }): EncarteProduto =>
  ({
    product: { id, name: `P${id}` } as any,
    nome: `P${id}`, descricao: '', medidaQtd: '', medidaUnidade: '', tipo: 'normal' as any,
    precoOferta: preco, precoDe: '', emDestaque: false, xPct, yPct,
    nomeDescricaoAjuste: nd ? ({ ...nd, wPct: 10, hPct: 5 } as any) : null,
  }) as EncarteProduto;
const de = (r: EncarteProduto[], id: number) => r.find((x) => x.product.id === id)!;

// linha levemente torta continua sendo a mesma linha
{
  const r = ordenarPorPreco([p(1, '30', 0, 0), p(2, '10', 50, 3), p(3, '20', 0, 30)], 'asc', 20);
  assert.deepStrictEqual([de(r, 2).xPct, de(r, 2).yPct], [0, 0]);
  assert.deepStrictEqual([de(r, 3).xPct, de(r, 3).yPct], [50, 3]);
  assert.deepStrictEqual([de(r, 1).xPct, de(r, 1).yPct], [0, 30]);
}
// nome solto anda junto com o card
{
  const r = ordenarPorPreco([p(1, '30', 0, 0, { xPct: 2, yPct: 1 }), p(2, '10', 50, 0)], 'asc', 20);
  assert.strictEqual(de(r, 1).xPct, 50);
  assert.strictEqual(de(r, 1).nomeDescricaoAjuste!.xPct, 52);
  assert.strictEqual(de(r, 1).nomeDescricaoAjuste!.yPct, 1);
}
// % vai depois dos preços em reais
{
  const r = ordenarPorPreco([p(1, '20%', 0, 0), p(2, '45,99', 50, 0), p(3, '9,99', 0, 30)], 'asc', 20);
  const ordem = [...r].sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct).map((x) => x.precoOferta);
  assert.deepStrictEqual(ordem, ['9,99', '45,99', '20%']);
}
console.log('ordenarPorPreco: ok');
