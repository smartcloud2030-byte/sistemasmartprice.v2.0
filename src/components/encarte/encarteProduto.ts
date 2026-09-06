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
  { id: 'destaque', nome: 'Tradicional', descricao: 'Sem card · nome grande · etiqueta grande com POR/UNI' },
  { id: 'clean', nome: 'Clean', descricao: 'Card branco · foto à esquerda · preço em texto' },
];

// ── Etiqueta de preço: formas e estilos ──────────────────────────────

export type FormaEtiqueta =
  | 'retangulo'
  | 'arredondada'
  | 'circulo'
  | 'selo'
  | 'explosao'
  | 'fita'
  | 'tag'
  | 'nenhuma';

export const FORMAS_ETIQUETA: { id: FormaEtiqueta; nome: string }[] = [
  { id: 'retangulo', nome: 'Retângulo' },
  { id: 'arredondada', nome: 'Pílula' },
  { id: 'circulo', nome: 'Círculo' },
  { id: 'selo', nome: 'Selo' },
  { id: 'explosao', nome: 'Explosão' },
  { id: 'fita', nome: 'Fita' },
  { id: 'tag', nome: 'Tag' },
  { id: 'nenhuma', nome: 'Só preço' },
];

/** Acabamento visual da etiqueta. */
export type AcabamentoEtiqueta = 'solida' | 'degrade' | 'contorno';

export const ACABAMENTOS_ETIQUETA: { id: AcabamentoEtiqueta; nome: string }[] = [
  { id: 'solida', nome: 'Sólida' },
  { id: 'degrade', nome: 'Degradê' },
  { id: 'contorno', nome: 'Contorno' },
];

/** Escurece um hex (#rrggbb) multiplicando os canais — usado no degradê da etiqueta. */
export function escureceHex(hex: string, fator = 0.72): string {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * fator);
  const g = Math.round(((n >> 8) & 255) * fator);
  const b = Math.round((n & 255) * fator);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Polígono de estrela/roseta centrado em 50,50 (viewBox 0 0 100). */
