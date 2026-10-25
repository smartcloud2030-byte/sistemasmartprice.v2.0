/**
 * "Trava" da plaquinha: com ela ligada as caixas de nome, subtítulo, descrição e
 * preço ficam onde o modelo mandou, e o tamanho da fonte é reduzido o quanto for
 * preciso pra o texto não ser cortado nem invadir a caixa que vem logo abaixo.
 */

export interface CaixaTexto {
  id: string;
  tipo: 'texto' | 'preco';
  x: number;
  y: number;
  /** Largura da caixa (texto) ou largura estimada do preço no tamanho original. */
  width: number;
  fontSize: number;
  text: string;
}

export interface MedidorTexto {
  /** Altura do bloco com quebra de linha por palavra na largura da caixa. */
  altura: (caixa: CaixaTexto, fontSize: number) => number;
  /** Largura de uma palavra sozinha, pra não deixar palavra maior que a caixa. */
  larguraPalavra: (caixa: CaixaTexto, palavra: string, fontSize: number) => number;
}

const FOLGA = 6;
const MARGEM_PAGINA = 8;
const ALTURA_PRECO = 1.05;

const sobrepoeNaHorizontal = (a: CaixaTexto, b: CaixaTexto) =>
  a.x < b.x + b.width && b.x < a.x + a.width;

/** Devolve o tamanho de fonte que cada caixa deve usar (id → fontSize). */
export function ajustarCaixasTravadas(
  caixas: CaixaTexto[],
  alturaPagina: number,
  medidor: MedidorTexto,
): Record<string, number> {
  const resultado: Record<string, number> = {};

  for (const caixa of caixas) {
    // Limite de baixo: topo da próxima caixa que fica embaixo desta, ou o fim da folha.
    let limite = alturaPagina - MARGEM_PAGINA;
    for (const outra of caixas) {
      if (outra === caixa || outra.y <= caixa.y + 1) continue;
      if (!sobrepoeNaHorizontal(caixa, outra)) continue;
      limite = Math.min(limite, outra.y - FOLGA);
    }
    const alturaMax = limite - caixa.y;
    const minimo = Math.min(caixa.fontSize, Math.max(10, caixa.fontSize * 0.35));

    const cabe = (fs: number) => {
      if (caixa.tipo === 'preco') return fs * ALTURA_PRECO <= alturaMax;
      if (medidor.altura(caixa, fs) > alturaMax) return false;
      return caixa.text
        .split(/\s+/)
        .filter(Boolean)
        .every((p) => medidor.larguraPalavra(caixa, p, fs) <= caixa.width);
    };

    let fs = caixa.fontSize;
    while (fs > minimo && !cabe(fs)) fs -= 1;
    resultado[caixa.id] = Math.max(minimo, fs);
  }

  return resultado;
}
