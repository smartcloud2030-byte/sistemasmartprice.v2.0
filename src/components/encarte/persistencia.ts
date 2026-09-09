import { LadoEncarte } from './encarteProduto';

// Mesmo padrão de /api/settings/:id usado em outras partes do app (ex.:
// savedPlaquinhas no store.ts): um blob JSON só, indexado por cnpj — sem
// endpoint novo no servidor, só uma chave nova dentro de `settings`.
const API_SECRET =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_SECRET || 'smartprice-api-2026';
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

/**
 * Chave de armazenamento do rascunho/histórico a partir do usuário logado.
 *
 * A tela de Encarte Online é só de admin, e o admin não tem CNPJ (loga com
 * 'Administrativo', que vira '' depois de tirar os não-dígitos). Sem uma chave
 * estável aqui, toda a persistência do editor ficava travada num `if (!cnpj)`:
 * "Salvar" não gravava, o rascunho não voltava no F5 nem ao sair/voltar do
 * editor de plaquinha, e a aba Encartes ficava vazia.
 *
 * Regra: CNPJ de verdade (tem dígitos) → só os dígitos. Senão → `u-<username>`.
 */
export function chaveArmazenamento(
  cnpjBruto: string | undefined | null,
  username: string | undefined | null,
): string {
  const digits = (cnpjBruto || '').replace(/[^\d]/g, '');
  if (digits) return digits;
  const u = (username || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return u ? `u-${u}` : '';
}

/**
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS ou localhost). Se o
 * sistema for aberto por `http://<ip>`, ele é `undefined` e `salvarNoHistorico`
 * quebrava ANTES de gravar — o encarte não era salvo. Este fallback garante um
 * id sempre.
 */
function novoId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* ignora */ }
  return `enc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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

// Uma chave por CNPJ (`encarte_historico_<cnpj>`), não mais um blob único com
// todos os clientes juntos. O blob único crescia sem limite (20 encartes ×
// N clientes, cada um com frente/verso completos + miniatura) e, pior, todo
// "Salvar" reescrevia o objeto inteiro — dois clientes salvando ao mesmo
// tempo, um apagava o outro. Chave por CNPJ isola isso e mantém o payload
// pequeno. Leitura cai no blob legado se a chave nova ainda não existe.
const chaveHistorico = (cnpj: string) => `/settings/encarte_historico_${cnpj}`;

export async function carregarHistorico(cnpj: string): Promise<EncarteSalvo[]> {
  try {
    const res = await apiGet(chaveHistorico(cnpj));
    if (Array.isArray(res?.value)) return res.value as EncarteSalvo[];
  } catch { /* cai no legado */ }
  // Legado: blob único `encarte_historico` indexado por cnpj.
  try {
    const res = await apiGet('/settings/encarte_historico');
    return (res?.value || {})[cnpj] || [];
  } catch {
    return [];
  }
}

// Serializa as gravações do histórico: "Salvar" + auto-save pós-download podem
// disparar quase juntos; sem fila, o segundo lê a lista antes do primeiro
// gravar e um dos encartes some.
let filaHistorico: Promise<unknown> = Promise.resolve();
function enfileirarHistorico<T>(tarefa: () => Promise<T>): Promise<T> {
  const proxima = filaHistorico.then(tarefa, tarefa);
  filaHistorico = proxima.catch(() => {});
  return proxima;
}

export function salvarNoHistorico(
  cnpj: string,
  entrada: Omit<EncarteSalvo, 'id' | 'createdAt'>,
): Promise<EncarteSalvo[]> {
  return enfileirarHistorico(async () => {
    const atual = await carregarHistorico(cnpj);
    const novo: EncarteSalvo = { ...entrada, id: novoId(), createdAt: new Date().toISOString() };
    const lista = [novo, ...atual].slice(0, HISTORICO_MAX);
    await apiPost(chaveHistorico(cnpj), { value: lista });
    return lista;
  });
}

export function apagarDoHistorico(cnpj: string, id: string): Promise<EncarteSalvo[]> {
  return enfileirarHistorico(async () => {
    const atual = await carregarHistorico(cnpj);
    const lista = atual.filter((e) => e.id !== id);
    await apiPost(chaveHistorico(cnpj), { value: lista });
    return lista;
  });
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

export interface ResultadoRascunho {
  rascunho: RascunhoEncarte | null;
  /**
   * `true` se a leitura do servidor completou (mesmo devolvendo vazio). `false`
   * se a requisição falhou — nesse caso NÃO sabemos o estado real e o auto-save
   * precisa ficar travado, senão o primeiro clique grava por cima do rascunho
   * bom que está no servidor.
   */
  servidorLido: boolean;
}

/** Pega o rascunho mais recente entre servidor e localStorage. */
export async function carregarRascunho(cnpj: string, username: string): Promise<ResultadoRascunho> {
  const local = lerRascunhoLocal(cnpj, username);

  let servidor: RascunhoEncarte | null = null;
  let servidorLido = false;
  try {
    const res = await apiGet(chaveServidor(cnpj));
    servidorLido = true;
    if (res?.value) servidor = res.value as RascunhoEncarte;
  } catch { /* servidorLido continua false */ }
  if (servidorLido && !servidor) {
    // servidor respondeu vazio — tenta o mapa compartilhado antigo (`encarte_rascunho`)
    try {
      const res = await apiGet('/settings/encarte_rascunho');
      servidor = (res?.value || {})[cnpj] || null;
    } catch { /* ignora */ }
  }

  const rascunho =
    local && servidor
      ? (local.updatedAt || '') >= (servidor.updatedAt || '')
        ? local
        : servidor
      : local || servidor;
  return { rascunho, servidorLido };
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
