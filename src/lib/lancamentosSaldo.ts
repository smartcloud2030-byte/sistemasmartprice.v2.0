// ─────────────────────────────────────────
// lancamentosSaldo.ts — Extrato do saldo em conta do painel Financeiro.
// Cada depósito ou pagamento de despesa vira um lançamento (histórico
// append-only — nada é editado/removido, só acumula).
// ─────────────────────────────────────────

export interface LancamentoSaldo {
  id: string;
  tipo: 'deposito' | 'despesa' | 'estorno' | 'ajuste';
  descricao: string;
  /** positivo = entrou no saldo, negativo = saiu. */
  valor: number;
  data: string; // ISO datetime
  despesaId?: string; // presente em 'despesa'/'estorno', liga de volta à despesa
}

export function ordenarPorDataDesc(lancamentos: LancamentoSaldo[]): LancamentoSaldo[] {
  return [...lancamentos].sort((a, b) => b.data.localeCompare(a.data));
}
