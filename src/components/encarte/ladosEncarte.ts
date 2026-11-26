// Páginas do encarte: frente + até 7 versos (verso, verso 2 … verso 7) — até 8 páginas.
import { LadoEncarte, clonarLado } from './encarteProduto';

export type Lado = 'frente' | 'verso' | 'verso2' | 'verso3' | 'verso4' | 'verso5' | 'verso6' | 'verso7';

/** Versos na ordem — cada um só existe se o anterior existir. */
export const VERSOS: Exclude<Lado, 'frente'>[] = ['verso', 'verso2', 'verso3', 'verso4', 'verso5', 'verso6', 'verso7'];
export const MAX_PAGINAS = 1 + VERSOS.length;

export const NOME_LADO: Record<Lado, string> = {
  frente: 'Frente', verso: 'Verso', verso2: 'Verso 2', verso3: 'Verso 3', verso4: 'Verso 4',
  verso5: 'Verso 5', verso6: 'Verso 6', verso7: 'Verso 7',
};

/** Os campos do documento do encarte que guardam cada página. */
export interface PaginasEncarte {
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
  ladoVerso2?: LadoEncarte | null;
  ladoVerso3?: LadoEncarte | null;
  ladoVerso4?: LadoEncarte | null;
  ladoVerso5?: LadoEncarte | null;
  ladoVerso6?: LadoEncarte | null;
  ladoVerso7?: LadoEncarte | null;
}

/** Só os versos (o que vai além da frente). */
export type VersosEncarte = Omit<PaginasEncarte, 'ladoFrente'>;

const CHAVE: Record<Lado, keyof PaginasEncarte> = {
  frente: 'ladoFrente', verso: 'ladoVerso', verso2: 'ladoVerso2', verso3: 'ladoVerso3', verso4: 'ladoVerso4',
  verso5: 'ladoVerso5', verso6: 'ladoVerso6', verso7: 'ladoVerso7',
};

export function ladoDoDoc(d: PaginasEncarte, l: Lado): LadoEncarte | null {
  return (d[CHAVE[l]] as LadoEncarte | null | undefined) ?? null;
}

export function comLado<T extends PaginasEncarte>(d: T, l: Lado, novo: LadoEncarte | null): T {
  return { ...d, [CHAVE[l]]: novo };
}

/** Páginas que existem, na ordem (um verso só conta se o anterior existir). */
export function paginasDoDoc(d: PaginasEncarte): Lado[] {
  const p: Lado[] = ['frente'];
  for (const v of VERSOS) {
    if (!ladoDoDoc(d, v)) break;
    p.push(v);
  }
  return p;
}

/**
 * Os versos do documento, já respeitando a sequência (verso 3 sem verso 2
 * vira null) e passando cada um por `f` (normalizar, regridar, tirar produtos…).
 */
export function versosDoDoc(
  d: Partial<PaginasEncarte>,
  f: (l: LadoEncarte) => LadoEncarte = (l) => l,
): VersosEncarte {
  const out: VersosEncarte = { ladoVerso: null, ladoVerso2: null, ladoVerso3: null, ladoVerso4: null,
    ladoVerso5: null, ladoVerso6: null, ladoVerso7: null,
  };
  for (const v of VERSOS) {
    const l = d[CHAVE[v]] as LadoEncarte | null | undefined;
    if (!l) break;
    (out as Record<string, LadoEncarte | null>)[CHAVE[v]] = f(l);
  }
  return out;
}

/** Próximo verso a criar (null = já tem as 8 páginas). */
export function proximoVerso(d: PaginasEncarte): Lado | null {
  return VERSOS.find((v) => !ladoDoDoc(d, v)) ?? null;
}

/** Tira uma página de verso; os versos seguintes sobem uma posição. */
export function semPagina<T extends PaginasEncarte>(d: T, l: Lado): T {
  if (l === 'frente') return d;
  const restantes = VERSOS.filter((v) => v !== l)
    .map((v) => ladoDoDoc(d, v))
    .filter((x): x is LadoEncarte => !!x);
  let out = { ...d };
  VERSOS.forEach((v, i) => { out = comLado(out, v, restantes[i] ?? null); });
  return out;
}

/**
 * Página nova a partir da frente: leva tema, estilo, grade, imagens
 * (elementos e marca), formas, textos e rodapé — mas nasce SEM produtos.
 */
export function novaPaginaSemProdutos(frente: LadoEncarte): LadoEncarte {
  return {
    ...clonarLado(frente),
    areaTopo: frente.areaTopo,
    areaBase: frente.areaBase,
    produtos: [],
    divisores: [],
  };
}
