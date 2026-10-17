// ─────────────────────────────────────────
// sessao.ts — sessão de verdade emitida pelo servidor
// Substitui o token fixo que ia no bundle do navegador (qualquer um que
// abrisse o site conseguia ler e usar). Agora o login (loja ou admin) devolve
// um cookie httpOnly assinado com HMAC; o JavaScript da página não enxerga o
// cookie e não dá pra forjar sem o segredo do servidor.
//
// O token fixo (API_SECRET / GALLERY_PASSWORD) continua valendo só para os
// scripts que rodam na própria VPS (backup.sh, cleanup-chat-images.sh), que
// chamam http://localhost:3000 direto — pedido que passou pelo nginx /
// Cloudflare (tem X-Forwarded-For etc.) não pode usar o token.
// ─────────────────────────────────────────
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export type Papel = 'admin' | 'loja';

export interface Sessao {
  papel: Papel;
  usuario: string;
  /** só dígitos; só existe para loja */
  cnpj?: string;
  /** expiração (ms desde epoch) */
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessao?: Sessao;
    }
  }
}

const COOKIE = 'sp_sessao';
export const DURACAO_ADMIN_MS = 12 * 60 * 60 * 1000;
export const DURACAO_LOJA_MS = 30 * 24 * 60 * 60 * 1000;

