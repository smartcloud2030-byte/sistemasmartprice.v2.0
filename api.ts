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

export default router;
