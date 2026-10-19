// ─────────────────────────────────────────
// api.ts — API própria SmartPrice
// Substitui todas as chamadas ao Supabase
// ─────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import os from 'os';
import fs from 'fs';
import dns from 'dns/promises';
import net from 'net';
import {
  conferirSenha, ehHashDeSenha, emitirSessao, exigirAdmin, gerarHashDeSenha, limitarTentativas, limparSessao,
  podeMexerNoCnpj, sessaoDaRequisicao, DURACAO_ADMIN_MS, DURACAO_LOJA_MS,
} from './src/lib/sessao';
import {
  acharLoja, exigirPermissao, exigirSessaoValida, invalidarCacheLojas, soDigitos, validarEntradaDaLoja, type LojaCadastro,
} from './src/lib/acessoLojas';
import type { Server } from 'socket.io';
import { minioClient, BUCKET } from './src/gallery';
import { getBrazilDateString } from './src/lib/cosmosUsage';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

export { pool };

// ── Socket.IO: usado para avisar o painel admin em tempo real quando o ──
// status de acesso (login/logout/limpar histórico) muda no backend.
let io: Server | null = null;
export function setSocketServer(server: Server) {
  io = server;
}

// ── Sessão (cookie httpOnly assinado) ─────
// Ver src/lib/sessao.ts. O token fixo que ia no bundle do navegador não abre
// mais nada: só vale pra script rodando dentro da VPS.
const limitarLoginAdmin = limitarTentativas({ nome: 'login-admin', janelaMs: 15 * 60 * 1000, max: 10, maxGeral: 60 });
const limitarLoginLoja = limitarTentativas({ nome: 'login-loja', janelaMs: 15 * 60 * 1000, max: 40 });

router.get('/sessao', (req: Request, res: Response) => {
  const s = sessaoDaRequisicao(req);
  if (!s) return res.status(401).json({ error: 'Sem sessão' });
  res.json({ papel: s.papel, usuario: s.usuario, cnpj: s.cnpj || null });
});

router.post('/sessao/sair', (_req: Request, res: Response) => {
  limparSessao(res);
  res.json({ success: true });
});

// Bandeira do CNPJ, pra preencher o campo na tela de Login (antes a tela
// baixava o cadastro inteiro de lojas sem login nenhum).
router.get('/sessao/loja/bandeira', limitarLoginLoja, async (req: Request, res: Response) => {
  try {
    const loja = await acharLoja(String(req.query.cnpj || ''));
    if (!loja || loja.isSuspended) return res.status(404).json({ bandeira: null });
    res.json({ bandeira: loja.bandeira || null });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar o CNPJ.' });
  }
});

