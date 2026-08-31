// ─────────────────────────────────────────
// api.ts — API própria SmartPrice
// Substitui todas as chamadas ao Supabase
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import os from 'os';
import fs from 'fs';
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

// ── Middleware de autenticação da API ─────
function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

// ── Login administrativo ──────────────────
// As senhas ficam só aqui no servidor (nunca no bundle enviado ao navegador).
// Valores abaixo são só a semente inicial (usados se ainda não houver nada
// salvo em settings.admin_credentials); depois de trocado pelo painel, quem
// vale é o que está no banco.
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

router.post('/admin/login', apiAuth, async (req: Request, res: Response) => {
  try {
    const username = String(req.body?.username || '').toLowerCase();
    const password = String(req.body?.password || '');
    const credentials = await getAdminCredentials();
    if (credentials[username] && password === credentials[username]) {
      return res.json({ success: true });
    }
    res.status(401).json({ success: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Troca usuário/senha do próprio admin logado (exige a senha atual)
router.post('/admin/credentials', apiAuth, async (req: Request, res: Response) => {
  try {
    const currentUsername = String(req.body?.currentUsername || '').toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    const newUsername = String(req.body?.newUsername || '').toLowerCase().trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!newUsername || !newPassword) {
      return res.status(400).json({ error: 'Informe o novo usuário e a nova senha.' });
    }

    const credentials = await getAdminCredentials();
    if (!credentials[currentUsername] || credentials[currentUsername] !== currentPassword) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }
    if (newUsername !== currentUsername && credentials[newUsername]) {
      return res.status(409).json({ error: 'Esse nome de usuário já está em uso.' });
    }

    delete credentials[currentUsername];
    credentials[newUsername] = newPassword;
    await saveAdminCredentials(credentials);

    res.json({ success: true, username: newUsername });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════

// Listar produtos
router.get('/products', async (req: Request, res: Response) => {
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
router.get('/products/count', async (_req: Request, res: Response) => {
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

router.get('/barcode-lookup/:gtin', apiAuth, async (req: Request, res: Response) => {
  const token = process.env.COSMOS_API_TOKEN;
  if (!token) return res.status(501).json({ error: 'COSMOS_API_TOKEN não configurado no servidor' });

  const gtin = req.params.gtin.replace(/\D/g, '');
  if (!gtin) return res.status(400).json({ error: 'Código de barras inválido' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${gtin}.json`, {
      headers: { 'X-Cosmos-Token': token, 'User-Agent': 'SmartPrice (suporte@sistemasmartprice.com.br)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Conta a partir daqui — a Cosmos respondeu (sucesso, 404 ou erro dela),
    // e isso é o que consome a cota diária, não só as buscas com resultado.
    // username/cnpj/bandeira são opcionais (chamada antiga/externa sem eles
    // ainda soma no contador global, só não aparece em "quem mais consultou").
    const qUsername = typeof req.query.username === 'string' ? req.query.username : undefined;
    const qCnpj = typeof req.query.cnpj === 'string' ? req.query.cnpj : undefined;
    const qBandeira = typeof req.query.bandeira === 'string' ? req.query.bandeira : undefined;
    const cosmosUser = qUsername && qCnpj && qBandeira ? { username: qUsername, cnpj: qCnpj, bandeira: qBandeira } : undefined;
    registerCosmosUsage(cosmosUser).catch((err) => console.error('Falha ao registrar uso da Cosmos:', err));

    if (r.status === 404) return res.status(404).json({ error: 'Produto não encontrado na base Cosmos' });
    if (!r.ok) return res.status(r.status).json({ error: `Cosmos retornou HTTP ${r.status}` });

    const json: any = await r.json();
    res.json({
      gtin: json.gtin,
      description: json.description || null,
      brand: json.brand?.name || null,
      // A CDN da Cosmos não manda cabecalho CORS, entao o <img> do preview
      // (que usa crossOrigin="anonymous") nao consegue carregar a URL direto —
      // servimos via nosso proprio proxy em vez de expor a URL externa.
      thumbnail: json.thumbnail ? `/api/barcode-image/${gtin}` : null,
      ncm: json.ncm?.description || null,
    });
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

router.get('/encarte/image-search', apiAuth, async (req: Request, res: Response) => {
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
router.get('/encarte/image-proxy', async (req: Request, res: Response) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  let alvo: URL;
  try {
    alvo = new URL(raw);
  } catch {
    return res.status(400).end();
  }
  if (alvo.protocol !== 'https:' || hostBloqueado(alvo.hostname)) return res.status(400).end();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const r = await fetch(alvo.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'SmartPrice/encarte (+https://sistemasmartprice.com.br)' },
    });
    clearTimeout(timeout);
    if (!r.ok) return res.status(r.status).end();

    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return res.status(415).end();
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
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar produto
router.post('/products', apiAuth, async (req: Request, res: Response) => {
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
router.post('/products/bulk', apiAuth, async (req: Request, res: Response) => {
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
router.put('/products/bulk', apiAuth, async (req: Request, res: Response) => {
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
router.put('/products/:id', apiAuth, async (req: Request, res: Response) => {
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
router.delete('/products/:id', apiAuth, async (req: Request, res: Response) => {
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
router.get('/settings/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM settings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.json({ value: null });
    res.json({ value: result.rows[0].value });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Salvar setting (upsert)
router.post('/settings/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    const result = await pool.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW() RETURNING *`,
      [req.params.id, JSON.stringify(value)]
    );
    if (req.params.id === 'activity_status') {
      io?.to('admin_room').emit('activity:replaced', { value: result.rows[0].value });
    } else if (req.params.id === 'current_layout' || req.params.id === 'users_and_flags') {
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
router.post('/activity/:cnpj', async (req: Request, res: Response) => {
  try {
    const { cnpj } = req.params;
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
router.get('/system/stats', apiAuth, async (_req: Request, res: Response) => {
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

router.get('/tef-status', apiAuth, async (_req: Request, res: Response) => {
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
