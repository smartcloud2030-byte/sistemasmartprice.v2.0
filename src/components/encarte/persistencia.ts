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
//
// Camadas (a mais recente vence na hora de carregar):
//  1. localStorage — grava na hora, sem rede; sobrevive a F5 mesmo offline.
//  2. servidor (`/api/settings/encarte_rascunho_<cnpj>`) — durável e vale
//     entre dispositivos; salvo com debounce e num "flush" ao sair da aba.

export interface RascunhoEncarte {
  formato: string;
  ladoFrente: LadoEncarte;
  ladoVerso: LadoEncarte | null;
  updatedAt: string;
}

export type RascunhoSemData = Omit<RascunhoEncarte, 'updatedAt'>;

const chaveServidor = (cnpj: string) => `/settings/encarte_rascunho_${cnpj}`;
const chaveLocal = (cnpj: string, username: string) => `encarte:rascunho:${cnpj}:${username || 'anon'}`;

function comData(r: RascunhoSemData): RascunhoEncarte {
  return { ...r, updatedAt: new Date().toISOString() };
}

/** Pega o rascunho mais recente entre servidor e localStorage. */
export async function carregarRascunho(cnpj: string, username: string): Promise<RascunhoEncarte | null> {
  const local = lerRascunhoLocal(cnpj, username);

  let servidor: RascunhoEncarte | null = null;
  try {
    const res = await apiGet(chaveServidor(cnpj));
    if (res?.value) servidor = res.value as RascunhoEncarte;
  } catch { /* ignora */ }
  if (!servidor) {
    // fallback: mapa compartilhado antigo (`encarte_rascunho`)
    try {
      const res = await apiGet('/settings/encarte_rascunho');
      servidor = (res?.value || {})[cnpj] || null;
    } catch { /* ignora */ }
  }

  if (local && servidor) return (local.updatedAt || '') >= (servidor.updatedAt || '') ? local : servidor;
  return local || servidor;
}

/** Salva no servidor (chave por cnpj, sem read-modify-write). */
export async function salvarRascunho(cnpj: string, rascunho: RascunhoSemData): Promise<void> {
  await apiPost(chaveServidor(cnpj), { value: comData(rascunho) });
}

/** Salva no servidor de um jeito que sobrevive ao fechamento/refresh da aba. */
export function salvarRascunhoKeepalive(cnpj: string, rascunho: RascunhoSemData): void {
  try {
    fetch(`${API_BASE}${chaveServidor(cnpj)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
      body: JSON.stringify({ value: comData(rascunho) }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignora */ }
}

export function lerRascunhoLocal(cnpj: string, username: string): RascunhoEncarte | null {
  try {
    const raw = localStorage.getItem(chaveLocal(cnpj, username));
    return raw ? (JSON.parse(raw) as RascunhoEncarte) : null;
  } catch {
    return null;
  }
}

export function gravarRascunhoLocal(cnpj: string, username: string, rascunho: RascunhoSemData): void {
  try {
    localStorage.setItem(chaveLocal(cnpj, username), JSON.stringify(comData(rascunho)));
  } catch { /* quota cheia / aba anônima */ }
}

export function limparRascunhoLocal(cnpj: string, username: string): void {
  try {
    localStorage.removeItem(chaveLocal(cnpj, username));
  } catch { /* ignora */ }
}