function pathEstrela(pontas: number, rOut: number, rIn: number): string {
  const passo = Math.PI / pontas;
  const pts: string[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = i * passo - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const EXPLOSAO_RAIOS = [50, 27, 46, 24, 50, 22, 44, 30, 49, 25, 45, 28, 48, 23];
function pathExplosao(): string {
  const passo = (Math.PI * 2) / EXPLOSAO_RAIOS.length;
  const pts = EXPLOSAO_RAIOS.map((r, i) => {
    const a = i * passo - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join(' L')} Z`;
}

/** Path SVG (viewBox 0 0 100 100, preserveAspectRatio none) das formas que não são só border-radius. */
export const SVG_ETIQUETA: Partial<Record<FormaEtiqueta, string>> = {
  selo: pathEstrela(18, 50, 39),
  explosao: pathExplosao(),
  fita: 'M0,0 L100,0 L88,50 L100,100 L0,100 L12,50 Z',
  tag: 'M20,3 L97,3 L97,97 L20,97 L3,50 Z',
};

/**
 * Estilo compartilhado por TODOS os produtos do encarte. O que o usuário
 * mexe no painel "Detalhes do produto" nesses campos vale para o encarte
 * inteiro, não só para o produto aberto.
 */
export interface EstiloEncarte {
  modeloCard: ModeloCard; // layout do card do produto
  corFundo: string; // fundo do card
  corEtiqueta: string; // caixa de preço
  formaEtiqueta: FormaEtiqueta; // forma da caixa de preço
  acabamentoEtiqueta: AcabamentoEtiqueta; // sólida / degradê / contorno
  escalaCard: number; // slider "Produto" — escala o card inteiro
  escalaEtiqueta: number; // slider "Etiqueta" — escala extra da caixa de preço
}

export const ESTILO_PADRAO: EstiloEncarte = {
  modeloCard: 'padrao',
  corFundo: '#ffffff',
  corEtiqueta: '#059669', // emerald-600
  formaEtiqueta: 'retangulo', // caixa cheia, igual ao modelo impresso
  acabamentoEtiqueta: 'solida',
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
  /** preço antigo, riscado (opcional) */
  precoDe: string;
  /** renderiza como card largo em evidência, ignorando o modelo do encarte */
  emDestaque: boolean;
  /** posição do canto superior esquerdo do card, em % do canvas */
  xPct: number;
  yPct: number;
}

const soPreco = (price: string) => (price || '').replace(/r\$/i, '').trim();

/** Separa "10,99" em { inteiro: "10", centavos: "99" }. */
export function partesPreco(preco: string): { inteiro: string; centavos: string } {
  const s = (preco || '').trim();
  const i = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (i === -1) return { inteiro: s, centavos: '' };
  return { inteiro: s.slice(0, i), centavos: s.slice(i + 1) };
}

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
    precoDe: '',
    emDestaque: false,
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
 * Distribui os produtos numa grade de `g.cols` colunas, centralizando cada
 * card na sua célula e devolvendo a escala de card que faz tudo caber.
 * Depois disso o usuário ainda pode arrastar cada card livremente.
 *
 * Ajuste inteligente: as linhas da grade (`g.rows`) são só o ponto de
 * partida — se tiver mais produtos do que cabe nelas, cresce em linhas
 * (nunca volta pro início) e encolhe o card na mesma proporção, então os
 * produtos nunca ficam empilhados uns em cima dos outros.
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
  const cols = g.cols;
  const rows = Math.max(g.rows, Math.ceil(produtos.length / cols) || 1);
  const cellWpx = (CANVAS_W * usable) / cols;
  const cellHpx = (canvasH * usable) / rows;
  const escalaCard = clamp(Math.min(cellWpx / (CARD_W + 6), cellHpx / (CARD_H + 6)), 0.15, 1);

  const cardWpct = ((CARD_W * escalaCard) / CANVAS_W) * 100;
  const cardHpct = ((CARD_H * escalaCard) / canvasH) * 100;
  const cellWpct = (100 * usable) / cols;
  const cellHpct = (100 * usable) / rows;
  const origem = ((1 - usable) / 2) * 100;

  const novos = produtos.map((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      ...p,
      xPct: origem + col * cellWpct + (cellWpct - cardWpct) / 2,
      yPct: origem + row * cellHpct + (cellHpct - cardHpct) / 2,
    };
  });

  return { produtos: novos, escalaCard };
}

// ── Fundos prontos (sem upload) ──────────────────────────────────────

/** Fundos embutidos: a chave vai no campo `tema`, o valor é o CSS `background`. */
export const FUNDOS_BUILTIN: Record<string, string> = {
  creme: 'linear-gradient(180deg,#fdf3e6 0%,#fbebd8 45%,#fdf1e4 100%)',
  branco: '#ffffff',
};

export const ehFundoBuiltin = (tema: string | null): tema is string =>
  !!tema && Object.prototype.hasOwnProperty.call(FUNDOS_BUILTIN, tema);

// ── Divisor de seção ─────────────────────────────────────────────────

export interface DivisorEncarte {
  id: string;
  texto: string;
  /** posição vertical, em % do canvas (ocupa a largura toda) */
  yPct: number;
}

export function criarDivisor(texto = 'Genéricos e Similares'): DivisorEncarte {
  return { id: `div_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, texto, yPct: 45 };
}

// ── Imagem livre (logo, selo, adesivo etc.) ────────────────────────────

/** Imagem solta sobre o encarte — arrastável e redimensionável livremente. */
export interface ElementoImagem {
  id: string;
  url: string;
  /** categoria da galeria que colocou essa imagem (ex.: 'encarte-elementos' de Tags,
   *  'encarte-marca' de Marca) — usada pra saber qual imagem substituir quando a
   *  aba está no modo "uma imagem só". */
  categoria: string;
  /** canto superior esquerdo e tamanho, em % do canvas */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export function criarElementoImagem(url: string, categoria: string): ElementoImagem {
  return {
    id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    url,
    categoria,
    xPct: 32,
    yPct: 32,
    wPct: 28,
    hPct: 28,
  };
}

// ── Forma geométrica (quadrado, retângulo, círculo) ───────────────────

export type FormaTipo = 'quadrado' | 'retangulo' | 'circulo';

export const FORMAS_DISPONIVEIS: { tipo: FormaTipo; nome: string }[] = [
  { tipo: 'quadrado', nome: 'Quadrado' },
  { tipo: 'retangulo', nome: 'Retângulo' },
  { tipo: 'circulo', nome: 'Círculo' },
];

/** Forma solta sobre o encarte — arrastável, redimensionável e com cor própria. */
export interface FormaEncarte {
  id: string;
  tipo: FormaTipo;
  /** canto superior esquerdo e tamanho, em % do canvas (pode passar das bordas — o encarte recorta) */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  cor: string;
  /** true = renderiza atrás dos produtos/imagens; padrão (false) = na frente de tudo */
  atras?: boolean;
}

const TAMANHO_INICIAL_FORMA: Record<FormaTipo, { wPct: number; hPct: number }> = {
  quadrado: { wPct: 22, hPct: 22 },
  retangulo: { wPct: 34, hPct: 16 },
  circulo: { wPct: 22, hPct: 22 },
};

export function criarForma(tipo: FormaTipo): FormaEncarte {
  return {
    id: `forma_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tipo,
    xPct: 39,
    yPct: 39,
    ...TAMANHO_INICIAL_FORMA[tipo],
    cor: '#e8850c', // laranja Ultra Popular (mesmo dos divisores)
    atras: false,
  };
}

// ── Guias / réguas (linhas de alinhamento, só ajudam a montar) ────────

export type GuiaOrientacao = 'horizontal' | 'vertical';

/** Linha de alinhamento arrastada da régua. Não aparece no PNG/PDF exportado. */
export interface GuiaEncarte {
  id: string;
  orientacao: GuiaOrientacao;
  /** posição em % do canvas — horizontal usa o eixo Y, vertical usa o eixo X */
  pos: number;
}

export function criarGuia(orientacao: GuiaOrientacao, pos: number): GuiaEncarte {
  return { id: `guia_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, orientacao, pos };
}

// ── Texto livre ──────────────────────────────────────────────────────

/** Fontes já carregadas globalmente em `src/index.css` (Google Fonts). */
export const FONTES_ENCARTE = [
  'Montserrat',
  'Inter',
  'Poppins',
  'Roboto',
  'Lato',
  'Raleway',
  'Oswald',
  'Anton',
  'Bebas Neue',
  'Playfair Display',
];

export type TextoAlinhamento = 'left' | 'center' | 'right';

/** Caixa de texto solta sobre o encarte — arrastável, largura ajustável, fonte/cor/estilo próprios. */
export interface TextoEncarte {
  id: string;
  texto: string;
  /** canto superior esquerdo, em % do canvas */
  xPct: number;
  yPct: number;
  /** largura da caixa em % do canvas (altura acompanha o conteúdo) */
  wPct: number;
  /** tamanho da fonte em px no espaço do canvas (CANVAS_W = 480); escala no export */
  tamanho: number;
  fontFamily: string;
  cor: string;
  negrito: boolean;
  italico: boolean;
  alinhamento: TextoAlinhamento;
}

export function criarTexto(fontFamily = 'Montserrat'): TextoEncarte {
  return {
    id: `txt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    texto: 'Novo texto',
    xPct: 28,
    yPct: 30,
    wPct: 44,
    tamanho: 24,
    fontFamily,
    cor: '#ffffff',
    negrito: true,
    italico: false,
    alinhamento: 'center',
  };
}

// ── Lado do encarte (frente / verso) ──────────────────────────────────

/**
 * Um lado do encarte. Frente e verso são independentes: cada um tem seus
 * produtos, posições, tema, estilo, grade, divisores, imagens e rodapé. O
 * verso nasce como cópia da frente e daí em diante é editado sozinho.
 */
export interface LadoEncarte {
  produtos: EncarteProduto[];
  estilo: EstiloEncarte;
  tema: string | null;
  grade: GradeId;
  divisores: DivisorEncarte[];
  imagens: ElementoImagem[];
  formas: FormaEncarte[];
  textos: TextoEncarte[];
  guias: GuiaEncarte[];
  rodape: { ativo: boolean; texto: string };
}

export function criarLado(): LadoEncarte {
  return {
    produtos: [],
    estilo: { ...ESTILO_PADRAO },
    tema: null,
    grade: 'livre',
    divisores: [],
    imagens: [],
    formas: [],
    textos: [],
    guias: [],
    rodape: { ativo: false, texto: '5 unidades por cliente' },
  };
}

export function clonarLado(l: LadoEncarte): LadoEncarte {
  return {
    produtos: l.produtos.map((p) => ({ ...p })),
    estilo: { ...l.estilo },
    tema: l.tema,
    grade: l.grade,
    divisores: l.divisores.map((d) => ({ ...d })),
    imagens: l.imagens.map((im) => ({ ...im })),
    formas: (l.formas ?? []).map((f) => ({ ...f })),
    textos: (l.textos ?? []).map((t) => ({ ...t })),
    guias: (l.guias ?? []).map((g) => ({ ...g })),
    rodape: { ...l.rodape },
  };
}

/** Preenche campos novos (`formas`, `textos`, `guias`, opções de etiqueta) em lados antigos. */
export const normalizarLado = (l: LadoEncarte): LadoEncarte => ({
  ...l,
  formas: l.formas ?? [],
  textos: l.textos ?? [],
  guias: l.guias ?? [],
  estilo: { ...ESTILO_PADRAO, ...l.estilo },
});
