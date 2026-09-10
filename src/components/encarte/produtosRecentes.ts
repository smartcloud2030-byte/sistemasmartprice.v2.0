// Histórico e favoritos de produtos do encarte — por usuário, guardado só no
// localStorage do navegador (o editor de encarte é do admin; não precisa
// sincronizar entre dispositivos).

const MAX_HIST = 40;

type Tipo = 'hist' | 'fav';
const chave = (tipo: Tipo, user: string) => `encarte:produtos:${tipo}:${(user || 'anon').toLowerCase()}`;

function ler(tipo: Tipo, user: string): string[] {
  try {
    const raw = localStorage.getItem(chave(tipo, user));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function gravar(tipo: Tipo, user: string, ids: string[]): void {
  try {
    localStorage.setItem(chave(tipo, user), JSON.stringify(ids));
  } catch {
    /* quota cheia / aba anônima */
  }
}

export function lerHistorico(user: string): string[] {
  return ler('hist', user);
}

/** Põe o produto no topo do histórico (sem duplicar), limita o tamanho. */
export function registrarHistorico(user: string, id: string): void {
  const s = String(id);
  const atual = ler('hist', user).filter((x) => x !== s);
  gravar('hist', user, [s, ...atual].slice(0, MAX_HIST));
}

export function lerFavoritos(user: string): string[] {
  return ler('fav', user);
}

export function ehFavorito(user: string, id: string): boolean {
  return ler('fav', user).includes(String(id));
}

/** Liga/desliga o favorito e devolve a lista nova. */
export function alternarFavorito(user: string, id: string): string[] {
  const s = String(id);
  const atual = ler('fav', user);
  const novo = atual.includes(s) ? atual.filter((x) => x !== s) : [s, ...atual];
  gravar('fav', user, novo);
  return novo;
}
