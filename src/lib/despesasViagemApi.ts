// ─────────────────────────────────────────
// despesasViagemApi.ts — cliente tipado do /api/despesas-viagem.
// Só I/O: fetch + header x-api-token, mesmo esquema do resto do front
// (ProductReport.handleConfirmImport). Sem estado, sem React.
// ─────────────────────────────────────────
const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const BASE = '/api/despesas-viagem';

export interface ViagemRow {
  id: string;
  titulo: string;
  destino: string | null;
  motivo: string | null;
  empresa: string;
  data_inicio: string | null;   // YYYY-MM-DD
  data_fim: string | null;
  status: string;               // aberta | fechada | enviada
  criada_por: string | null;
  observacoes: string | null;
  total_centavos: string;       // BIGINT -> string
  created_at: string;
  updated_at: string;
}
export interface ViagemResumo extends ViagemRow {
  qtd_despesas: number;
}

export interface DespesaViagem {
  id: string;
  viagem_id: string;
  categoria: string;
  descricao: string | null;
  valor_centavos: string | null; // BIGINT -> string; null enquanto não extraído (foto)
  data_despesa: string;         // YYYY-MM-DD
  estabelecimento: string | null;
  documento_numero: string | null;
  km_veiculo: number | null;
  litros: string | null;        // NUMERIC -> string
  recibo_key: string | null;
  origem: string;
  ia_status: string;
  ia_confianca: string | null;
  ia_raw: unknown;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  recibo_url?: string | null;   // presente quando há recibo_key (URL assinada de stream)
}

export type ViagemDetalhe = ViagemRow & { despesas: DespesaViagem[] };

export interface NovaViagemInput {
  titulo: string;
  destino?: string;
  motivo?: string;
  data_inicio?: string;
  data_fim?: string;
  observacoes?: string;
}
export type PatchViagemInput = Partial<
  Pick<ViagemRow, 'titulo' | 'destino' | 'motivo' | 'empresa' | 'data_inicio' | 'data_fim' | 'observacoes' | 'status'>
>;

export interface NovaDespesaInput {
  categoria: string;
  descricao?: string;
  valor_centavos: number;
  data_despesa: string;
  estabelecimento?: string;
  documento_numero?: string;
  km_veiculo?: number | null;
  litros?: number | null;
}
export type PatchDespesaInput = Partial<NovaDespesaInput>;

async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-api-token': API_SECRET,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(data?.error || `${method} ${path} falhou (${res.status})`);
  return data as T;
}

export const listarViagens = (status?: string) =>
  req<ViagemResumo[]>(`/viagens${status ? `?status=${encodeURIComponent(status)}` : ''}`, 'GET');
export const criarViagem = (input: NovaViagemInput) =>
  req<ViagemRow>('/viagens', 'POST', input);
export const getViagem = (id: string) =>
  req<ViagemDetalhe>(`/viagens/${id}`, 'GET');
export const atualizarViagem = (id: string, patch: PatchViagemInput) =>
  req<ViagemRow>(`/viagens/${id}`, 'PATCH', patch);
export const excluirViagem = (id: string) =>
  req<{ success: true }>(`/viagens/${id}`, 'DELETE').then(() => undefined);
export const criarDespesa = (viagemId: string, input: NovaDespesaInput) =>
  req<DespesaViagem>(`/viagens/${viagemId}/despesas`, 'POST', input);
export const atualizarDespesa = (id: string, patch: PatchDespesaInput) =>
  req<DespesaViagem>(`/despesas/${id}`, 'PATCH', patch);
export const excluirDespesa = (id: string) =>
  req<{ success: true }>(`/despesas/${id}`, 'DELETE').then(() => undefined);

export interface ReciboExtraido {
  categoria: string;
  valorCentavos: number | null;
  dataDespesa: string | null;
  estabelecimento: string | null;
  documentoNumero: string | null;
  litros: number | null;
  kmVeiculo: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  observacao: string | null;
}
export const extrairReciboApi = (imagemBase64: string, mediaType: string, dica?: string) =>
  req<ReciboExtraido>('/extrair', 'POST', { imagemBase64, mediaType, dica });

// Relatório (PDF/Excel) — resposta binária, não JSON; baixa como blob e
// dispara o download do navegador (endpoint exige x-api-token, não dá pra
// usar um <a href> puro).
export async function baixarRelatorio(viagemId: string, formato: 'pdf' | 'xlsx'): Promise<void> {
  const res = await fetch(`${BASE}/viagens/${viagemId}/relatorio?formato=${formato}`, {
    method: 'POST',
    headers: { 'x-api-token': API_SECRET },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Falha ao gerar relatório (${res.status})`);
  }
  const disposicao = res.headers.get('content-disposition') || '';
  const nomeArquivo = /filename="([^"]+)"/.exec(disposicao)?.[1] || `relatorio-viagem.${formato}`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
