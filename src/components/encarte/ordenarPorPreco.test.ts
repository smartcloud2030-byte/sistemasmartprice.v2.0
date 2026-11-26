import { describe, it, expect } from 'vitest';
import { ordenarPorPreco, EncarteProduto } from './encarteProduto';

const p = (id: number, preco: string, xPct: number, yPct: number, nd?: { xPct: number; yPct: number }): EncarteProduto =>
  ({
    product: { id, name: `P${id}` } as any,
    nome: `P${id}`, descricao: '', medidaQtd: '', medidaUnidade: '', tipo: 'normal' as any,
    precoOferta: preco, precoDe: '', emDestaque: false, xPct, yPct,
    nomeDescricaoAjuste: nd ? ({ ...nd, wPct: 10, hPct: 5 } as any) : null,
  }) as EncarteProduto;

describe('ordenarPorPreco', () => {
  it('linha levemente torta continua sendo a mesma linha', () => {
    const r = ordenarPorPreco([p(1, '30', 0, 0), p(2, '10', 50, 3), p(3, '20', 0, 30)], 'asc', 20);
    const lugar = (id: number) => r.find((x) => x.product.id === id)!;
    expect([lugar(2).xPct, lugar(2).yPct]).toEqual([0, 0]);
    expect([lugar(3).xPct, lugar(3).yPct]).toEqual([50, 3]);
    expect([lugar(1).xPct, lugar(1).yPct]).toEqual([0, 30]);
  });
  it('nome solto anda junto com o card', () => {
    const r = ordenarPorPreco([p(1, '30', 0, 0, { xPct: 2, yPct: 1 }), p(2, '10', 50, 0)], 'asc', 20);
    const um = r.find((x) => x.product.id === 1)!;
    expect(um.xPct).toBe(50);
    expect(um.nomeDescricaoAjuste!.xPct).toBe(52);
    expect(um.nomeDescricaoAjuste!.yPct).toBe(1);
  });
  it('% vai depois dos preços em reais', () => {
    const r = ordenarPorPreco([p(1, '20%', 0, 0), p(2, '45,99', 50, 0), p(3, '9,99', 0, 30)], 'asc', 20);
    const ordem = [...r].sort((a, b) => a.yPct - b.yPct || a.xPct - b.xPct).map((x) => x.precoOferta);
    expect(ordem).toEqual(['9,99', '45,99', '20%']);
  });
});