// Login de loja (CNPJ + usuário). As regras que a tela aplicava agora valem
// no servidor também.
router.post('/sessao/loja', limitarLoginLoja, async (req: Request, res: Response) => {
  try {
    const cnpj = soDigitos(req.body?.cnpj);
    const usuario = String(req.body?.username || '').trim().slice(0, 80);
    if (!cnpj || !usuario) return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
    const atual = sessaoDaRequisicao(req);
    // Mesma loja renovando a sessão (F5, cookie vencido): não conta no limite
    // de acessos simultâneos, ela já está ocupando a vaga dela.
    const renovando = atual?.papel === 'loja' && atual.cnpj === cnpj;
    const resultado = renovando
      ? await acharLoja(cnpj).then((loja) =>
          loja && !loja.isSuspended
            ? ({ ok: true as const, loja })
            : ({ ok: false as const, erro: 'Este CNPJ não está autorizado a acessar o sistema.' }),
        )
      : await validarEntradaDaLoja(cnpj);
    if ('erro' in resultado) return res.status(403).json({ error: resultado.erro });
    emitirSessao(req, res, { papel: 'loja', usuario, cnpj }, DURACAO_LOJA_MS);
    res.json({ success: true, bandeira: resultado.loja.bandeira || '' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao acessar o sistema. Tente novamente.' });
  }
});

// ── Login administrativo ──────────────────
// As senhas ficam só no servidor, com hash scrypt. Senha antiga em texto puro
// (de antes do hash) é convertida sozinha no primeiro login certo.
// DEFAULT_ADMIN_CREDENTIALS só vale enquanto não houver nada salvo no banco.
const DEFAULT_ADMIN_CREDENTIALS: Record<string, string> = {
  daylon: process.env.ADMIN_PASSWORD_DAYLON || '8814',
  jh: process.env.ADMIN_PASSWORD_JH || '1993',
};

async function getAdminCredentials(): Promise<Record<string, string>> {
  const result = await pool.query('SELECT value FROM settings WHERE id = $1', ['admin_credentials']);
  const stored = result.rows[0]?.value;
  return stored && Object.keys(stored).length > 0 ? stored : { ...DEFAULT_ADMIN_CREDENTIALS };
}

async function saveAdminCredentials(credentials: Record<string, string>) {
  await pool.query(
    `INSERT INTO settings (id, value, updated_at) VALUES ('admin_credentials', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(credentials)]
  );
}

router.post('/admin/login', limitarLoginAdmin, async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || '').toLowerCase();
    const password = String(req.body?.password || '');
    const credentials = await getAdminCredentials();
    const guardado = Object.prototype.hasOwnProperty.call(credentials, username) ? credentials[username] : undefined;
    if (!conferirSenha(password, guardado)) return res.status(401).json({ success: false });
    if (!ehHashDeSenha(guardado as string)) {
      credentials[username] = gerarHashDeSenha(password);
      await saveAdminCredentials(credentials).catch((err) => console.error('Falha ao gravar hash da senha do admin:', err));
    }
    emitirSessao(req, res, { papel: 'admin', usuario: username }, DURACAO_ADMIN_MS);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao entrar.' });
  }
});

// Troca usuário/senha do próprio admin logado (exige a senha atual)
router.post('/admin/credentials', exigirAdmin, limitarLoginAdmin, async (req: Request, res: Response) => {
  try {
    const currentUsername = String(req.body?.currentUsername || '').toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    const newUsername = String(req.body?.newUsername || '').toLowerCase().trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!newUsername || !newPassword) {
      return res.status(400).json({ error: 'Informe o novo usuário e a nova senha.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
    }

    const credentials = await getAdminCredentials();
    const guardado = Object.prototype.hasOwnProperty.call(credentials, currentUsername) ? credentials[currentUsername] : undefined;
    if (!conferirSenha(currentPassword, guardado)) {
      return res.status(403).json({ error: 'Senha atual incorreta.' });
    }
    if (newUsername !== currentUsername && credentials[newUsername]) {
      return res.status(409).json({ error: 'Esse nome de usuário já está em uso.' });
    }

    delete credentials[currentUsername];
    credentials[newUsername] = gerarHashDeSenha(newPassword);
    await saveAdminCredentials(credentials);
    emitirSessao(req, res, { papel: 'admin', usuario: newUsername }, DURACAO_ADMIN_MS);

    res.json({ success: true, username: newUsername });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao alterar credenciais.' });
  }
});

// ── Settings: o que cada um pode ler/gravar ──
// Antes GET /settings/:id era aberto pra internet inteira — inclusive a
// senha do admin (admin_credentials) e o cadastro de todas as lojas.
const SETTINGS_PUBLICAS = new Set(['current_layout']);
const SETTINGS_PROIBIDAS = new Set(['admin_credentials']);

// Loja só enxerga o que é dela: chaves "mapa por CNPJ" voltam só com a
// entrada da própria loja.
const SETTINGS_POR_CNPJ_LOJA = new Set(['saved_plaquinhas', 'activity_status', 'encarte_historico', 'encarte_rascunho']);

function settingParaLoja(id: string, valor: any, cnpj: string, loja: LojaCadastro | undefined): { ok: true; valor: any } | { ok: false } {
  if (SETTINGS_POR_CNPJ_LOJA.has(id)) {
    const proprio = valor && typeof valor === 'object' ? valor[cnpj] : undefined;
    return { ok: true, valor: proprio === undefined ? {} : { [cnpj]: proprio } };
  }
  if (id === 'users_and_flags') {
    const v = valor || {};
    const lojas = Array.isArray(v.allowedStores) ? v.allowedStores : [];
    return {
      ok: true,
      valor: {
        allowedStores: lojas.filter((s: any) => soDigitos(s?.cnpj) === cnpj),
        flags: v.flags,
        userGroups: v.userGroups,
        announcements: v.announcements,
        seenAnnouncements: v.seenAnnouncements,
        isChatEnabled: v.isChatEnabled,
      },
    };
  }
  if (id === 'encarte_galeria_visibilidade') return { ok: true, valor };
  if (id === `encarte_historico_${cnpj}` || id === `encarte_rascunho_${cnpj}`) return { ok: true, valor };
  if (id === 'cosmos_usage_daily' && loja?.hasProductManagementAccess) return { ok: true, valor };
  return { ok: false };
}

async function autorizarGravacaoSettings(req: Request, res: Response, next: NextFunction) {
  const id = req.params.id;
  if (SETTINGS_PROIBIDAS.has(id)) return res.status(403).json({ error: 'Sem permissão.' });
  const s = req.sessao!;
  if (s.papel === 'admin') {
    if (id === 'users_and_flags') invalidarCacheLojas();
    return next();
  }
  const cnpj = s.cnpj || '';
  const loja = (req as any).loja as LojaCadastro | undefined;

  // Encarte Online da própria loja (lista salva e rascunho)
  if ((id === `encarte_historico_${cnpj}` || id === `encarte_rascunho_${cnpj}`) && loja?.hasEncarteAccess) return next();

  // Plaquinhas salvas: o blob guarda todas as lojas juntas. A loja manda o
  // mapa dela e o servidor troca só a entrada do CNPJ dela, dentro de
  // transação — uma loja não consegue apagar nem ler as das outras.
  if (id === 'saved_plaquinhas') {
    const lista = req.body?.value?.[cnpj];
    if (!Array.isArray(lista)) return res.status(400).json({ error: 'Formato inválido.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const atual = await client.query(`SELECT value FROM settings WHERE id = 'saved_plaquinhas' FOR UPDATE`);
      const tudo = atual.rows[0]?.value && typeof atual.rows[0].value === 'object' ? atual.rows[0].value : {};
      tudo[cnpj] = lista;
      await client.query(
        `INSERT INTO settings (id, value, updated_at) VALUES ('saved_plaquinhas', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(tudo)],
      );
      await client.query('COMMIT');
      return res.json({ value: { [cnpj]: lista } });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      return res.status(500).json({ error: 'Erro ao salvar.' });
    } finally {
      client.release();
    }
  }
  return res.status(403).json({ error: 'Sem permissão.' });
}

