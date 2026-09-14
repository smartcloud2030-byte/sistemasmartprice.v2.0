// ─────────────────────────────────────────
// despesas.ts — Modelo e cálculo do DRE do painel Financeiro
// Funções puras: quais despesas contam em qual mês, totais, navegação de mês.
// ─────────────────────────────────────────

export interface Despesa {
  id: string;
  descricao: string;
  categoria: 'dominio' | 'ia' | 'outros';
  valor: number;
  recorrente: boolean;
  /** só importa quando recorrente=true — 'mensal' (padrão) ou 'anual'. */
  frequencia?: 'mensal' | 'anual';
  data: string;        // ISO date — data de contratação/início (avulsa: a data do gasto)
  /** ISO date, opcional — dia/mês de vencimento, quando diferente da contratação (padrão: usa `data`). */
  dataVencimento?: string;
  dataFim?: string;     // ISO date, opcional — despesa recorrente para de contar a partir desse mês
  fornecedor?: string;  // opcional — nome do fornecedor e/ou link
  /** despesa avulsa (recorrente=false): já foi paga. */
  pago?: boolean;
  /** despesa recorrente: meses ("YYYY-MM") já marcados como pagos. */
  mesesPagos?: string[];
}

export function mesAnoStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function isDespesaAtivaNoMes(despesa: Despesa, ano: number, mes: number): boolean {
  const alvo = mesAnoStr(ano, mes);
  const inicio = despesa.data.slice(0, 7);
  if (!despesa.recorrente) {
    // avulsa: conta no mês do VENCIMENTO (quando tem, e é diferente da
    // contratação) — é o mês que importa pra pagar/alertar, não o da compra.
    const refAvulsa = (despesa.dataVencimento || despesa.data).slice(0, 7);
    return refAvulsa === alvo;
  }
  if (inicio > alvo) return false;
  if (despesa.dataFim && alvo >= despesa.dataFim.slice(0, 7)) return false;
  if (despesa.frequencia === 'anual') {
    // mês de referência pro aniversário anual: o do vencimento (quando
    // definido separado da contratação), senão o da própria contratação.
    const mesRef = Number((despesa.dataVencimento || despesa.data).slice(5, 7));
    return mes === mesRef;
  }
  return true;
}

/** Dia do vencimento (de `dataVencimento`, ou `data` se não tiver — mesmo dia todo mês/ano na recorrência). */
export function diaVencimento(despesa: Despesa): number {
  return Number((despesa.dataVencimento || despesa.data).slice(8, 10));
}

/** Já foi marcada como paga — avulsa (`pago`) ou o mês em questão (`mesesPagos`). */
export function isPago(despesa: Despesa, ano: number, mes: number): boolean {
  if (!despesa.recorrente) return !!despesa.pago;
  return !!despesa.mesesPagos?.includes(mesAnoStr(ano, mes));
}

/** Patch pra alternar o "pago" no `updateDespesa` — cuida da diferença avulsa/recorrente. */
export function patchTogglePago(despesa: Despesa, ano: number, mes: number): Partial<Despesa> {
  if (!despesa.recorrente) return { pago: !despesa.pago };
  const chave = mesAnoStr(ano, mes);
  const jaPago = despesa.mesesPagos?.includes(chave);
  const mesesPagos = jaPago
    ? (despesa.mesesPagos || []).filter((m) => m !== chave)
    : [...(despesa.mesesPagos || []), chave];
  return { mesesPagos };
}

const DIAS_ALERTA_VENCIMENTO = 5;

export type StatusVencimento = 'pago' | 'vencida' | 'vence_em_breve' | 'em_dia';

/** Status de vencimento pra despesa ativa no mês exibido, comparado com a data de HOJE de verdade
 * (não com o mês que está sendo navegado) — só acende alerta quando o mês exibido é o atual. */
export function statusVencimento(despesa: Despesa, ano: number, mes: number, hoje: Date = new Date()): StatusVencimento {
  if (isPago(despesa, ano, mes)) return 'pago';
  const vencimento = new Date(ano, mes - 1, diaVencimento(despesa));
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diffDias = Math.round((vencimento.getTime() - hojeSemHora.getTime()) / 86400000);
  if (diffDias < 0) return 'vencida';
  if (diffDias <= DIAS_ALERTA_VENCIMENTO) return 'vence_em_breve';
  return 'em_dia';
}

export function despesasDoMes(despesas: Despesa[], ano: number, mes: number): Despesa[] {
  return despesas.filter((d) => isDespesaAtivaNoMes(d, ano, mes));
}

export function totalDespesasDoMes(despesas: Despesa[], ano: number, mes: number): number {
  return despesasDoMes(despesas, ano, mes).reduce((sum, d) => sum + d.valor, 0);
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatMesAno(ano: number, mes: number): string {
  return `${NOMES_MES[mes - 1]} ${ano}`;
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}
