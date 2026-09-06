// Visibilidade das classificações da galeria do encarte.
// Guardado num único blob em settings (`/api/settings/:id`), mesma abordagem
// de persistencia.ts — sem endpoint novo no servidor.

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const SETTINGS_KEY = 'encarte_galeria_visibilidade';

export interface VisibilidadeClassificacao {
  /** 'todos' = qualquer usuário vê; 'restrito' = só quem casar com as listas abaixo */
  modo: 'todos' | 'restrito';
  /** CNPJs (só dígitos) das lojas/usuários liberados */
  cnpjs: string[];
  /** bandeiras liberadas */
  bandeiras: string[];
  /** ids de grupos liberados */
  grupos: string[];
}

/** categoria completa (ex.: 'encarte-temas--natal') -> visibilidade */
export type MapaVisibilidade = Record<string, VisibilidadeClassificacao>;

export const VIS_PADRAO: VisibilidadeClassificacao = {
  modo: 'todos',
  cnpjs: [],
  bandeiras: [],
  grupos: [],
};

const soDigitos = (s: string | undefined | null) => (s || '').replace(/\D/g, '');

export async function carregarVisibilidade(): Promise<MapaVisibilidade> {
  try {
    const res = await fetch(`/api/settings/${SETTINGS_KEY}`, { headers: { 'x-api-token': API_SECRET } });
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    const value = data?.value;
    return value && typeof value === 'object' ? (value as MapaVisibilidade) : {};
  } catch {
    return {};
  }
}

export async function salvarVisibilidade(mapa: MapaVisibilidade): Promise<void> {
  const res = await fetch(`/api/settings/${SETTINGS_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
    body: JSON.stringify({ value: mapa }),
  });
  if (!res.ok) throw new Error('Falha ao salvar a visibilidade da classificação.');
}

/** Deixa o blob enxuto: entradas 'todos' e sem alvos não precisam ser guardadas. */
export function normalizarMapa(mapa: MapaVisibilidade): MapaVisibilidade {
  const limpo: MapaVisibilidade = {};
  for (const [cat, v] of Object.entries(mapa)) {
    const restrito = v.modo === 'restrito' && (v.cnpjs.length || v.bandeiras.length || v.grupos.length);
    if (restrito) limpo[cat] = { ...v, modo: 'restrito' };
  }
  return limpo;
}

export interface CtxUsuario {
  isAdmin: boolean;
  cnpj?: string;
  bandeira?: string;
  grupoId?: string;
}

/** O usuário pode ver essa classificação? Admin sempre; sem regra = todos. */
export function podeVerClassificacao(categoria: string, mapa: MapaVisibilidade, ctx: CtxUsuario): boolean {
  if (ctx.isAdmin) return true;
  const v = mapa[categoria];
  if (!v || v.modo === 'todos') return true;
  const semAlvo = !v.cnpjs.length && !v.bandeiras.length && !v.grupos.length;
  if (semAlvo) return true; // 'restrito' sem ninguém marcado = ninguém foi excluído ainda
  const cnpj = soDigitos(ctx.cnpj);
  if (cnpj && v.cnpjs.map(soDigitos).includes(cnpj)) return true;
  if (ctx.bandeira && v.bandeiras.includes(ctx.bandeira)) return true;
  if (ctx.grupoId && v.grupos.includes(ctx.grupoId)) return true;
  return false;
}
