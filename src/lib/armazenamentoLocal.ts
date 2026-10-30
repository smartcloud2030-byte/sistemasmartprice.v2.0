import type { PersistStorage, StorageValue } from 'zustand/middleware';

// Armazenamento do estado persistido (fila de impressão, rascunho, modelos...)
// no IndexedDB em vez do localStorage. O localStorage tem ~5 MB por site e a
// fila guarda a imagem inteira de cada plaquinha: quando enchia, a gravação
// estourava QuotaExceededError dentro do set() do zustand e a loja via "Erro ao
// adicionar à fila" e a tela travando. O IndexedDB tem bem mais espaço e grava
// fora do caminho da digitação.
//
// O zustand hidrata de forma síncrona na criação do store (o App depende disso
// no primeiro render — sessão, login, etc.), então os valores são lidos do
// IndexedDB ANTES de importar o store (ver main.tsx) e servidos de um cache em
// memória. As gravações vão pro IndexedDB com um pequeno atraso, agrupadas.

const DB_NOME = 'smartprice';
const DB_TABELA = 'kv';
const ATRASO_GRAVACAO_MS = 400;

let db: IDBDatabase | null = null;
const cache = new Map<string, unknown>();
const pendentes = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Alguns navegadores (aba anônima antiga) deixam o open pendurado.
    const limite = setTimeout(() => reject(new Error('IndexedDB não respondeu')), 3000);
    try {
      const req = indexedDB.open(DB_NOME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_TABELA);
      req.onsuccess = () => { clearTimeout(limite); resolve(req.result); };
      req.onerror = () => { clearTimeout(limite); reject(req.error); };
    } catch (err) {
      clearTimeout(limite);
      reject(err);
    }
  });
}

function lerDoBanco(banco: IDBDatabase, chave: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const req = banco.transaction(DB_TABELA, 'readonly').objectStore(DB_TABELA).get(chave);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

function gravarNoBanco(banco: IDBDatabase, chave: string, valor: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = banco.transaction(DB_TABELA, 'readwrite');
    const tabela = tx.objectStore(DB_TABELA);
    if (valor === undefined) tabela.delete(chave);
    else tabela.put(valor, chave);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function descarregar() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!db || pendentes.size === 0) return;
  const banco = db;
  for (const [chave, valor] of pendentes) {
    const texto = valor === undefined ? undefined : JSON.stringify(valor);
    gravarNoBanco(banco, chave, texto).catch((err) => console.error('Erro ao gravar dados locais:', err));
  }
  pendentes.clear();
}

function agendar(chave: string, valor: unknown) {
  pendentes.set(chave, valor);
  if (!timer) timer = setTimeout(descarregar, ATRASO_GRAVACAO_MS);
}

/**
 * Carrega as chaves do IndexedDB pro cache. Na primeira vez migra o que estava
 * no localStorage e libera o espaço de lá. Se o IndexedDB não estiver
 * disponível, segue no localStorage (como antes).
 */
export async function carregarArmazenamento(chaves: string[]): Promise<void> {
  try {
    const banco = await abrirBanco();
    for (const chave of chaves) {
      let texto = await lerDoBanco(banco, chave);
      if (texto === undefined) {
        const legado = localStorage.getItem(chave);
        if (legado !== null) {
          await gravarNoBanco(banco, chave, legado);
          texto = legado;
        }
      }
      if (texto !== undefined) cache.set(chave, JSON.parse(texto));
      try { localStorage.removeItem(chave); } catch { /* ignora */ }
    }
    db = banco;
    window.addEventListener('pagehide', descarregar);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') descarregar();
    });
  } catch (err) {
    console.warn('IndexedDB indisponível, usando localStorage:', err);
    db = null;
  }
}

let avisouCota = false;

export function armazenamentoPersist<S>(): PersistStorage<S> {
  return {
    getItem: (nome) => {
      if (db) return (cache.get(nome) as StorageValue<S> | undefined) ?? null;
      try {
        const texto = localStorage.getItem(nome);
        return texto ? (JSON.parse(texto) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (nome, valor) => {
      if (db) {
        cache.set(nome, valor);
        agendar(nome, valor);
        return;
      }
      try {
        localStorage.setItem(nome, JSON.stringify(valor));
      } catch (err) {
        // Sem espaço: não derruba a ação da tela, só deixa de salvar.
        if (!avisouCota) { avisouCota = true; console.error('Sem espaço pra salvar dados locais:', err); }
      }
    },
    removeItem: (nome) => {
      if (db) {
        cache.delete(nome);
        agendar(nome, undefined);
        return;
      }
      try { localStorage.removeItem(nome); } catch { /* ignora */ }
    },
  };
}
