// Fontes gratuitas de código de barras, consultadas antes da Cosmos (que no
// plano grátis vive sem cota):
//  1. CMED/Anvisa — lista oficial de medicamentos (src/data/cmed.json.gz,
//     gerado por scripts/atualizar-cmed.cjs). Sem foto, sem limite.
//  2. Open Food / Beauty / Products Facts — base aberta, tem foto.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface ProdutoEncontrado {
  gtin: string;
  description: string;
  brand: string | null;
  thumbnail: string | null;
  ncm: string | null;
  fonte: string;
}

let cmed: { fonte: string; itens: Record<string, string[]> } | null = null;
let cmedFalhou = false;

function carregarCmed() {
  if (cmed || cmedFalhou) return cmed;
  try {
    const arquivo = path.join(process.cwd(), 'src', 'data', 'cmed.json.gz');
    cmed = JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf8'));
    console.log(`[barcode] CMED carregada: ${Object.keys(cmed!.itens).length} códigos (${cmed!.fonte})`);
  } catch (err) {
    cmedFalhou = true;
    console.error('[barcode] não consegui carregar a lista CMED:', err);
  }
  return cmed;
}

// O mesmo produto aparece como 13 ou 14 dígitos (zero à esquerda).
function variantes(gtin: string): string[] {
  const semZero = gtin.replace(/^0+/, '');
  if (semZero.length < 8) return [];
  return [...new Set([gtin, semZero, semZero.padStart(13, '0'), semZero.padStart(14, '0')])];
}

export function buscarCmed(gtin: string): ProdutoEncontrado | null {
  const base = carregarCmed();
  if (!base) return null;
  for (const g of variantes(gtin)) {
    const item = base.itens[g];
    if (!item) continue;
    const [produto, apresentacao, laboratorio] = item;
    return {
      gtin,
      description: [produto, apresentacao].filter(Boolean).join(' '),
      brand: laboratorio || null,
      thumbnail: null,
      ncm: null,
      fonte: 'Anvisa (CMED)',
    };
  }
  return null;
}

/** Tarja do remédio pela CMED: 'V' vermelha, 'P' preta, 'L' sem tarja, '' sem informação; null = código não é remédio da CMED. */
export function tarjaCmed(gtin: string): 'V' | 'P' | 'L' | '' | null {
  const base = carregarCmed();
  if (!base) return null;
  for (const g of variantes(gtin)) {
    const item = base.itens[g];
    if (item) return (item[4] as any) ?? '';
  }
  return null;
}

const OPEN_FACTS = [
  { host: 'world.openfoodfacts.org', nome: 'Open Food Facts' },
  { host: 'world.openbeautyfacts.org', nome: 'Open Beauty Facts' },
  { host: 'world.openproductsfacts.org', nome: 'Open Products Facts' },
];

async function consultarOpenFacts(host: string, nome: string, gtin: string): Promise<ProdutoEncontrado | null> {
  const campos = 'product_name_pt,product_name,generic_name_pt,brands,image_front_url,image_url';
  const res = await fetch(`https://${host}/api/v2/product/${gtin}.json?fields=${campos}`, {
    headers: { 'User-Agent': 'SmartPrice/1.0 (sistemasmartprice.com.br)' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  const p = json?.product;
  const descricao = (p?.product_name_pt || p?.product_name || p?.generic_name_pt || '').trim();
  if (json?.status !== 1 || !descricao) return null;
  return {
    gtin,
    description: descricao,
    brand: (p.brands || '').split(',')[0].trim() || null,
    // As imagens do Open Facts mandam CORS liberado — o navegador baixa direto.
    thumbnail: p.image_front_url || p.image_url || null,
    ncm: null,
    fonte: nome,
  };
}

/** Consulta as três bases Open Facts juntas; fica com a primeira que tiver o produto. */
export async function buscarOpenFacts(gtin: string): Promise<ProdutoEncontrado | null> {
  const resultados = await Promise.allSettled(OPEN_FACTS.map((o) => consultarOpenFacts(o.host, o.nome, gtin)));
  for (const r of resultados) if (r.status === 'fulfilled' && r.value) return r.value;
  return null;
}

/**
 * Foto pelo CDN da Cosmos: é público e NÃO gasta a cota da API. Às vezes vem
 * uma caixa genérica, mas na maioria é a embalagem real. Devolve a URL do
 * nosso proxy (/api/barcode-image), porque o CDN não manda CORS.
 */
export async function fotoCosmosCdn(codigo: string): Promise<string | null> {
  // O CDN só conhece o EAN-13 ("07891106000956" → "7891106000956").
  const gtin = codigo.length === 14 && codigo.startsWith('0') ? codigo.slice(1) : codigo;
  try {
    const res = await fetch(`https://cdn-cosmos.bluesoft.com.br/products/${gtin}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? `/api/barcode-image/${gtin}` : null;
  } catch {
    return null;
  }
}

/** CMED primeiro (nome oficial); foto e produtos que não são remédio vêm do Open Facts; sem foto, tenta o CDN da Cosmos. */
export async function buscarFontesGratuitas(gtin: string): Promise<ProdutoEncontrado | null> {
  const doCmed = buscarCmed(gtin);
  const [doOpen, cdn] = await Promise.all([
    buscarOpenFacts(gtin).catch(() => null),
    fotoCosmosCdn(gtin),
  ]);
  const base = doCmed || doOpen;
  if (!base) return null;
  const fotoOpen = doOpen?.thumbnail || null;
  const thumbnail = fotoOpen || cdn;
  const fonteFoto = fotoOpen ? doOpen!.fonte : cdn ? 'Cosmos' : null;
  const fonte = fonteFoto && fonteFoto !== base.fonte ? `${base.fonte} + foto ${fonteFoto}` : base.fonte;
  return { ...base, thumbnail, fonte };
}
