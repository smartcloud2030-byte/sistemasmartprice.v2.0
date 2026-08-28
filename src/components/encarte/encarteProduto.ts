import { Product } from '../../store';

export type EncarteProdutoTipo = 'simples';

/**
 * Estilo compartilhado por TODOS os produtos do encarte. O que o usuário
 * mexe no painel "Detalhes do produto" nesses campos vale para o encarte
 * inteiro, não só para o produto aberto.
 */
export interface EstiloEncarte {
  corFundo: string; // fundo do card
  corEtiqueta: string; // caixa de preço
  escalaCard: number; // slider "Produto" — escala o card inteiro
  escalaEtiqueta: number; // slider "Etiqueta" — escala extra da caixa de preço
}

export const ESTILO_PADRAO: EstiloEncarte = {
  corFundo: '#ffffff',
  corEtiqueta: '#059669', // emerald-600
  escalaCard: 1,
  escalaEtiqueta: 1,
};

/**
 * Produto colocado no encarte. Envolve o produto do catálogo (`product`,
 * imutável) com os ajustes individuais — nome, descrição, medida, tipo,
 * preço e posição livre no canvas. Cor e tamanho ficam no EstiloEncarte.
 */
export interface EncarteProduto {
  product: Product;
  nome: string;
  descricao: string;
  medidaQtd: string;
  medidaUnidade: string;
  tipo: EncarteProdutoTipo;
  precoOferta: string;
  /** posição do canto superior esquerdo do card, em % do canvas */
  xPct: number;
  yPct: number;
}

const soPreco = (price: string) => (price || '').replace(/r\$/i, '').trim();

/** Posição inicial em cascata (2 colunas) para o card não nascer em cima dos outros. */
function posicaoInicial(index: number): { xPct: number; yPct: number } {
  const col = index % 2;
  const row = Math.floor(index / 2);
  return {
    xPct: 6 + col * 46,
    yPct: Math.min(8 + row * 24, 80),
  };
}

export function criarEncarteProduto(product: Product, index = 0): EncarteProduto {
  return {
    product,
    nome: product.name,
    descricao: product.description ?? '',
    medidaQtd: '',
    medidaUnidade: '',
    tipo: 'simples',
    precoOferta: soPreco(product.price),
    ...posicaoInicial(index),
  };
}
