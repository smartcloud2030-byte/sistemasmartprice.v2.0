import { Product } from '../../store';
import { Formato } from './formatos';

/** largura/altura base do card (px) na escala de exibição do canvas (480px de largura). */
export const CARD_W = 200;
export const CARD_H = 128;
export const CANVAS_W = 480;

export type EncarteProdutoTipo = 'simples';

export type ModeloCard = 'padrao' | 'destaque' | 'clean';

export const MODELOS_CARD: { id: ModeloCard; nome: string; descricao: string }[] = [
  { id: 'padrao', nome: 'Padrão', descricao: 'Card branco · foto à direita · preço em etiqueta' },
  { id: 'destaque', nome: 'Destaque', descricao: 'Sem card · nome grande · etiqueta grande com POR/UNI' },
  { id: 'clean', nome: 'Clean', descricao: 'Card branco · foto à esquerda · preço em texto' },
];

/**
 * Estilo compartilhado por TODOS os produtos do encarte. O que o usuário
 * mexe no painel "Detalhes do produto" nesses campos vale para o encarte
 * inteiro, não só para o produto aberto.
 */
export interface EstiloEncarte {
  modeloCard: ModeloCard; // layout do card do produto
  corFundo: string; // fundo do card
  corEtiqueta: string; // caixa de preço
  escalaCard: number; // slider "Produto" — escala o card inteiro
  escalaEtiqueta: number; // slider "Etiqueta" — escala extra da caixa de preço
}

export const ESTILO_PADRAO: EstiloEncarte = {
  modeloCard: 'padrao',
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

// ── Grade (quantidade de produtos por página) ──────────────────────────

export type GradeId = 'livre' | '2x2' | '2x3' | '2x4' | '3x3' | '3x4';

export const GRADES: { id: GradeId; nome: string; cols: number; rows: number }[] = [
  { id: 'livre', nome: 'Livre', cols: 0, rows: 0 },
  { id: '2x2', nome: '2 × 2', cols: 2, rows: 2 },
  { id: '2x3', nome: '2 × 3', cols: 2, rows: 3 },
  { id: '2x4', nome: '2 × 4', cols: 2, rows: 4 },
  { id: '3x3', nome: '3 × 3', cols: 3, rows: 3 },
  { id: '3x4', nome: '3 × 4', cols: 3, rows: 4 },
];

export const getGrade = (id: GradeId) => GRADES.find((g) => g.id === id) ?? GRADES[0];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Distribui os produtos numa grade cols×rows, centralizando cada card na
 * sua célula e devolvendo a escala de card que faz tudo caber. Depois
 * disso o usuário ainda pode arrastar cada card livremente.
 */
export function organizarEmGrade(
  produtos: EncarteProduto[],
  grade: GradeId,
  formato: Formato,
): { produtos: EncarteProduto[]; escalaCard: number } {
  const g = getGrade(grade);
  if (g.cols < 1 || g.rows < 1) return { produtos, escalaCard: 1 };

  const canvasH = CANVAS_W / formato.ratio;
  const usable = 0.9;
  const cellWpx = (CANVAS_W * usable) / g.cols;
  const cellHpx = (canvasH * usable) / g.rows;
  const escalaCard = clamp(Math.min(cellWpx / (CARD_W + 6), cellHpx / (CARD_H + 6)), 0.35, 1);

  const cardWpct = ((CARD_W * escalaCard) / CANVAS_W) * 100;
  const cardHpct = ((CARD_H * escalaCard) / canvasH) * 100;
  const cellWpct = (100 * usable) / g.cols;
  const cellHpct = (100 * usable) / g.rows;
  const origem = ((1 - usable) / 2) * 100;
  const capacidade = g.cols * g.rows;

  const novos = produtos.map((p, i) => {
    const slot = i % capacidade;
    const col = slot % g.cols;
    const row = Math.floor(slot / g.cols);
    return {
      ...p,
      xPct: origem + col * cellWpct + (cellWpct - cardWpct) / 2,
      yPct: origem + row * cellHpct + (cellHpct - cardHpct) / 2,
    };
  });

  return { produtos: novos, escalaCard };
}

// ── Lado do encarte (frente / verso) ──────────────────────────────────

/**
 * Um lado do encarte. Frente e verso são independentes: cada um tem seus
 * produtos, posições, tema, estilo e grade. O verso nasce como cópia da
 * frente e daí em diante é editado sozinho.
 */
export interface LadoEncarte {
  produtos: EncarteProduto[];
  estilo: EstiloEncarte;
  tema: string | null;
  grade: GradeId;
}

export function criarLado(): LadoEncarte {
  return { produtos: [], estilo: { ...ESTILO_PADRAO }, tema: null, grade: 'livre' };
}

export function clonarLado(l: LadoEncarte): LadoEncarte {
  return {
    produtos: l.produtos.map((p) => ({ ...p })),
    estilo: { ...l.estilo },
    tema: l.tema,
    grade: l.grade,
  };
}
