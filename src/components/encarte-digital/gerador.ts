/**
 * Gerador de encarte digital — porte para navegador (Canvas 2D) do
 * gerador_encarte.py (Pillow). Mantém o mesmo modelo:
 *   Produto · TemaEncarte · LayoutGrade
 * e o mesmo layout: cabeçalho colorido, grade NxM de cards com foto +
 * nome (até 2 linhas com reticências) + etiqueta de preço (preço único
 * ou "De X por Y"), rodapé opcional e paginação automática.
 */

export const LARGURA = 1080;
export const ALTURA = 1350;

export interface Produto {
  nome: string;
  preco: number;
  imagem?: string | null; // caminho/URL
  precoDe?: number | null; // preço antigo ("De X por Y")
  unidade?: string; // "kg", "un", "cada"...
  destaque?: boolean;
}

/** Caixa onde os produtos ficam. Redimensionável; os cards não saem dela. */
export interface AreaProdutos {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export const AREA_PADRAO: AreaProdutos = { xPct: 4, yPct: 16, wPct: 92, hPct: 66 };

/** proporção altura/largura do card, mantida ao redimensionar */
export const CARD_BASE_W = 300;
export const CARD_BASE_H = 380;
export const CARD_ASPECT = CARD_BASE_H / CARD_BASE_W;

/** produtos por linha — divide a largura da caixa e define o tamanho do card.
 *  NÃO limita a quantidade total de produtos: o que passa vai pra novas linhas. */
export const COLUNAS_PADRAO = 3;
export const COLUNAS_MIN = 1;
export const COLUNAS_MAX = 10;

/** espaço entre cards, em px do canvas */
export const GAP = 16;

export const areaPx = (a: AreaProdutos) => ({
  x: (a.xPct / 100) * LARGURA,
  y: (a.yPct / 100) * ALTURA,
  w: (a.wPct / 100) * LARGURA,
  h: (a.hPct / 100) * ALTURA,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

const colunasClamp = (colunas: number) =>
  clamp(Math.round(colunas) || COLUNAS_PADRAO, COLUNAS_MIN, COLUNAS_MAX);

export interface GradeLayout {
  /** caixa em px */
  a: { x: number; y: number; w: number; h: number };
  /** colunas realmente usadas (≤ colunas pedidas, ≤ nº de produtos) */
  cols: number;
  /** linhas ocupadas */
  rows: number;
  /** tamanho do card em px */
  w: number;
  h: number;
  /** deslocamento vertical pra centralizar a grade na caixa */
  offY: number;
}

/**
 * Grade que faz TODOS os `qtd` produtos caberem na caixa, alinhados e sem
 * sobrepor: a largura vem de dividir a caixa em colunas, a altura de dividir
 * pela quantidade de linhas — o card usa o menor dos dois (mantendo a
 * proporção). Adicionar produto ⇒ mais linhas ⇒ card menor, automaticamente.
 */
export function gradeLayout(area: AreaProdutos, colunas: number, qtd: number): GradeLayout {
  const a = areaPx(area);
  const n = Math.max(1, Math.floor(qtd));
  const cols = Math.min(colunasClamp(colunas), n);
  const rows = Math.max(1, Math.ceil(n / cols));

  const wPorLargura = (a.w - GAP * (cols - 1)) / cols;
  const hPorAltura = (a.h - GAP * (rows - 1)) / rows;
  const w = Math.max(24, Math.min(wPorLargura, hPorAltura / CARD_ASPECT));
  const h = w * CARD_ASPECT;

  const gradeH = rows * h + GAP * (rows - 1);
  const offY = a.y + Math.max(0, (a.h - gradeH) / 2);

  return { a, cols, rows, w, h, offY };
}

/** Tamanho do card para `qtd` produtos na caixa. */
export function cardPx(area: AreaProdutos, colunas: number, qtd: number) {
  const { w, h } = gradeLayout(area, colunas, qtd);
  return { w, h };
}

/**
 * Canto superior-esquerdo do card `indice` (em % do canvas). Cada linha é
 * centralizada na largura da caixa, então a última linha (incompleta) também
 * fica alinhada ao centro.
 */
export function posicaoNaGrade(indice: number, area: AreaProdutos, colunas: number, qtd: number) {
  const g = gradeLayout(area, colunas, qtd);
  const n = Math.max(1, Math.floor(qtd));
  const row = Math.floor(indice / g.cols);
  const col = indice % g.cols;
  const nEstaLinha = Math.min(g.cols, n - row * g.cols);
  const larguraLinha = nEstaLinha * g.w + GAP * (nEstaLinha - 1);
  const offX = g.a.x + Math.max(0, (g.a.w - larguraLinha) / 2);
  const x = offX + col * (g.w + GAP);
  const y = g.offY + row * (g.h + GAP);
  return { xPct: (x / LARGURA) * 100, yPct: (y / ALTURA) * 100 };
}

export interface TemaEncarte {
  titulo: string;
  subtitulo: string;
  corFundo: string;
  corTitulo: string;
  corCaixaProduto: string;
  corTag: string;
  corTextoTag: string;
  corNomeProduto: string;
  nomeEmpresa: string;
  slogan: string;
}

export interface LayoutGrade {
  colunas: number;
  linhas: number;
}

export const TEMA_PADRAO: TemaEncarte = {
  titulo: 'OFERTAS DA SEMANA',
  subtitulo: '',
  corFundo: '#1c1310',
  corTitulo: '#f5c518',
  corCaixaProduto: '#8a5a3a',
  corTag: '#e32c27',
  corTextoTag: '#ffffff',
  corNomeProduto: '#ffffff',
  nomeEmpresa: '',
  slogan: '',
};

export const LAYOUT_PADRAO: LayoutGrade = { colunas: 3, linhas: 4 };

export const GRADES_PRESET: { label: string; colunas: number; linhas: number }[] = [
  { label: '3 × 4', colunas: 3, linhas: 4 },
  { label: '4 × 3', colunas: 4, linhas: 3 },
  { label: '2 × 6', colunas: 2, linhas: 6 },
  { label: '5 × 3', colunas: 5, linhas: 3 },
  { label: '6 × 2', colunas: 6, linhas: 2 },
  { label: '2 × 2', colunas: 2, linhas: 2 },
];

export const capacidade = (l: LayoutGrade) => Math.max(1, l.colunas * l.linhas);

export function paginar(produtos: Produto[], cap: number): Produto[][] {
  if (produtos.length === 0) return [[]];
  const paginas: Produto[][] = [];
  for (let i = 0; i < produtos.length; i += cap) paginas.push(produtos.slice(i, i + cap));
  return paginas;
}

// ── helpers ──────────────────────────────────────────────────────────

const fonte = (px: number, bold = false) =>
  `${bold ? '800' : '400'} ${Math.round(px)}px 'Inter','Helvetica Neue',Arial,sans-serif`;

function corContraste(hex: string): string {
  const { r, g, b } = hexRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#140f0a' : '#ffffff';
}

function hexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(n.slice(0, 2), 16) || 0,
    g: parseInt(n.slice(2, 4), 16) || 0,
    b: parseInt(n.slice(4, 6), 16) || 0,
  };
}

function textoCentralizado(ctx: CanvasRenderingContext2D, cx: number, y: number, texto: string) {
  const w = ctx.measureText(texto).width;
  ctx.fillText(texto, cx - w / 2, y);
}

/** Quebra `texto` em até `maxLinhas`, cortando com "..." se não couber. */
function quebrarLinhas(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMax: number,
  maxLinhas = 2,
): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (const palavra of palavras) {
    const cand = atual ? `${atual} ${palavra}` : palavra;
    if (ctx.measureText(cand).width <= larguraMax || !atual) {
      atual = cand;
    } else {
      linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas - 1) break;
    }
  }
  if (atual) linhas.push(atual);

  if (linhas.length > maxLinhas) linhas.length = maxLinhas;
  if (linhas.length === maxLinhas) {
    let ult = linhas[maxLinhas - 1];
    const coubeInteiro = texto.trimEnd().endsWith(ult);
    if (!coubeInteiro) {
      while (ult.length > 1 && ctx.measureText(ult + '...').width > larguraMax) ult = ult.slice(0, -1);
      linhas[maxLinhas - 1] = ult + '...';
    }
  }
  return linhas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ── carregar imagens ─────────────────────────────────────────────────

