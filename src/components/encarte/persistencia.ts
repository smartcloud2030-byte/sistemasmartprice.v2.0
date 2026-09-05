import { LadoEncarte } from './encarteProduto';

// Mesmo padrão de /api/settings/:id usado em outras partes do app (ex.:
// savedPlaquinhas no store.ts): um blob JSON só, indexado por cnpj — sem
// endpoint novo no servidor, só uma chave nova dentro de `settings`.
const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const API_BASE = '/api';

async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-api-token': API_SECRET } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

const HISTORICO_MAX = 20;

/** Um encarte já feito, guardado no histórico pra poder ser recuperado depois. */
export interface EncarteSalvo {
  id: string;
  nome: string;
  /** miniatura PNG (base64) de como o encarte estava no momento do download */
  imagemPreview: string;
  formato: string;
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
  createdAt: string;
}

export async function carregarHistorico(cnpj: string): Promise<EncarteSalvo[]> {
  const res = await apiGet('/settings/encarte_historico');
  const all = res?.value || {};
  return all[cnpj] || [];
}

export async function salvarNoHistorico(
  cnpj: string,
  entrada: Omit<EncarteSalvo, 'id' | 'createdAt'>,
): Promise<EncarteSalvo[]> {
  const res = await apiGet('/settings/encarte_historico');
  const all = res?.value || {};
  const atual: EncarteSalvo[] = all[cnpj] || [];
  const novo: EncarteSalvo = { ...entrada, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  const lista = [novo, ...atual].slice(0, HISTORICO_MAX);
  all[cnpj] = lista;
  await apiPost('/settings/encarte_historico', { value: all });
  return lista;
}

export async function apagarDoHistorico(cnpj: string, id: string): Promise<EncarteSalvo[]> {
  const res = await apiGet('/settings/encarte_historico');
  const all = res?.value || {};
  const atual: EncarteSalvo[] = all[cnpj] || [];
  const lista = atual.filter((e) => e.id !== id);
  all[cnpj] = lista;
  await apiPost('/settings/encarte_historico', { value: all });
  return lista;
}

// ── Rascunho atual — auto-save pra não perder o trabalho ao recarregar ──

export interface RascunhoEncarte {
  formato: string;
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
  updatedAt: string;
}

export async function carregarRascunho(cnpj: string): Promise<RascunhoEncarte | null> {
  const res = await apiGet('/settings/encarte_rascunho');
  const all = res?.value || {};
  return all[cnpj] || null;
}

export async function salvarRascunho(cnpj: string, rascunho: Omit<RascunhoEncarte, 'updatedAt'>): Promise<void> {
  const res = await apiGet('/settings/encarte_rascunho');
  const all = res?.value || {};
  all[cnpj] = { ...rascunho, updatedAt: new Date().toISOString() };
  await apiPost('/settings/encarte_rascunho', { value: all });
}