// SESSION_SECRET no .env é o ideal. Sem ele, deriva de segredos que o
// servidor já tem (nunca vão pro navegador) — assim o deploy não depende de
// mexer no .env. Em último caso (dev sem nada configurado), um segredo
// aleatório por processo: as sessões só caem quando o servidor reinicia.
let segredoCache: Buffer | null = null;
function segredo(): Buffer {
  if (segredoCache) return segredoCache;
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= 16) {
    segredoCache = Buffer.from(env);
  } else {
    const base = [process.env.API_SECRET, process.env.DB_PASSWORD, process.env.MINIO_SECRET_KEY, process.env.ASAAS_API_KEY]
      .filter(Boolean)
      .join('|');
    segredoCache = base
      ? crypto.createHmac('sha256', 'smartprice-sessao-v1').update(base).digest()
      : crypto.randomBytes(32);
  }
  return segredoCache;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function assinar(dados: string): string {
  return crypto.createHmac('sha256', segredo()).update(dados).digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function codificarSessao(s: Sessao): string {
  const corpo = b64(JSON.stringify(s));
  return `${corpo}.${assinar(corpo)}`;
}

export function decodificarSessao(valor: string | undefined | null): Sessao | null {
  if (!valor) return null;
  const [corpo, assinatura] = valor.split('.');
  if (!corpo || !assinatura || !iguais(assinatura, assinar(corpo))) return null;
  try {
    const s = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as Sessao;
    if (!s || (s.papel !== 'admin' && s.papel !== 'loja') || typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function lerCookie(header: string | undefined, nome = COOKIE): string | null {
  if (!header) return null;
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export function sessaoDaRequisicao(req: Request): Sessao | null {
  return decodificarSessao(lerCookie(req.headers.cookie));
}

// Secure (só HTTPS) sempre, menos acessando pelo próprio computador em
// http://localhost (teste local) — lá o navegador recusaria o cookie.
function cookieSeguro(req: Request): boolean {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  return !(host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
}

export function emitirSessao(req: Request, res: Response, dados: Omit<Sessao, 'exp'>, duracaoMs: number): Sessao {
  const sessao: Sessao = { ...dados, exp: Date.now() + duracaoMs };
  const partes = [
    `${COOKIE}=${encodeURIComponent(codificarSessao(sessao))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(duracaoMs / 1000)}`,
  ];
  if (cookieSeguro(req)) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
  return sessao;
}

export function limparSessao(res: Response) {
  const partes = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  res.append('Set-Cookie', partes.join('; '));
}

/** Pedido feito de dentro da VPS (script local), não pela internet. */
export function ehRequisicaoInterna(req: Request): boolean {
  if (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'] || req.headers['forwarded']) {
    return false;
  }
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip);
}

/** Token de servidor (scripts da VPS). Só vale em pedido interno. */
export function tokenDeServidorValido(req: Request, cabecalho: string, esperado: string | undefined): boolean {
  if (!esperado || !ehRequisicaoInterna(req)) return false;
  const recebido = req.headers[cabecalho];
  return typeof recebido === 'string' && iguais(recebido, esperado);
}

/** IP real do visitante (atrás de Cloudflare/nginx). */
export function ipDoCliente(req: Request): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  // Último da lista = o que o nosso proxy acrescentou; o primeiro quem
  // escolhe é o próprio cliente (dava pra burlar o limite de tentativas).
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',').pop()!.trim();
  return req.socket.remoteAddress || 'desconhecido';
}

/**
 * Exige sessão. Sem papéis = qualquer sessão (loja ou admin).
 * Script da VPS com x-api-token correto passa como admin.
 */
export function exigirSessao(...papeis: Papel[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (tokenDeServidorValido(req, 'x-api-token', process.env.API_SECRET)) {
      req.sessao = { papel: 'admin', usuario: 'servidor', exp: Date.now() + 60_000 };
      return next();
    }
    const sessao = sessaoDaRequisicao(req);
    if (!sessao) return res.status(401).json({ error: 'Sessão expirada. Entre de novo.' });
    if (papeis.length && !papeis.includes(sessao.papel)) return res.status(403).json({ error: 'Sem permissão.' });
    req.sessao = sessao;
    next();
  };
}

export const exigirAdmin = exigirSessao('admin');

/** Loja só mexe no próprio CNPJ; admin mexe em qualquer um. */
export function podeMexerNoCnpj(sessao: Sessao | undefined, cnpj: string): boolean {
  if (!sessao) return false;
  if (sessao.papel === 'admin') return true;
  const alvo = String(cnpj || '').replace(/\D/g, '');
  return !!alvo && sessao.cnpj === alvo;
}

// ── Limite de tentativas (força bruta) ────
// Em memória, por IP. Simples de propósito: um processo só, sem Redis.
/**
 * Limite por IP e, com `maxGeral`, também um teto somando todos os IPs —
 * IP dá pra falsificar em cabeçalho; o teto geral não.
 */
export function limitarTentativas(opcoes: { janelaMs: number; max: number; nome: string; maxGeral?: number }) {
  const contagem = new Map<string, { n: number; ate: number }>();
  setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of contagem) if (v.ate < agora) contagem.delete(k);
  }, Math.min(opcoes.janelaMs, 10 * 60 * 1000)).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const agora = Date.now();
    if (opcoes.maxGeral) {
      const g = contagem.get(`${opcoes.nome}:*`);
      if (!g || g.ate < agora) contagem.set(`${opcoes.nome}:*`, { n: 1, ate: agora + opcoes.janelaMs });
      else if (++g.n > opcoes.maxGeral) {
        res.setHeader('Retry-After', String(Math.ceil((g.ate - agora) / 1000)));
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
      }
    }
    const chave = `${opcoes.nome}:${ipDoCliente(req)}`;
    const atual = contagem.get(chave);
    if (!atual || atual.ate < agora) {
      contagem.set(chave, { n: 1, ate: agora + opcoes.janelaMs });
      return next();
    }
    atual.n += 1;
    if (atual.n > opcoes.max) {
      res.setHeader('Retry-After', String(Math.ceil((atual.ate - agora) / 1000)));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
    }
    next();
  };
}

// ── Senha com hash (scrypt, sem dependência nativa) ──
const PREFIXO_HASH = 'scrypt$';

export function ehHashDeSenha(valor: string): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO_HASH);
}

export function gerarHashDeSenha(senha: string): string {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, sal, 64);
  return `${PREFIXO_HASH}${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

/** Confere senha contra hash scrypt ou (legado) texto puro. */
export function conferirSenha(senha: string, guardado: string | undefined): boolean {
  if (!guardado || !senha) return false;
  if (!ehHashDeSenha(guardado)) return iguais(senha, guardado);
  const [, salB64, hashB64] = guardado.split('$');
  if (!salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64url');
  const calculado = crypto.scryptSync(senha, Buffer.from(salB64, 'base64url'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}