// ═══════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════

// Listar produtos
router.get('/products', exigirSessaoValida(), async (req: Request, res: Response) => {
  try {
    const { search, category, limit = 1000, offset = 0 } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: any[] = [];

    if (search && typeof search === 'string') {
      const terms = search.trim().split(/\s+/);
      const conditions = [];
      for (let i = 0; i < terms.length; i++) {
        conditions.push(`(name ILIKE $${params.length + i + 1} OR description ILIKE $${params.length + i + 1} OR category ILIKE $${params.length + i + 1} OR barcode ILIKE $${params.length + i + 1} OR barcode2 ILIKE $${params.length + i + 1})`);
        params.push(`%${terms[i]}%`);
      }
      if (conditions.length > 0) {
        query += ` AND (${conditions.join(' AND ')})`;
      }
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ` ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Contar produtos
router.get('/products/count', exigirSessaoValida(), async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM products');
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// BUSCA DE PRODUTO POR CODIGO DE BARRAS (Cosmos Bluesoft)
// Teste local: ao bipar/digitar o codigo de barras no cadastro de produto,
// busca nome/descricao/foto automaticamente. Token fica so no servidor,
// nunca exposto ao navegador.
// ═══════════════════════════════════════════

// Registra uma consulta real à Cosmos no contador diário (tabela settings,
// chave 'cosmos_usage_daily'). Upsert atomico numa query so — evita
// race condition sem precisar de transacao/lock explicito. O CASE dentro
// do UPDATE reseta o contador (e o byUser) sozinho quando a data muda, sem
// job/cron. `user` é opcional — sem ele a consulta ainda soma no `count`
// global, só não aparece em "quem mais consultou hoje".
async function registerCosmosUsage(user?: { username: string; cnpj: string; bandeira: string }) {
  const today = getBrazilDateString();
  // Chave composta cnpj:username — evita juntar operadores com o mesmo
  // nome em lojas diferentes num único contador.
  const userKey = user ? `${user.cnpj}:${user.username}` : null;
  await pool.query(
    `INSERT INTO settings (id, value, updated_at)
     VALUES (
       'cosmos_usage_daily',
       jsonb_build_object(
         'date', $1::text,
         'count', 1,
         'byUser', CASE WHEN $2::text IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object($2::text, jsonb_build_object('username', $3::text, 'cnpj', $4::text, 'bandeira', $5::text, 'count', 1))
         END
       ),
       NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       value = CASE
         WHEN settings.value->>'date' = $1 THEN
           jsonb_set(
             jsonb_set(settings.value, '{count}', to_jsonb(((settings.value->>'count')::int) + 1)),
             '{byUser}',
             CASE WHEN $2::text IS NULL THEN COALESCE(settings.value->'byUser', '{}'::jsonb)
               ELSE jsonb_set(
                 COALESCE(settings.value->'byUser', '{}'::jsonb),
                 ARRAY[$2::text],
                 jsonb_build_object(
                   'username', $3::text,
                   'cnpj', $4::text,
                   'bandeira', $5::text,
                   'count', COALESCE((settings.value->'byUser'->$2::text->>'count')::int, 0) + 1
                 )
               )
             END
           )
         ELSE
           jsonb_build_object(
             'date', $1::text,
             'count', 1,
             'byUser', CASE WHEN $2::text IS NULL THEN '{}'::jsonb
               ELSE jsonb_build_object($2::text, jsonb_build_object('username', $3::text, 'cnpj', $4::text, 'bandeira', $5::text, 'count', 1))
             END
           )
       END,
       updated_at = NOW()`,
    [today, userKey, user?.username ?? null, user?.cnpj ?? null, user?.bandeira ?? null]
  );
}

// Cache das respostas da Cosmos (tabela própria, criada na primeira busca).
// O plano gratuito só dá 25 consultas/dia — código já consultado sai daqui
// sem gastar cota. "Não encontrado" vale por 30 dias (a Cosmos pode cadastrar
// o produto depois). Falha no cache nunca derruba a busca.
let cosmosCachePronto: Promise<void> | null = null;
function garantirCacheCosmos() {
  cosmosCachePronto ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS cosmos_cache (
         gtin TEXT PRIMARY KEY,
         resposta JSONB,
         encontrado BOOLEAN NOT NULL,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    )
    .then(() => undefined)
    .catch((err) => {
      cosmosCachePronto = null;
      throw err;
    });
  return cosmosCachePronto;
}

async function lerCacheCosmos(gtin: string): Promise<{ encontrado: boolean; resposta: any } | null> {
  try {
    await garantirCacheCosmos();
    const r = await pool.query(
      `SELECT resposta, encontrado FROM cosmos_cache
        WHERE gtin = $1 AND (encontrado OR updated_at > NOW() - INTERVAL '30 days')`,
      [gtin]
    );
    return r.rows[0] ? { encontrado: r.rows[0].encontrado, resposta: r.rows[0].resposta } : null;
  } catch (err) {
    console.error('Falha ao ler cache da Cosmos:', err);
    return null;
  }
}

function gravarCacheCosmos(gtin: string, encontrado: boolean, resposta: any) {
  garantirCacheCosmos()
    .then(() =>
      pool.query(
        `INSERT INTO cosmos_cache (gtin, resposta, encontrado, updated_at) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (gtin) DO UPDATE SET resposta = EXCLUDED.resposta, encontrado = EXCLUDED.encontrado, updated_at = NOW()`,
        [gtin, resposta, encontrado]
      )
    )
    .catch((err) => console.error('Falha ao gravar cache da Cosmos:', err));
}

router.get('/barcode-lookup/:gtin', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  const token = process.env.COSMOS_API_TOKEN;
  if (!token) return res.status(501).json({ error: 'COSMOS_API_TOKEN não configurado no servidor' });

  const gtin = req.params.gtin.replace(/\D/g, '');
  if (!gtin) return res.status(400).json({ error: 'Código de barras inválido' });

  const cache = await lerCacheCosmos(gtin);
  if (cache) {
    if (!cache.encontrado) return res.status(404).json({ error: 'Produto não encontrado na base Cosmos' });
    return res.json(cache.resposta);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${gtin}.json`, {
      headers: { 'X-Cosmos-Token': token, 'User-Agent': 'SmartPrice (suporte@sistemasmartprice.com.br)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // 429 = cota diária da Cosmos esgotada. Não conta no contador (não foi
    // uma consulta de verdade) e explica pro usuário o que fazer.
    if (r.status === 429) {
      return res.status(429).json({
        error: 'Limite diário de consultas da Cosmos atingido. Volta a funcionar à meia-noite — por enquanto, preencha o produto manualmente.',
      });
    }
    if (r.status === 401 || r.status === 403) {
      return res.status(502).json({ error: 'A Cosmos recusou o token do SmartPrice (token inválido ou vencido). Avise o administrador.' });
    }

    // Conta a partir daqui — a Cosmos respondeu (sucesso, 404 ou erro dela),
    // e isso é o que consome a cota diária, não só as buscas com resultado.
    // username/cnpj/bandeira são opcionais (chamada antiga/externa sem eles
    // ainda soma no contador global, só não aparece em "quem mais consultou").
    const qUsername = typeof req.query.username === 'string' ? req.query.username : undefined;
    const qCnpj = typeof req.query.cnpj === 'string' ? req.query.cnpj : undefined;
    const qBandeira = typeof req.query.bandeira === 'string' ? req.query.bandeira : undefined;
    const cosmosUser = qUsername && qCnpj && qBandeira ? { username: qUsername, cnpj: qCnpj, bandeira: qBandeira } : undefined;
    registerCosmosUsage(cosmosUser).catch((err) => console.error('Falha ao registrar uso da Cosmos:', err));

    if (r.status === 404) {
      gravarCacheCosmos(gtin, false, null);
      return res.status(404).json({ error: 'Produto não encontrado na base Cosmos' });
    }
    if (!r.ok) return res.status(r.status).json({ error: `Cosmos retornou HTTP ${r.status}` });

    const json: any = await r.json();
    const resposta = {
      gtin: json.gtin,
      description: json.description || null,
      brand: json.brand?.name || null,
      // A CDN da Cosmos não manda cabecalho CORS, entao o <img> do preview
      // (que usa crossOrigin="anonymous") nao consegue carregar a URL direto —
      // servimos via nosso proprio proxy em vez de expor a URL externa.
      thumbnail: json.thumbnail ? `/api/barcode-image/${gtin}` : null,
      ncm: json.ncm?.description || null,
    };
    gravarCacheCosmos(gtin, true, resposta);
    res.json(resposta);
  } catch (err: any) {
    res.status(502).json({ error: err.message || 'Falha ao consultar a Cosmos' });
  }
});

// Proxy da foto do produto (Cosmos nao manda CORS, <img> nao carrega direto)
router.get('/barcode-image/:gtin', async (req: Request, res: Response) => {
  const gtin = req.params.gtin.replace(/\D/g, '');
  if (!gtin) return res.status(400).end();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`https://cdn-cosmos.bluesoft.com.br/products/${gtin}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) return res.status(r.status).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).end();
  }
});

// ── Encarte Digital: busca de imagem na internet (Google Programmable Search) ──
// Fallback quando o produto não está no catálogo. O CSE é configurado para
// pesquisar só em sites de farmácia, então os resultados são packshots reais.

/** Bloqueia hosts internos/privados para mitigar SSRF no proxy de imagem. */
function hostBloqueado(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  if (h === '::1' || h === '[::1]' || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
  return false;
}

/** IP privado/interno (v4 ou v6) — destino proibido pro proxy. */
function ipInterno(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const h = v.toLowerCase();
  return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
}

/**
 * Baixa a imagem conferindo o destino a cada salto: o nome tem que resolver
 * só pra IP público (senão um domínio apontando pra 127.0.0.1 ou um
 * redirecionamento levava o servidor a acessar a rede interna — SSRF).
 */
async function buscarImagemExterna(inicial: URL): Promise<globalThis.Response | null> {
  let atual = inicial;
  for (let salto = 0; salto < 4; salto++) {
    if (atual.protocol !== 'https:' || hostBloqueado(atual.hostname)) return null;
    const host = atual.hostname.replace(/^\[|\]$/g, '');
    const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((x) => x.address);
    if (!ips.length || ips.some(ipInterno)) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(atual.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'SmartPrice/encarte (+https://sistemasmartprice.com.br)' },
      });
      if (r.status >= 300 && r.status < 400) {
        const destino = r.headers.get('location');
        if (!destino) return null;
        atual = new URL(destino, atual);
        continue;
      }
      return r;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

router.get('/encarte/image-search', exigirSessaoValida(), exigirPermissao('hasEncarteAccess'), async (req: Request, res: Response) => {
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return res.status(501).json({ error: 'GOOGLE_CSE_KEY / GOOGLE_CSE_ID não configurados no servidor' });

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: 'Informe o termo de busca (q)' });
  const num = Math.min(Math.max(parseInt(String(req.query.limit || '6'), 10) || 6, 1), 10);

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', key);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', q);
    url.searchParams.set('searchType', 'image');
    url.searchParams.set('num', String(num));
    url.searchParams.set('safe', 'active');
    url.searchParams.set('imgType', 'photo');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err0 = json?.error?.errors?.[0] || {};
      const msg = json?.error?.message || `Google retornou HTTP ${r.status}`;
      // 4xx (não 5xx) pra o Cloudflare não trocar o corpo pela página "error code: 502"
      // e a mensagem real do Google chegar na tela.
      const status = r.status === 429 || err0.reason === 'dailyLimitExceeded' ? 429 : 422;
      return res.status(status).json({
        error: msg,
        motivo: err0.reason || json?.error?.status || null,
        ajuda: err0.extendedHelp || null, // link do Google com ?project=<id do projeto da chave>
        googleStatus: r.status,
      });
    }

    const itens = (json.items || []).map((it: any) => ({
      title: it.title || '',
      source: it.displayLink || it.image?.contextLink || '',
      largura: it.image?.width || null,
      altura: it.image?.height || null,
      // servidas via nosso proxy pra não sujar o canvas na exportação
      url: `/api/encarte/image-proxy?url=${encodeURIComponent(it.link)}`,
      thumb: it.image?.thumbnailLink
        ? `/api/encarte/image-proxy?url=${encodeURIComponent(it.image.thumbnailLink)}`
        : `/api/encarte/image-proxy?url=${encodeURIComponent(it.link)}`,
    }));

    res.json({ q, itens });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || 'Falha ao buscar imagens' });
  }
});

// Proxy de imagem externa — <img crossOrigin=anonymous> só carrega same-origin
// sem sujar o canvas; por isso a imagem escolhida passa por aqui.
router.get('/encarte/image-proxy', exigirSessaoValida(), async (req: Request, res: Response) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  let alvo: URL;
  try {
    alvo = new URL(raw);
  } catch {
    return res.status(400).end();
  }
  if (alvo.protocol !== 'https:' || hostBloqueado(alvo.hostname)) return res.status(400).end();

  try {
    const r = await buscarImagemExterna(alvo);
    if (!r) return res.status(400).end();
    if (!r.ok) return res.status(r.status).end();

    const ct = r.headers.get('content-type') || '';
    // SVG pode carregar script — servido pelo nosso domínio vira XSS.
    if (!ct.startsWith('image/') || ct.includes('svg')) return res.status(415).end();
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return res.status(413).end();

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    res.status(502).end();
  }
});

// Buscar produto por ID
router.get('/products/:id', exigirSessaoValida(), async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar produto
router.post('/products', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  try {
    const { name, description, price, image, thumb_image, category, subtitle, barcode, barcode2 } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const result = await pool.query(
      `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [name, description || '', subtitle || '', price || 'R$ 0,00', image || null, thumb_image || null, category || '', barcode || null, barcode2 || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar vários produtos (bulk)
router.post('/products/bulk', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'Formato inválido' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = [];
      for (const p of products) {
        const result = await client.query(
          `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
          [p.name || 'Sem nome', p.description || '', p.subtitle || '', p.price || 'R$ 0,00', p.image || null, p.thumb_image || null, p.category || '', p.barcode || null, p.barcode2 || null]
        );
        inserted.push(result.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ data: inserted, count: inserted.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar varios produtos de uma vez, por id (usado pelo import de
// planilha) — precisa vir ANTES de PUT /products/:id, senao o Express
// tentaria casar "/products/bulk" com a rota :id.
router.put('/products/bulk', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Formato inválido' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updatedCount = 0;
      const skippedIds: (string | number)[] = [];
      for (const p of updates) {
        if (p.id === undefined || p.id === null) continue;
        const result = await client.query(
          `UPDATE products SET name=$1, description=$2, price=$3, category=$4, barcode=$5, barcode2=$6
           WHERE id=$7`,
          [p.name || '', p.description || '', p.price || 'R$ 0,00', p.category || '', p.barcode || null, p.barcode2 || null, p.id]
        );
        if (result.rowCount && result.rowCount > 0) updatedCount++;
        else skippedIds.push(p.id);
      }
      await client.query('COMMIT');
      res.json({ updatedCount, skippedIds });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar produto
router.put('/products/:id', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  try {
    const { name, description, subtitle, price, image, thumb_image, category, barcode, barcode2 } = req.body;
    const result = await pool.query(
      `UPDATE products SET name=$1, description=$2, subtitle=$3, price=$4, image=$5, thumb_image=$6, category=$7, barcode=$8, barcode2=$9
       WHERE id=$10 RETURNING *`,
      [name, description || '', subtitle || '', price || 'R$ 0,00', image || null, thumb_image || null, category || '', barcode || null, barcode2 || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar produto
router.delete('/products/:id', exigirSessaoValida(), exigirPermissao('hasProductManagementAccess'), async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

// Buscar setting por ID
router.get('/settings/:id', async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
  if (SETTINGS_PROIBIDAS.has(id)) return res.status(403).json({ error: 'Sem permissão.' });
  if (SETTINGS_PUBLICAS.has(id)) return next();
  exigirSessaoValida()(req, res, next);
}, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const result = await pool.query('SELECT * FROM settings WHERE id = $1', [id]);
    const valor = result.rows.length === 0 ? null : result.rows[0].value;
    if (req.sessao?.papel === 'loja') {
      const filtrado = settingParaLoja(id, valor, req.sessao.cnpj || '', (req as any).loja);
      if (!filtrado.ok) return res.status(403).json({ error: 'Sem permissão.' });
      return res.json({ value: valor === null ? null : filtrado.valor });
    }
    res.json({ value: valor });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao ler configuração.' });
  }
});

// Encartes salvos (aba Encartes do Encarte Online) — `encarte_historico_<chave>`.
// A lista inteira é regravada a cada Salvar/renomear/apagar, então um
// navegador com a lista errada (leitura que falhou, cópia velha) apagava os
// encartes dos outros — já aconteceu. Regra: um encarte SÓ sai da lista se o
// pedido disser explicitamente que é pra apagar (`removidos: [ids]`); senão
// é 409 e nada é gravado. O que é apagado de propósito vai pra
// `encarte_historico_lixeira` (últimos 200), pra dar pra desfazer.
const ehListaEncartes = (id: string) => id.startsWith('encarte_historico_') && !id.includes('__') && id !== 'encarte_historico_lixeira';

router.post('/settings/:id', exigirSessaoValida(), autorizarGravacaoSettings, async (req: Request, res: Response, next) => {
  if (!ehListaEncartes(req.params.id)) return next();
  const { value, removidos } = req.body as { value: unknown; removidos?: unknown };
  if (!Array.isArray(value)) return res.status(400).json({ error: 'Lista de encartes inválida.' });
  const podeRemover = new Set(Array.isArray(removidos) ? removidos.map(String) : []);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query('SELECT value FROM settings WHERE id = $1 FOR UPDATE', [req.params.id]);
    const antes: any[] = Array.isArray(atual.rows[0]?.value) ? atual.rows[0].value : [];
    const idsNovos = new Set(value.map((e: any) => String(e?.id)));
    const sumiriam = antes.filter((e) => !idsNovos.has(String(e?.id)) && !podeRemover.has(String(e?.id)));
    if (sumiriam.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Gravação recusada: ${sumiriam.length} encarte(s) salvo(s) sumiriam da lista. Recarregue a página e tente de novo.`,
      });
    }
    const apagados = antes.filter((e) => podeRemover.has(String(e?.id)) && !idsNovos.has(String(e?.id)));
    if (apagados.length) {
      const lix = await client.query(`SELECT value FROM settings WHERE id = 'encarte_historico_lixeira' FOR UPDATE`);
      const lixeira: any[] = Array.isArray(lix.rows[0]?.value) ? lix.rows[0].value : [];
      const agora = new Date().toISOString();
      const nova = [...apagados.map((e) => ({ ...e, lista: req.params.id, removidoEm: agora })), ...lixeira].slice(0, 200);
      await client.query(
        `INSERT INTO settings (id, value, updated_at) VALUES ('encarte_historico_lixeira', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(nova)],
      );
    }
    const result = await client.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *`,
      [req.params.id, JSON.stringify(value)],
    );
    await client.query('COMMIT');
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Salvar setting (upsert)
router.post('/settings/:id', async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const result = await pool.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *`,
      [req.params.id, JSON.stringify(value)]
    );
    if (req.params.id === 'activity_status') {
      io?.to('admin_room').emit('activity:replaced', { value: result.rows[0].value });
    } else if (req.params.id === 'current_layout' || req.params.id === 'users_and_flags' || req.params.id === 'financeiro') {
      io?.emit('settings:updated', { id: req.params.id });
    }
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// ACTIVITY STATUS
// ═══════════════════════════════════════════

// Atualizar status online
router.post('/activity/:cnpj', exigirSessaoValida(), async (req: Request, res: Response) => {
  try {
    const cnpj = soDigitos(req.params.cnpj);
    if (!podeMexerNoCnpj(req.sessao, cnpj)) return res.status(403).json({ error: 'Sem permissão.' });
    const { isOnline, lastUsername } = req.body;

    const current = await pool.query('SELECT value FROM settings WHERE id = $1', ['activity_status']);
    const activity = current.rows[0]?.value || {};

    activity[cnpj] = {
      isOnline,
      lastAccess: new Date().toISOString(),
      lastUsername
    };

    await pool.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ('activity_status', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(activity)]
    );

    io?.to('admin_room').emit('activity:update', { cnpj, ...activity[cnpj] });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════
router.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// ═══════════════════════════════════════════
// SYSTEM STATS (disco, memória, CPU, galeria)
// ═══════════════════════════════════════════
router.get('/system/stats', exigirAdmin, async (_req: Request, res: Response) => {
  // Galeria (MinIO): soma o tamanho de todos os objetos do bucket
  const galleryStats = await new Promise<{ usedBytes: number; fileCount: number }>((resolve) => {
    let usedBytes = 0;
    let fileCount = 0;
    try {
      const stream = minioClient.listObjectsV2(BUCKET, '', true);
      stream.on('data', (obj: any) => {
        if (obj.size) {
          usedBytes += obj.size;
          fileCount += 1;
        }
      });
      stream.on('end', () => resolve({ usedBytes, fileCount }));
      stream.on('error', () => resolve({ usedBytes: 0, fileCount: 0 }));
    } catch {
      resolve({ usedBytes: 0, fileCount: 0 });
    }
  });

  // Disco (do host/container onde o servidor roda)
  let disk = { totalBytes: 0, usedBytes: 0, freeBytes: 0, available: false };
  try {
    const stat = await fs.promises.statfs(process.cwd());
    const totalBytes = stat.bsize * stat.blocks;
    const freeBytes = stat.bsize * stat.bfree;
    disk = { totalBytes, usedBytes: totalBytes - freeBytes, freeBytes, available: true };
  } catch {
    // statfs indisponível nesta plataforma (ex: alguns ambientes Windows)
  }

  // Memória
  const memTotalBytes = os.totalmem();
  const memFreeBytes = os.freemem();

  // CPU (média de carga relativa ao número de núcleos; só é significativa em Linux)
  const cpuCount = os.cpus().length || 1;
  const load1min = os.loadavg()[0];
  const cpuLoadPercent = Math.min(100, (load1min / cpuCount) * 100);

  res.json({
    gallery: galleryStats,
    disk,
    memory: {
      totalBytes: memTotalBytes,
      usedBytes: memTotalBytes - memFreeBytes,
      freeBytes: memFreeBytes,
    },
    cpu: {
      cores: cpuCount,
      loadPercent: cpuLoadPercent,
    },
  });
});

// ═══════════════════════════════════════════
// STATUS DAS OPERADORAS DE CARTÃO/TEF (Cielo, Rede)
// Consulta as páginas de status oficiais (StatusPage.io) — não usa
// Downdetector porque o site está atrás de proteção anti-bot da Cloudflare
// e bloqueia requisições de servidor.
// ═══════════════════════════════════════════
const TEF_PROVIDERS: Record<string, { label: string; baseUrl: string }> = {
  cielo: { label: 'Cielo', baseUrl: 'https://cielo.statuspage.io' },
  rede: { label: 'Rede', baseUrl: 'https://rede.statuspage.io' },
  bradesco: { label: 'Bradesco', baseUrl: 'https://bradesco.statuspage.io' },
};
const TEF_HISTORY_DAYS = 30;

let tefStatusCache: { data: any; fetchedAt: number } | null = null;
const TEF_CACHE_MS = 60 * 1000;

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Monta uma tira de N dias (hoje - N+1 até hoje), marcando quais tiveram
// algum incidente iniciado naquele dia — mesma ideia da "barra de uptime"
// que sites de status (GitHub, Stripe etc.) costumam mostrar.
function buildDayHistory(incidents: any[], days: number): { date: string; hasIncident: boolean }[] {
  const incidentDays = new Set(
    (incidents || []).map((i) => (i.started_at || i.created_at || '').slice(0, 10))
  );
  const result: { date: string; hasIncident: boolean }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, hasIncident: incidentDays.has(dateStr) });
  }
  return result;
}

router.get('/tef-status', exigirAdmin, async (_req: Request, res: Response) => {
  if (tefStatusCache && Date.now() - tefStatusCache.fetchedAt < TEF_CACHE_MS) {
    return res.json(tefStatusCache.data);
  }
  const results = await Promise.all(
    Object.entries(TEF_PROVIDERS).map(async ([key, { label, baseUrl }]) => {
      try {
        const [statusJson, incidentsJson] = await Promise.all([
          fetchJson(`${baseUrl}/api/v2/status.json`),
          fetchJson(`${baseUrl}/api/v2/incidents.json`).catch(() => ({ incidents: [] })),
        ]);
        return [key, {
          ok: true,
          label,
          indicator: statusJson?.status?.indicator || 'unknown',
          description: statusJson?.status?.description || 'Sem informação',
          updatedAt: statusJson?.page?.updated_at || null,
          days: buildDayHistory(incidentsJson?.incidents || [], TEF_HISTORY_DAYS),
        }];
      } catch (err: any) {
        return [key, { ok: false, label, indicator: 'unknown', description: 'Não foi possível consultar', error: err.message, days: [] }];
      }
    })
  );
  const data = { checkedAt: new Date().toISOString(), providers: Object.fromEntries(results) };
  tefStatusCache = { data, fetchedAt: Date.now() };
  res.json(data);
});

export default router;
