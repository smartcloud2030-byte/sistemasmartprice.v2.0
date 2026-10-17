// ─────────────────────────────────────────
// acessoLojas.ts — regras de acesso da loja conferidas NO SERVIDOR
// Antes, suspensão, limite de acessos e permissões (Encarte, Produtos) só
// existiam na tela: quem chamasse a API direto passava por cima. Aqui o
// servidor lê o cadastro (settings.users_and_flags) e decide.
// ─────────────────────────────────────────
import { Pool } from 'pg';
import type { Request, Response, NextFunction } from 'express';
import { exigirSessao, limparSessao, type Papel, type Sessao } from './sessao';

let pool: Pool | null = null;
function db(): Pool {
  pool ??= new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'smartprice',
    user: process.env.DB_USER || 'smartprice',
    password: process.env.DB_PASSWORD || '',
    max: 3,
  });
  return pool;
}

export const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export interface LojaCadastro {
  cnpj: string;
  bandeira?: string;
  isSuspended?: boolean;
  hasEncarteAccess?: boolean;
  hasProductManagementAccess?: boolean;
  [k: string]: unknown;
}

// Cache curto: toda requisição da loja confere o cadastro, não dá pra ir no
// banco a cada uma. Gravar users_and_flags invalida na hora.
let cache: { em: number; valor: any } | null = null;
const CACHE_MS = 10_000;

export function invalidarCacheLojas() {
  cache = null;
}

export async function lerUsersAndFlags(): Promise<any> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.valor;
  const r = await db().query(`SELECT value FROM settings WHERE id = 'users_and_flags'`);
  const valor = r.rows[0]?.value || {};
  cache = { em: Date.now(), valor };
  return valor;
}

export async function acharLoja(cnpj: string): Promise<LojaCadastro | null> {
  const alvo = soDigitos(cnpj);
  if (!alvo) return null;
  const dados = await lerUsersAndFlags();
  const lojas: LojaCadastro[] = Array.isArray(dados?.allowedStores) ? dados.allowedStores : [];
  return lojas.find((s) => soDigitos(s.cnpj) === alvo) || null;
}

// Mesma regra de `isStoreOnline` do front (src/lib/utils.ts): online e com
// sinal de vida nos últimos 10 min.
const ONLINE_STALE_MS = 10 * 60 * 1000;
function estaOnline(a: any): boolean {
  return !!a?.isOnline && !!a?.lastAccess && Date.now() - new Date(a.lastAccess).getTime() < ONLINE_STALE_MS;
}

/**
 * Pode abrir sessão de loja? Mesmas regras que a tela de Login aplicava
 * (CNPJ autorizado, não suspenso, limite global e por CNPJ).
 */
export async function validarEntradaDaLoja(cnpj: string): Promise<{ ok: true; loja: LojaCadastro } | { ok: false; erro: string }> {
  const alvo = soDigitos(cnpj);
  const dados = await lerUsersAndFlags();
  const lojas: LojaCadastro[] = Array.isArray(dados?.allowedStores) ? dados.allowedStores : [];
  const loja = lojas.find((s) => soDigitos(s.cnpj) === alvo);
  if (!loja) return { ok: false, erro: 'Este CNPJ não está autorizado a acessar o sistema.' };
  if (loja.isSuspended) return { ok: false, erro: 'Este CNPJ está suspenso e não pode acessar o sistema.' };

  const r = await db().query(`SELECT value FROM settings WHERE id = 'activity_status'`);
  const atividade = r.rows[0]?.value || {};
  const jaOnline = estaOnline(atividade[alvo]);

  const max = dados?.maxConcurrentStores;
  if (!jaOnline && typeof max === 'number') {
    const online = lojas.filter((s) => estaOnline(atividade[soDigitos(s.cnpj)])).length;
    if (online >= max) {
      return { ok: false, erro: `Limite de ${max} acesso(s) simultâneo(s) do sistema atingido. Tente novamente mais tarde.` };
    }
  }

  const limite = dados?.cnpjUserLimits?.[alvo];
  if (typeof limite === 'number' && (jaOnline ? 1 : 0) >= limite) {
    return {
      ok: false,
      erro:
        limite === 0
          ? 'Este CNPJ está bloqueado para acesso pelo administrador.'
          : `Este CNPJ já está em uso em outro dispositivo. Limite de ${limite} acesso(s) simultâneo(s) atingido.`,
    };
  }
  return { ok: true, loja };
}

/**
 * Sessão válida + (se for loja) cadastro ainda ativo. Loja apagada ou
 * suspensa perde o acesso na hora, mesmo com cookie dentro da validade.
 */
export function exigirSessaoValida(...papeis: Papel[]) {
  const base = exigirSessao(...papeis);
  return (req: Request, res: Response, next: NextFunction) => {
    base(req, res, async (err?: unknown) => {
      if (err) return next(err);
      const s = req.sessao as Sessao;
      if (s.papel !== 'loja') return next();
      try {
        const loja = await acharLoja(s.cnpj || '');
        if (!loja || loja.isSuspended) {
          limparSessao(res);
          return res.status(401).json({ error: 'Acesso desta loja foi encerrado.' });
        }
        (req as any).loja = loja;
        next();
      } catch (e) {
        next(e);
      }
    });
  };
}

/** Admin sempre passa; loja só com a permissão ligada no cadastro. */
export function exigirPermissao(flag: 'hasEncarteAccess' | 'hasProductManagementAccess') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.sessao?.papel === 'admin') return next();
    const loja = (req as any).loja as LojaCadastro | undefined;
    if (loja?.[flag]) return next();
    res.status(403).json({ error: 'Sua loja não tem acesso a esse recurso.' });
  };
}
