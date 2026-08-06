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
  data: string;        // ISO date — início da despesa (avulsa: a data do gasto)
  dataFim?: string;     // ISO date, opcional — despesa recorrente para de contar a partir desse mês
  fornecedor?: string;  // opcional — nome do fornecedor e/ou link
}

export function mesAnoStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function isDespesaAtivaNoMes(despesa: Despesa, ano: number, mes: number): boolean {
  const alvo = mesAnoStr(ano, mes);
  const inicio = despesa.data.slice(0, 7);
  if (!despesa.recorrente) {
    return inicio === alvo;
  }
  if (inicio > alvo) return false;
  if (despesa.dataFim && alvo >= despesa.dataFim.slice(0, 7)) return false;
  return true;
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
