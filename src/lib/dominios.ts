export interface Dominio {
  id: number;
  dominio: string;
  /** YYYY-MM-DD */
  vencimento: string;
  registrador: string | null;
  /** e-mail da conta onde o domínio é renovado */
  conta: string | null;
}

export type StatusDominio = 'vencido' | 'vence_em_breve' | 'ok';

/** Com quantos dias de antecedência o painel começa a avisar. */
export const DIAS_AVISO_DOMINIO = 30;

/** Dias até o vencimento contando só a data (negativo = já venceu). */
export function diasParaVencer(vencimento: string, hoje: Date = new Date()): number {
  const [a, m, d] = vencimento.slice(0, 10).split('-').map(Number);
  const venc = Date.UTC(a, m - 1, d);
  const hj = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((venc - hj) / 86_400_000);
}

export function statusDominio(vencimento: string, hoje: Date = new Date()): StatusDominio {
  const dias = diasParaVencer(vencimento, hoje);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_AVISO_DOMINIO) return 'vence_em_breve';
  return 'ok';
}

/** Vencidos e a vencer, do mais urgente pro menos. */
export function dominiosAVencer(dominios: Dominio[], hoje: Date = new Date()): Dominio[] {
  return dominios
    .filter((d) => statusDominio(d.vencimento, hoje) !== 'ok')
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/** Tira protocolo, www e barra do fim: "https://www.Site.com.br/" → "site.com.br". */
export function normalizarDominio(entrada: string): string {
  return entrada
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function dominioValido(dominio: string): boolean {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(dominio);
}

export function textoPrazo(vencimento: string, hoje: Date = new Date()): string {
  const dias = diasParaVencer(vencimento, hoje);
  if (dias < 0) return `Venceu há ${-dias} dia${dias === -1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${dias} dias`;
}

export function formatarData(vencimento: string): string {
  const [a, m, d] = vencimento.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