export type MapaImagens = Map<string, HTMLImageElement | null>;

export function carregarImagens(urls: (string | null | undefined)[]): Promise<MapaImagens> {
  const unicas = [...new Set(urls.filter((u): u is string => !!u))];
  const mapa: MapaImagens = new Map();
  return Promise.all(
    unicas.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            mapa.set(url, img);
            resolve();
          };
          img.onerror = () => {
            mapa.set(url, null);
            resolve();
          };
          img.src = url;
        }),
    ),
  ).then(() => mapa);
}

// ── desenho ──────────────────────────────────────────────────────────

interface OpcoesPagina {
  numPagina: number;
  totalPaginas: number;
  imagens: MapaImagens;
  area: AreaProdutos;
  colunas: number;
}

export function desenharPagina(
  ctx: CanvasRenderingContext2D,
  produtos: Produto[],
  tema: TemaEncarte,
  opts: OpcoesPagina,
) {
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.clearRect(0, 0, LARGURA, ALTURA);

  // fundo
  ctx.fillStyle = tema.corFundo;
  ctx.fillRect(0, 0, LARGURA, ALTURA);

  desenharCabecalho(ctx, tema);
  const temRodape = !!(tema.nomeEmpresa || tema.slogan);

  // grade auto-ajustável: todos os produtos cabem, alinhados, sem sobrepor
  const c = cardPx(opts.area, opts.colunas, produtos.length);
  produtos.forEach((p, i) => {
    const { xPct, yPct } = posicaoNaGrade(i, opts.area, opts.colunas, produtos.length);
    desenharCard(ctx, p, tema, opts.imagens, (xPct / 100) * LARGURA, (yPct / 100) * ALTURA, c.w, c.h);
  });

  if (opts.totalPaginas > 1) {
    ctx.fillStyle = '#ffffff';
    ctx.font = fonte(20, true);
    ctx.fillText(`${opts.numPagina}/${opts.totalPaginas}`, 20, 20);
  }

  if (temRodape) desenharRodape(ctx, tema);
  ctx.restore();
}

