import { Product } from '../../store';

export type EncarteProdutoTipo = 'simples';

/**
 * Produto colocado no encarte. Envolve o produto do catálogo (`product`,
 * imutável) com os ajustes feitos no painel "Detalhes do produto" — que
 * valem só para este encarte, não alteram o catálogo.
 */
export interface EncarteProduto {
  product: Product;
  nome: string;
  medidaQtd: string;
  medidaUnidade: string;
  tipo: EncarteProdutoTipo;
  precoOferta: string;
  corFundo: string;
  corEtiqueta: string;
  /** escala da imagem do produto no card (1 = tamanho padrão) */
  escalaProduto: number;
  /** escala da caixa de preço no card (1 = tamanho padrão) */
  escalaEtiqueta: number;
}

export const COR_FUNDO_PADRAO = '#ffffff';
export const COR_ETIQUETA_PADRAO = '#059669'; // emerald-600

const soPreco = (price: string) => (price || '').replace(/r\$/i, '').trim();

export function criarEncarteProduto(product: Product): EncarteProduto {
  return {
    product,
    nome: product.name,
    medidaQtd: '',
    medidaUnidade: '',
    tipo: 'simples',
    precoOferta: soPreco(product.price),
    corFundo: COR_FUNDO_PADRAO,
    corEtiqueta: COR_ETIQUETA_PADRAO,
    escalaProduto: 1,
    escalaEtiqueta: 1,
  };
}
