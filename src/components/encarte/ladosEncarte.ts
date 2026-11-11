// Páginas do encarte: frente, verso e (opcional) verso 2 — até 3 páginas.
import { LadoEncarte, clonarLado } from './encarteProduto';

export type Lado = 'frente' | 'verso' | 'verso2';

export const NOME_LADO: Record<Lado, string> = { frente: 'Frente', verso: 'Verso', verso2: 'Verso 2' };

/** Os campos do documento do encarte que guardam cada página. */
export interface PaginasEncarte {
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
  ladoVerso2?: LadoEncarte | null;
}

const CHAVE: Record<Lado, keyof PaginasEncarte> = { frente: 'ladoFrente', verso: 'ladoVerso', verso2: 'ladoVerso2' };

export function ladoDoDoc(d: PaginasEncarte, l: Lado): LadoEncarte | null {
  return (d[CHAVE[l]] as LadoEncarte | null | undefined) ?? null;
}

export function comLado<T extends PaginasEncarte>(d: T, l: Lado, novo: LadoEncarte | null): T {
  return { ...d, [CHAVE[l]]: novo };
}

/** Páginas que existem, na ordem (o verso 2 só conta se houver verso). */
export function paginasDoDoc(d: PaginasEncarte): Lado[] {
  const p: Lado[] = ['frente'];
  if (d.ladoVerso) {
    p.push('verso');
    if (d.ladoVerso2) p.push('verso2');
  }
  return p;
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