function desenharCabecalho(ctx: CanvasRenderingContext2D, tema: TemaEncarte): number {
  const alt = 190;
  ctx.fillStyle = tema.corTitulo;
  ctx.fillRect(0, 0, LARGURA, alt);

  const corTexto = corContraste(tema.corTitulo);
  ctx.fillStyle = corTexto;
  ctx.font = fonte(64, true);
  const linhas = quebrarLinhasSimples(tema.titulo.toUpperCase(), 18).slice(0, 2);
  let y = linhas.length === 1 ? 30 : 12;
  for (const linha of linhas) {
    textoCentralizado(ctx, LARGURA / 2, y, linha);
    y += 72;
  }
  if (tema.subtitulo) {
    ctx.font = fonte(28);
    textoCentralizado(ctx, LARGURA / 2, y + 6, tema.subtitulo);
  }
  return alt;
}

/** quebra por nº de caracteres (equivalente a textwrap.wrap) */
function quebrarLinhasSimples(texto: string, width: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const cand = atual ? `${atual} ${p}` : p;
    if (cand.length <= width || !atual) atual = cand;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

function desenharCard(
  ctx: CanvasRenderingContext2D,
  produto: Produto,
  tema: TemaEncarte,
  imagens: MapaImagens,
  x0: number,
  y0: number,
  largura: number,
  altura: number,
) {
  const x1 = x0 + largura;
  const y1 = y0 + altura;
  const pad = 10;

  ctx.fillStyle = tema.corCaixaProduto;
  roundRect(ctx, x0, y0, largura, altura, 14);
  ctx.fill();

  // 1) reserva a etiqueta de preço embaixo
  const alturaTag = Math.max(46, altura * 0.3);
  const tag = { x: x0 + pad / 2, y: y1 - alturaTag, w: largura - pad, h: alturaTag - pad / 4 };
  const areaDisp = tag.y - y0 - pad;

  // 2) imagem quadrada no topo
  const ladoImg = Math.max(20, Math.min(largura - pad * 2, areaDisp * 0.58));
  const imgX = x0 + (largura - ladoImg) / 2;
  const imgY = y0 + pad;
  desenharFotoProduto(ctx, produto.imagem, imagens, imgX, imgY, ladoImg);

  // 3) nome entre a imagem e a etiqueta
  const zonaTopo = imgY + ladoImg + 6;
  const zonaAltura = Math.max(14, tag.y - 4 - zonaTopo);
  const tamFonte = Math.max(11, Math.min(largura * 0.09, zonaAltura / 2 - 2));
  ctx.font = fonte(tamFonte, true);
  ctx.fillStyle = tema.corNomeProduto;
  const linhas = quebrarLinhas(ctx, produto.nome, largura - pad * 2, 2);
  let yNome = zonaTopo;
  for (const linha of linhas) {
    if (yNome + tamFonte > tag.y - 2) break;
    textoCentralizado(ctx, x0 + largura / 2, yNome, linha);
    yNome += tamFonte + 2;
  }

  // 4) etiqueta de preço
  desenharEtiqueta(ctx, produto, tema, tag.x, tag.y, tag.w, tag.h);
}

function desenharFotoProduto(
  ctx: CanvasRenderingContext2D,
  url: string | null | undefined,
  imagens: MapaImagens,
  x: number,
  y: number,
  lado: number,
) {
  ctx.save();
  roundRect(ctx, x, y, lado, lado, 8);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, lado, lado);

  const img = url ? imagens.get(url) : null;
  if (img) {
    const alvo = lado * 0.86;
    const escala = Math.min(alvo / img.width, alvo / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, x + (lado - w) / 2, y + (lado - h) / 2, w, h);
  } else {
    ctx.strokeStyle = '#c8c8c8';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 4, lado - 8, lado - 8);
    ctx.fillStyle = '#c8c8c8';
    ctx.font = fonte(lado * 0.4, true);
    textoCentralizado(ctx, x + lado / 2, y + lado * 0.24, '?');
  }
  ctx.restore();
}

function desenharEtiqueta(
  ctx: CanvasRenderingContext2D,
  produto: Produto,
  tema: TemaEncarte,
  x: number,
  y: number,
  largura: number,
  altura: number,
) {
  ctx.fillStyle = tema.corTag;
  roundRect(ctx, x, y, largura, altura, altura / 2);
  ctx.fill();

  ctx.fillStyle = tema.corTextoTag;
  const cx = x + largura / 2;
  const [reais, centavos] = produto.preco.toFixed(2).split('.');

  let yPreco: number;
  if (produto.precoDe) {
    ctx.font = fonte(Math.max(10, altura * 0.22));
    textoCentralizado(ctx, cx, y + 4, `De R$ ${produto.precoDe.toFixed(2)} por`);
    yPreco = y + altura * 0.34;
  } else {
    yPreco = y + altura * 0.08;
  }

  const fRs = fonte(Math.max(12, altura * 0.26), true);
  const fReais = fonte(Math.max(20, altura * 0.55), true);
  const fCent = fonte(Math.max(12, altura * 0.26), true);

  const rsTxt = 'R$';
  const centTxt = `,${centavos}` + (produto.unidade ? ` ${produto.unidade}` : '');

  ctx.font = fRs;
  const wRs = ctx.measureText(rsTxt).width;
  ctx.font = fReais;
  const wReais = ctx.measureText(reais).width;
  ctx.font = fCent;
  const wCent = ctx.measureText(centTxt).width;

  const larguraTotal = wRs + 4 + wReais + 2 + wCent;
  let px = cx - larguraTotal / 2;

  ctx.font = fRs;
  ctx.fillText(rsTxt, px, yPreco + 14);
  px += wRs + 4;
  ctx.font = fReais;
  ctx.fillText(reais, px, yPreco);
  px += wReais + 2;
  ctx.font = fCent;
  ctx.fillText(centTxt, px, yPreco + 14);
}

function desenharRodape(ctx: CanvasRenderingContext2D, tema: TemaEncarte) {
  const y = ALTURA - 62;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, y);
  ctx.lineTo(LARGURA - 24, y);
  ctx.stroke();

  if (tema.nomeEmpresa) {
    ctx.fillStyle = '#ffffff';
    ctx.font = fonte(24, true);
    textoCentralizado(ctx, LARGURA / 2, y + 8, tema.nomeEmpresa);
  }
  if (tema.slogan) {
    ctx.fillStyle = '#dcdcdc';
    ctx.font = fonte(16);
    textoCentralizado(ctx, LARGURA / 2, y + 36, tema.slogan);
  }
}
