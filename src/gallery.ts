// ─────────────────────────────────────────
// gallery.ts v2.1 — Galeria com Categorias
// Fix: nome original + preview de imagem
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import sharp from 'sharp';
import * as Minio from 'minio';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import { Pool } from 'pg';
import { isAlreadyCutOut } from './backgroundDetect';
import { composeDuplicate } from './duplicateComposite';
const execAsync = promisify(exec);

const router = Router();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

// Pool próprio (não importado de api.ts para evitar import circular — api.ts
// já importa minioClient/BUCKET daqui). Aponta pro mesmo Postgres.
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

// Usado tanto ao criar quanto ao renomear categoria/pasta — mantém letras
// (inclusive acentuadas) e números, só remove caracteres realmente inválidos.
function sanitizeCategoryName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

export { minioClient };
const BUCKET = process.env.MINIO_BUCKET || 'smartprice-images';
export { BUCKET };
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://imagens.sistemasmartprice.com.br';
const GALLERY_PASSWORD = process.env.GALLERY_PASSWORD || 'smartprice@admin2026';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

function authGallery(req: Request, res: Response, next: Function) {
  const token = req.headers['x-gallery-token'] || req.query.token;
  if (token === GALLERY_PASSWORD) return next();
  res.status(401).json({ error: 'Acesso negado' });
}

function sanitizeName(original: string): string {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 80);
  const hash = crypto.randomBytes(4).toString('hex');
  return `${base}-${hash}${ext}`;
}

function displayName(filename: string): string {
  const ext = path.extname(filename);
  return filename
    .replace(ext, '')
    .replace(/-[a-f0-9]{8}$/, '')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Pastas internas do sistema — escondidas dos seletores de categoria, mas
// ainda visíveis na SmartGaleria com ?all=1 (ex: chat, pra poder gerenciar as fotos)
const INTERNAL_CATEGORIES = new Set(['chat']);
// Pastas técnicas puras (cache de miniaturas etc.) — nunca aparecem em lugar nenhum,
// nem mesmo com ?all=1, pois não são conteúdo real, só arquivos derivados.
const isAlwaysHiddenCategory = (name: string) => name.startsWith('_');

// ── Listar categorias ─────────────────────
// Por padrão, esconde pastas internas (ex: chat) — usado pelos seletores de
// categoria ao cadastrar/editar produtos. Passe ?all=1 para ver todas,
// usado pela SmartGaleria (tela de administração de imagens).
router.get('/categories', authGallery, async (req: Request, res: Response) => {
  const showAll = req.query.all === '1';
  try {
    const categories = new Set<string>();
    const stream = minioClient.listObjectsV2(BUCKET, '', true);
    stream.on('data', (obj) => {
      if (obj.name && obj.name.includes('/')) categories.add(obj.name.split('/')[0]);
    });
    stream.on('end', () => {
      const withoutTechnical = [...categories].filter((c) => !isAlwaysHiddenCategory(c));
      const list = showAll ? withoutTechnical : withoutTechnical.filter((c) => !INTERNAL_CATEGORIES.has(c));
      res.json(list.sort());
    });
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Criar categoria ───────────────────────
router.post('/categories', authGallery, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const safeName = sanitizeCategoryName(name);
  if (!safeName) return res.status(400).json({ error: 'Nome inválido' });
  try {
    await minioClient.putObject(BUCKET, `${safeName}/.keep`, Buffer.from(''), 0);
    res.json({ name: safeName, created: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Deletar categoria ─────────────────────
router.delete('/categories/:name', authGallery, async (req: Request, res: Response) => {
  const category = req.params.name;
  try {
    const objects: string[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, `${category}/`, true);
    stream.on('data', (obj) => { if (obj.name) objects.push(obj.name); });
    stream.on('end', async () => {
      for (const obj of objects) await minioClient.removeObject(BUCKET, obj);
      res.json({ success: true });
    });
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Renomear categoria/pasta ──────────────
// Move todos os objetos de uma pasta para outra (ex: corrigir a ortografia de
// pastas antigas criadas antes de permitirmos acento) e atualiza as URLs já
// salvas em products e settings (onde ficam os layouts), pra nenhuma imagem
// ficar órfã.
router.post('/categories/:name/rename', authGallery, async (req: Request, res: Response) => {
  const oldName = req.params.name;
  const newName = sanitizeCategoryName(req.body?.newName || '');
  if (!newName) return res.status(400).json({ error: 'Novo nome inválido' });
  if (newName === oldName) return res.json({ success: true, oldName, newName, movedCount: 0 });

  try {
    const destinationTaken = await new Promise<boolean>((resolve, reject) => {
      let found = false;
      const stream = minioClient.listObjectsV2(BUCKET, `${newName}/`, true);
      stream.on('data', () => { found = true; });
      stream.on('end', () => resolve(found));
      stream.on('error', reject);
    });
    if (destinationTaken) return res.status(409).json({ error: 'Já existe uma pasta com esse nome' });

    const objects: string[] = await new Promise((resolve, reject) => {
      const list: string[] = [];
      const stream = minioClient.listObjectsV2(BUCKET, `${oldName}/`, true);
      stream.on('data', (obj) => { if (obj.name) list.push(obj.name); });
      stream.on('end', () => resolve(list));
      stream.on('error', reject);
    });
    if (objects.length === 0) return res.status(404).json({ error: 'Pasta não encontrada ou vazia' });

    // Copia tudo pro novo prefixo antes de apagar o antigo, pra não perder
    // nada se algo falhar no meio do caminho.
    for (const objName of objects) {
      const rest = objName.slice(oldName.length + 1);
      const stat = await minioClient.statObject(BUCKET, objName);
      const stream = await minioClient.getObject(BUCKET, objName);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);
      await minioClient.putObject(BUCKET, `${newName}/${rest}`, buffer, buffer.length, {
        'Content-Type': stat.metaData?.['content-type'] || 'application/octet-stream',
      });
    }
    for (const objName of objects) await minioClient.removeObject(BUCKET, objName);

    // Atualiza referências já salvas (imagens de produtos + background dos layouts)
    const oldPrefix = `/${BUCKET}/${oldName}/`;
    const newPrefix = `/${BUCKET}/${newName}/`;
    await pool.query(`UPDATE products SET image = replace(image, $1, $2) WHERE image LIKE '%' || $1 || '%'`, [oldPrefix, newPrefix]);
    await pool.query(`UPDATE products SET thumb_image = replace(thumb_image, $1, $2) WHERE thumb_image LIKE '%' || $1 || '%'`, [oldPrefix, newPrefix]);
    await pool.query(`UPDATE settings SET value = replace(value::text, $1, $2)::jsonb WHERE value::text LIKE '%' || $1 || '%'`, [oldPrefix, newPrefix]);

    res.json({ success: true, oldName, newName, movedCount: objects.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Listar imagens da categoria ───────────
router.get('/list/:category', authGallery, async (req: Request, res: Response) => {
  const prefix = req.params.category + '/';
  try {
    const images: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, prefix, true);
    stream.on('data', (obj) => {
      // "-thumb.webp" é a miniatura gerada automaticamente pelo upload com remoção
      // de fundo (upload-nobg2/3) — fica salva ao lado do arquivo principal, mas
      // não é um conteúdo à parte, então não deve aparecer como item próprio na lista.
      if (obj.name && !obj.name.endsWith('.keep') && !obj.name.includes('__thumb') && !obj.name.endsWith('-thumb.webp')) {
        const filename = obj.name.replace(prefix, '');
        images.push({
          filename,
          displayName: displayName(filename),
          fullPath: obj.name,
          url: `${PUBLIC_URL}/${BUCKET}/${obj.name}`,
          size: obj.size,
          lastModified: obj.lastModified,
        });
      }
    });
    stream.on('end', () => {
      images.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      res.json(images);
    });
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upload para categoria ─────────────────
router.post('/upload/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;
  try {
    const filename = sanitizeName(req.file.originalname);
    const fullPath = `${category}/${filename}`;
    await minioClient.putObject(BUCKET, fullPath, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, filename, size: req.file.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Mover imagem entre pastas/categorias ──
router.post('/move', authGallery, async (req: Request, res: Response) => {
  const { fullPath, targetCategory } = req.body || {};
  if (!fullPath || !targetCategory) return res.status(400).json({ error: 'fullPath e targetCategory são obrigatórios' });

  try {
    const filename = fullPath.split('/').pop();
    const newPath = `${targetCategory}/${filename}`;
    if (newPath === fullPath) return res.json({ success: true, newPath, url: `${PUBLIC_URL}/${BUCKET}/${newPath}` });

    const stat = await minioClient.statObject(BUCKET, fullPath);
    const stream = await minioClient.getObject(BUCKET, fullPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    await minioClient.putObject(BUCKET, newPath, buffer, buffer.length, {
      'Content-Type': stat.metaData?.['content-type'] || 'application/octet-stream',
    });
    await minioClient.removeObject(BUCKET, fullPath);

    res.json({ success: true, newPath, url: `${PUBLIC_URL}/${BUCKET}/${newPath}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Deletar imagem ────────────────────────
router.delete('/delete/*', authGallery, async (req: Request, res: Response) => {
  const fullPath = (req.params as any)[0];
  try {
    await minioClient.removeObject(BUCKET, fullPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Limpeza automática das imagens do chat (retenção de 7 dias) ──
// Chamada diariamente via cron (scripts/cleanup-chat-images.sh). Só apaga
// arquivos dentro da pasta "chat/" — nenhuma outra galeria é afetada.
router.post('/cleanup-chat', authGallery, async (_req: Request, res: Response) => {
  const RETENTION_DAYS = 7;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const toDelete: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = minioClient.listObjectsV2(BUCKET, 'chat/', true);
      stream.on('data', (obj) => {
        if (obj.name && obj.lastModified && new Date(obj.lastModified).getTime() < cutoff) {
          toDelete.push(obj.name);
        }
      });
      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    for (const name of toDelete) {
      await minioClient.removeObject(BUCKET, name);
    }

    res.json({ deleted: toDelete.length, retentionDays: RETENTION_DAYS });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Miniatura sob demanda (pública, sem token) ────
// Redimensiona uma imagem já existente no bucket e guarda o resultado no próprio
// MinIO, para que a próxima requisição do mesmo caminho/tamanho seja instantânea
// (sem reprocessar). Resolve imagens grandes sendo exibidas em miniaturas pequenas
// (ex: 300KB+ carregado para exibir em 44x44px numa lista de produtos).
router.get('/thumb/*', async (req: Request, res: Response) => {
  const fullPath = (req.params as any)[0];
  const width = Math.min(Math.max(parseInt(String(req.query.w || '400'), 10) || 400, 50), 800);
  if (!fullPath) return res.status(400).json({ error: 'Caminho inválido' });

  // Guardado fora da pasta da categoria (em "_thumbs/") para não aparecer
  // como uma "segunda imagem" na listagem da SmartGaleria.
  const thumbPath = `_thumbs/${fullPath}.__thumb${width}.webp`;

  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Type', 'image/webp');

  try {
    // Já existe uma versão redimensionada gerada antes? serve direto do MinIO.
    const cachedStream = await minioClient.getObject(BUCKET, thumbPath);
    return cachedStream.pipe(res);
  } catch {
    // Ainda não existe — gera agora.
  }

  try {
    const originalStream = await minioClient.getObject(BUCKET, fullPath);
    const chunks: Buffer[] = [];
    for await (const chunk of originalStream) chunks.push(chunk as Buffer);
    const inputBuffer = Buffer.concat(chunks);

    const resized = await sharp(inputBuffer)
      .resize(width, width, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    // Salva para as próximas requisições não precisarem reprocessar.
    minioClient.putObject(BUCKET, thumbPath, resized, resized.length, { 'Content-Type': 'image/webp' }).catch(() => {});

    res.send(resized);
  } catch (err: any) {
    res.status(404).json({ error: 'Imagem não encontrada ou inválida' });
  }
});

// ── Interface HTML ────────────────────────
router.get('/', (_req: Request, res: Response) => res.send(galleryHTML()));

export default router;

function galleryHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartPrice — Galeria</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0a0f; --surface: #13131a; --surface2: #1a1a24;
    --border: #1e1e2e; --accent: #3b82f6; --accent-h: #2563eb;
    --text: #e2e8f0; --muted: #64748b;
    --success: #22c55e; --danger: #ef4444;
    --radius: 10px;
  }
  body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  /* LOGIN */
  #login-screen { display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
  .login-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:40px; width:100%; max-width:440px; text-align:center; }
  .logo-img { width:100%; max-width:320px; height:auto; margin:0 auto 16px; display:block; }
  .login-card p { color:var(--muted); font-size:13px; margin-bottom:28px; }
  input, select { width:100%; padding:11px 14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-size:14px; outline:none; transition:border-color .2s; font-family:inherit; }
  input:focus, select:focus { border-color:var(--accent); }
  select { cursor:pointer; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:11px 18px; background:var(--accent); color:#fff; border:none; border-radius:var(--radius); font-size:14px; font-weight:600; cursor:pointer; transition:background .2s; font-family:inherit; width:100%; margin-top:10px; }
  .btn:hover { background:var(--accent-h); }
  .btn-sm { width:auto; padding:8px 14px; font-size:13px; margin-top:0; }
  .btn-ghost { background:transparent; border:1px solid var(--border); color:var(--muted); }
  .btn-ghost:hover { border-color:var(--accent); color:var(--accent); }
  .error-msg { color:var(--danger); font-size:13px; margin-top:10px; display:none; }

  /* APP */
  #app { display:none; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:0 24px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:10; }
  .header-logo { font-size:16px; font-weight:700; }
  .header-logo span { color:var(--accent); }

  /* LAYOUT */
  .layout { display:flex; min-height:calc(100vh - 60px); }

  /* SIDEBAR */
  .sidebar { width:240px; min-width:240px; background:var(--surface); border-right:1px solid var(--border); padding:16px; display:flex; flex-direction:column; gap:6px; }
  .sidebar-title { font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; padding:4px 8px; margin-bottom:4px; }
  .cat-item { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-radius:8px; cursor:pointer; transition:background .15s; border:1px solid transparent; }
  .cat-item:hover { background:var(--surface2); }
  .cat-item.active { background:rgba(59,130,246,.12); border-color:rgba(59,130,246,.3); }
  .cat-name { font-size:13px; font-weight:500; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cat-item.active .cat-name { color:var(--accent); }
  .cat-del { opacity:0; font-size:12px; color:var(--danger); border:none; background:none; cursor:pointer; padding:2px 6px; border-radius:4px; }
  .cat-item:hover .cat-del { opacity:1; }
  .add-cat-btn { display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:8px; cursor:pointer; color:var(--muted); font-size:13px; font-weight:500; border:1px dashed var(--border); transition:all .15s; background:none; font-family:inherit; width:100%; margin-top:6px; }
  .add-cat-btn:hover { border-color:var(--accent); color:var(--accent); }

  /* MAIN */
  .main { flex:1; padding:24px; overflow:auto; }
  .no-cat { display:flex; flex:1; align-items:center; justify-content:center; color:var(--muted); flex-direction:column; gap:12px; padding:80px; text-align:center; }
  .no-cat .icon { font-size:40px; }

  /* TOPBAR */
  .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:10px; }
  .topbar h2 { font-size:18px; font-weight:700; }
  .topbar p { font-size:13px; color:var(--muted); margin-top:2px; }
  .search-input { padding:9px 14px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-size:13px; outline:none; width:220px; transition:border-color .2s; font-family:inherit; }
  .search-input:focus { border-color:var(--accent); }

  /* UPLOAD ZONE */
  .upload-zone { border:2px dashed var(--border); border-radius:14px; padding:28px; text-align:center; cursor:pointer; transition:border-color .2s, background .2s; margin-bottom:24px; position:relative; }
  .upload-zone:hover, .upload-zone.drag-over { border-color:var(--accent); background:rgba(59,130,246,.04); }
  .upload-zone input[type="file"] { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .upload-zone h3 { font-size:14px; font-weight:600; margin-bottom:4px; }
  .upload-zone p { font-size:12px; color:var(--muted); }
  .progress-bar { height:4px; background:var(--border); border-radius:99px; margin-top:12px; display:none; overflow:hidden; }
  .progress-fill { height:100%; background:var(--accent); border-radius:99px; width:0%; transition:width .3s; }

  /* GRID */
  .gallery-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; }
  .img-card { position:relative; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; transition:border-color .2s, transform .15s; }
  .img-card:hover { border-color:var(--accent); transform:translateY(-2px); }
  .img-cat-badge { position:absolute; top:6px; left:6px; z-index:1; background:rgba(0,0,0,.65); color:#fff; font-size:10px; font-weight:600; padding:3px 7px; border-radius:999px; pointer-events:none; }
  .img-thumb { width:100%; height:140px; object-fit:cover; display:block; background:var(--surface2); cursor:pointer; transition:opacity .2s; }
  .img-thumb:hover { opacity:.88; }
  .card-body { padding:10px; }
  .img-label { font-size:12px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:3px; }
  .img-meta { font-size:10px; color:var(--muted); margin-bottom:8px; }
  .card-actions { display:flex; gap:5px; }
  .card-actions button { flex:1; padding:6px; font-size:11px; font-weight:600; border-radius:6px; border:none; cursor:pointer; font-family:inherit; transition:opacity .2s; }
  .btn-copy { background:var(--accent); color:#fff; }
  .btn-del { background:transparent; border:1px solid var(--danger) !important; color:var(--danger); }
  .btn-copy:hover, .btn-del:hover { opacity:.82; }

  /* MODAL CRIAR */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.75); z-index:200; display:none; align-items:center; justify-content:center; padding:20px; }
  .modal-overlay.show { display:flex; }
  .modal { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:28px; width:100%; max-width:400px; }
  .modal h3 { font-size:16px; font-weight:700; margin-bottom:6px; }
  .modal p { font-size:13px; color:var(--muted); margin-bottom:18px; }
  .modal-actions { display:flex; gap:8px; margin-top:16px; }
  .modal-actions .btn { margin-top:0; }

  /* PREVIEW MODAL */
  #preview-modal { position:fixed; inset:0; background:rgba(0,0,0,.92); z-index:300; display:none; align-items:center; justify-content:center; flex-direction:column; padding:20px; }
  #preview-modal.show { display:flex; }
  #preview-modal img { max-width:90vw; max-height:75vh; object-fit:contain; border-radius:8px; box-shadow:0 0 60px rgba(0,0,0,.5); }
  .preview-info { margin-top:16px; text-align:center; }
  .preview-info h3 { font-size:15px; font-weight:600; margin-bottom:4px; }
  .preview-info p { font-size:12px; color:var(--muted); }
  .preview-actions { display:flex; gap:10px; margin-top:14px; }
  .preview-close { position:absolute; top:20px; right:24px; background:rgba(255,255,255,.1); border:none; color:#fff; font-size:20px; cursor:pointer; border-radius:8px; padding:6px 12px; transition:background .2s; }
  .preview-close:hover { background:rgba(255,255,255,.2); }

  /* TOAST */
  .toast { position:fixed; bottom:24px; right:24px; background:var(--success); color:#fff; padding:11px 18px; border-radius:var(--radius); font-size:13px; font-weight:600; z-index:999; transform:translateY(80px); opacity:0; transition:all .3s; }
  .toast.show { transform:translateY(0); opacity:1; }
  .toast.error { background:var(--danger); }

  .loading { text-align:center; padding:40px; color:var(--muted); font-size:14px; }
</style>
</head>
<body>

<!-- LOGIN -->
<div id="login-screen">
  <div class="login-card">
    <img src="/logo-gallery.png" alt="SmartGallery" class="logo-img">
    <p>Galeria de Imagens — Acesso Admin</p>
    <input type="password" id="pwd-input" placeholder="Senha de acesso" onkeydown="if(event.key==='Enter')doLogin()">
    <button class="btn" onclick="doLogin()">Entrar</button>
    <div class="error-msg" id="login-error">Senha incorreta</div>
  </div>
</div>

<!-- APP -->
<div id="app">
  <header>
    <div class="header-logo">SMART<span>PRICE</span> <span style="color:var(--muted);font-weight:400;font-size:13px">/ Galeria</span></div>
    <div style="display:flex;align-items:center;gap:14px">
      <button class="btn btn-sm" onclick="openGlobalSearch()" title="Buscar um produto em todas as galerias">🔎 Buscar em todas</button>
      <div style="font-size:13px;color:var(--muted)" id="header-info"></div>
    </div>
  </header>

  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-title">Galerias</div>
      <div id="cat-list"></div>
      <button class="add-cat-btn" onclick="showCreateModal()">＋ Nova galeria</button>
    </div>
    <div class="main" id="main-content">
      <div class="no-cat">
        <div class="icon">🗂️</div>
        <p>Selecione ou crie uma galeria<br>para começar</p>
      </div>
    </div>
  </div>
</div>

<!-- MODAL CRIAR -->
<div class="modal-overlay" id="create-modal">
  <div class="modal">
    <h3>Nova Galeria</h3>
    <p>Ex: Dermocosméticos, Medicamentos, Promoções, Layout Farma Center</p>
    <input type="text" id="cat-name-input" placeholder="Nome da galeria" onkeydown="if(event.key==='Enter')createCategory()">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="hideCreateModal()">Cancelar</button>
      <button class="btn btn-sm" onclick="createCategory()" style="flex:1;margin-top:0">Criar Galeria</button>
    </div>
  </div>
</div>

<!-- MODAL MOVER -->
<div class="modal-overlay" id="move-modal">
  <div class="modal">
    <h3>Mover Imagem</h3>
    <p id="move-modal-desc">Escolha a galeria de destino</p>
    <select id="move-target-select"></select>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="hideMoveModal()">Cancelar</button>
      <button class="btn btn-sm" onclick="confirmMove()" style="flex:1;margin-top:0">Mover</button>
    </div>
  </div>
</div>

<!-- PREVIEW MODAL -->
<div id="preview-modal">
  <button class="preview-close" onclick="closePreview()">✕</button>
  <img id="preview-img" src="" alt="">
  <div class="preview-info">
    <h3 id="preview-name"></h3>
    <p id="preview-meta"></p>
  </div>
  <div class="preview-actions">
    <button class="btn btn-sm" onclick="copyUrl(currentPreviewUrl)">📋 Copiar URL</button>
    <button class="btn btn-sm btn-ghost" onclick="downloadImage(currentPreviewUrl, currentPreviewName)">⬇️ Baixar</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let token = '';
  let categories = [];
  let currentCat = null;
  let searchMode = false;
  let allImages = [];
  let currentPreviewUrl = '';
  let currentPreviewName = '';
  let moveTargetFullPath = null;

  function doLogin() {
    token = document.getElementById('pwd-input').value;
    fetch('/gallery/categories?all=1', { headers: { 'x-gallery-token': token } })
      .then(r => { if (r.status === 401) throw new Error(); return r.json(); })
      .then(cats => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        categories = cats;
        renderSidebar();
      })
      .catch(() => {
        document.getElementById('login-error').style.display = 'block';
        token = '';
      });
  }

  function renderSidebar() {
    const list = document.getElementById('cat-list');
    if (categories.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 12px;">Nenhuma galeria ainda</div>';
      return;
    }
    list.innerHTML = categories.map(cat => \`
      <div class="cat-item \${currentCat === cat ? 'active' : ''}" onclick="selectCategory('\${cat}')">
        <span class="cat-name">📁 \${formatCatName(cat)}</span>
        <button class="cat-del" onclick="event.stopPropagation();renameCategory('\${cat}')" title="Renomear" style="margin-right:2px;">✎</button>
        <button class="cat-del" onclick="event.stopPropagation();deleteCategory('\${cat}')" title="Deletar">✕</button>
      </div>
    \`).join('');
  }

  function formatCatName(cat) {
    return cat.replace(/-/g, ' ').toUpperCase();
  }

  function selectCategory(cat) {
    searchMode = false;
    currentCat = cat;
    renderSidebar();
    loadImages(cat);
  }

  // BUSCA GERAL — procura o produto em todas as galerias de uma vez, sem
  // precisar abrir cada pasta pra conferir onde a imagem está.
  function openGlobalSearch() {
    searchMode = true;
    currentCat = null;
    renderSidebar();
    document.getElementById('header-info').textContent = '';
    document.getElementById('main-content').innerHTML = \`
      <div class="topbar">
        <div>
          <h2>🔎 Buscar em todas as galerias</h2>
          <p id="global-search-count">Carregando imagens de \${categories.length} galeria(s)...</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="search-input" type="text" id="global-search-input" placeholder="Buscar pelo nome..." oninput="filterImages(this.value)">
        </div>
      </div>
      <div class="gallery-grid" id="gallery-grid"><div class="loading">⏳ Carregando imagens...</div></div>
    \`;
    setTimeout(() => document.getElementById('global-search-input')?.focus(), 50);
    loadAllImages();
  }

  function loadAllImages() {
    Promise.all(categories.map(cat =>
      fetch(\`/gallery/list/\${cat}\`, { headers: { 'x-gallery-token': token } })
        .then(r => r.json())
        .then(images => (Array.isArray(images) ? images : []).map(img => ({ ...img, category: cat })))
        .catch(() => [])
    )).then(results => {
      if (!searchMode) return; // usuário já saiu da busca geral antes de terminar
      allImages = results.flat();
      const grid = document.getElementById('gallery-grid');
      const counter = document.getElementById('global-search-count');
      if (counter) counter.textContent = allImages.length + ' imagem(ns) em ' + categories.length + ' galeria(s)';
      if (!grid) return;
      grid.innerHTML = allImages.length === 0
        ? '<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--muted)">📭 Nenhuma imagem encontrada</div>'
        : allImages.map(img => imgCard(img)).join('');
    });
  }

  // Recarrega a visão atual (busca geral ou galeria aberta) depois de mover/excluir
  function refreshView() {
    if (searchMode) loadAllImages();
    else if (currentCat) loadImages(currentCat);
  }

  function showCreateModal() {
    document.getElementById('create-modal').classList.add('show');
    setTimeout(() => document.getElementById('cat-name-input').focus(), 100);
  }

  function hideCreateModal() {
    document.getElementById('create-modal').classList.remove('show');
    document.getElementById('cat-name-input').value = '';
  }

  function createCategory() {
    const name = document.getElementById('cat-name-input').value.trim();
    if (!name) return;
    fetch('/gallery/categories', {
      method: 'POST',
      headers: { 'x-gallery-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    .then(r => r.json())
    .then(data => {
      if (data.created) {
        hideCreateModal();
        loadCategories(() => selectCategory(data.name));
        showToast('✅ Galeria criada!');
      }
    });
  }

  function renameCategory(cat) {
    const novoNome = prompt(\`Novo nome para a galeria "\${formatCatName(cat)}" (pode usar acento):\`, formatCatName(cat));
    if (!novoNome || !novoNome.trim()) return;
    fetch(\`/gallery/categories/\${cat}/rename\`, {
      method: 'POST',
      headers: { 'x-gallery-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: novoNome })
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { showToast('⚠️ ' + (data.error || 'Erro ao renomear')); return; }
        if (currentCat === cat) currentCat = data.newName;
        loadCategories(() => { if (currentCat) selectCategory(currentCat); });
        showToast('✅ Galeria renomeada!');
      })
      .catch(() => showToast('⚠️ Erro ao renomear'));
  }

  function deleteCategory(cat) {
    if (!confirm(\`Deletar a galeria "\${formatCatName(cat)}" e todas as imagens dentro dela?\`)) return;
    const pwd = prompt('Para confirmar, digite novamente a senha de acesso da galeria:');
    if (pwd === null) return;
    if (pwd !== token) { showToast('❌ Senha incorreta. Exclusão cancelada.', true); return; }
    fetch(\`/gallery/categories/\${cat}\`, { method:'DELETE', headers:{'x-gallery-token':token} })
      .then(r => r.json())
      .then(() => {
        if (currentCat === cat) {
          currentCat = null;
          document.getElementById('main-content').innerHTML = \`<div class="no-cat"><div class="icon">🗂️</div><p>Selecione ou crie uma galeria<br>para começar</p></div>\`;
        }
        loadCategories();
        showToast('🗑️ Galeria deletada');
      });
  }

  function loadCategories(cb) {
    fetch('/gallery/categories?all=1', { headers: { 'x-gallery-token': token } })
      .then(r => r.json())
      .then(cats => { categories = cats; renderSidebar(); if (cb) cb(); });
  }

  function loadImages(cat) {
    document.getElementById('main-content').innerHTML = '<div class="loading">⏳ Carregando imagens...</div>';
    fetch(\`/gallery/list/\${cat}\`, { headers: { 'x-gallery-token': token } })
      .then(r => r.json())
      .then(images => { allImages = images; renderMain(cat, images); });
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function renderMain(cat, images) {
    document.getElementById('header-info').textContent = images.length + ' imagens';
    document.getElementById('main-content').innerHTML = \`
      <div class="topbar">
        <div>
          <h2>📁 \${formatCatName(cat)}</h2>
          <p>\${images.length} imagem(ns)</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="search-input" type="text" placeholder="Buscar pelo nome..." oninput="filterImages(this.value)">
          <button class="btn btn-sm" onclick="document.getElementById('file-input').click()">+ Upload</button>
        </div>
      </div>

      <div class="upload-zone" id="drop-zone">
        <input type="file" id="file-input" accept="image/*" multiple onchange="handleFiles(this.files, '\${cat}')">
        <h3>🖼️ Arraste imagens aqui ou clique para selecionar</h3>
        <p>PNG, JPG, WEBP, GIF — até 100MB por arquivo</p>
        <div class="progress-bar" id="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
      </div>

      <div class="gallery-grid" id="gallery-grid">
        \${images.length === 0
          ? '<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--muted)">📭 Nenhuma imagem ainda. Faça upload acima!</div>'
          : images.map(img => imgCard(img)).join('')}
      </div>
    \`;
    setupDrop(cat);
  }

  function imgCard(img) {
    const safeName = img.displayName.replace(/'/g, "\\\\'");
    const safeMeta = formatSize(img.size);
    const safeFilename = img.filename.replace(/'/g, "\\\\'");
    const safeFullPath = img.fullPath.replace(/'/g, "\\\\'");
    // Miniatura redimensionada (300px) em vez da imagem original — o grid mostra
    // dezenas de fotos de uma vez, e carregar cada uma em tamanho real (às vezes
    // vários MB) é o que fazia parecer travado/carregando pela metade.
    const thumbSrc = '/gallery/thumb/' + img.fullPath.split('/').map(encodeURIComponent).join('/') + '?w=300';
    const catBadge = img.category ? \`<div class="img-cat-badge">📁 \${formatCatName(img.category)}</div>\` : '';
    return \`
      <div class="img-card">
        \${catBadge}
        <img class="img-thumb" src="\${thumbSrc}" alt="\${img.displayName}" loading="lazy"
          onclick="openPreview('\${img.url}', '\${safeName}', '\${safeMeta}', '\${safeFilename}')"
          onerror="this.style.height='80px';this.style.background='var(--surface2)'">
        <div class="card-body">
          <div class="img-label" title="\${img.displayName}">\${img.displayName}</div>
          <div class="img-meta">\${safeMeta}</div>
          <div class="card-actions">
            <button class="btn-copy" onclick="copyUrl('\${img.url}')" title="Copiar URL">📋</button>
            <button class="btn-copy" onclick="downloadImage('\${img.url}', '\${safeFilename}')" title="Baixar">⬇️</button>
            <button class="btn-copy" onclick="openMoveModal('\${safeFullPath}')" title="Mover para outra galeria">📁</button>
            <button class="btn-del" onclick="deleteImage('\${img.fullPath}')" title="Excluir">🗑️</button>
          </div>
        </div>
      </div>\`;
  }

  function filterImages(q) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    const filtered = allImages.filter(img => img.displayName.toLowerCase().includes(q.toLowerCase()) || img.filename.toLowerCase().includes(q.toLowerCase()));
    grid.innerHTML = filtered.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Nenhuma imagem encontrada</div>'
      : filtered.map(img => imgCard(img)).join('');
  }

  // PREVIEW
  function openPreview(url, name, meta, filename) {
    currentPreviewUrl = url;
    currentPreviewName = filename || name;
    document.getElementById('preview-img').src = url;
    document.getElementById('preview-name').textContent = name;
    document.getElementById('preview-meta').textContent = meta;
    document.getElementById('preview-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    document.getElementById('preview-modal').classList.remove('show');
    document.getElementById('preview-img').src = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

  // DOWNLOAD — baixa via blob, funciona mesmo com a imagem hospedada em outro domínio
  async function downloadImage(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao baixar');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'imagem';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      showToast('❌ Erro ao baixar a imagem', true);
    }
  }

  // MOVER ENTRE GALERIAS
  function openMoveModal(fullPath) {
    moveTargetFullPath = fullPath;
    const currentCategory = fullPath.split('/')[0];
    const select = document.getElementById('move-target-select');
    select.innerHTML = categories
      .filter(c => c !== currentCategory)
      .map(c => \`<option value="\${c}">\${formatCatName(c)}</option>\`)
      .join('');
    document.getElementById('move-modal-desc').textContent = 'Mover de "' + formatCatName(currentCategory) + '" para:';
    document.getElementById('move-modal').classList.add('show');
  }

  function hideMoveModal() {
    document.getElementById('move-modal').classList.remove('show');
    moveTargetFullPath = null;
  }

  function confirmMove() {
    const targetCategory = document.getElementById('move-target-select').value;
    if (!moveTargetFullPath || !targetCategory) return;
    fetch('/gallery/move', {
      method: 'POST',
      headers: { 'x-gallery-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullPath: moveTargetFullPath, targetCategory })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast('✅ Imagem movida!');
          hideMoveModal();
          refreshView();
        } else {
          showToast('❌ ' + (data.error || 'Erro ao mover'), true);
        }
      })
      .catch(() => showToast('❌ Erro ao mover a imagem', true));
  }

  // UPLOAD
  async function handleFiles(files, cat) {
    if (!files.length) return;
    const bar = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    if (bar) bar.style.display = 'block';
    for (let i = 0; i < files.length; i++) {
      if (fill) fill.style.width = Math.round((i / files.length) * 100) + '%';
      const fd = new FormData();
      fd.append('image', files[i]);
      try {
        const res = await fetch(\`/gallery/upload/\${cat}\`, { method:'POST', headers:{'x-gallery-token':token}, body:fd });
        const data = await res.json();
        if (data.url) showToast('✅ ' + files[i].name + ' enviada!');
        else showToast('❌ ' + (data.error || 'Erro'), true);
      } catch { showToast('❌ Erro no upload', true); }
    }
    if (fill) fill.style.width = '100%';
    setTimeout(() => { if (bar) bar.style.display='none'; if (fill) fill.style.width='0%'; }, 800);
    loadImages(cat);
    document.getElementById('file-input').value = '';
  }

  function setupDrop(cat) {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files, cat); });
  }

  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => showToast('📋 URL copiada!'));
  }

  function deleteImage(fullPath) {
    if (!confirm('Deletar esta imagem?')) return;
    const pwd = prompt('Para confirmar, digite novamente a senha de acesso da galeria:');
    if (pwd === null) return;
    if (pwd !== token) { showToast('❌ Senha incorreta. Exclusão cancelada.', true); return; }
    fetch('/gallery/delete/' + encodeURIComponent(fullPath), { method:'DELETE', headers:{'x-gallery-token':token} })
      .then(r => r.json())
      .then(data => { if (data.success) { refreshView(); showToast('🗑️ Imagem deletada'); } });
  }

  function showToast(msg, error = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (error ? ' error' : '');
    setTimeout(() => t.className = 'toast', 3000);
  }
</script>
</body>
</html>`;
}



router.post('/upload-nobg/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;

  const tmpIn = path.join(os.tmpdir(), `rembg_in_${Date.now()}.png`);
  const tmpOut = path.join(os.tmpdir(), `rembg_out_${Date.now()}.png`);

  try {
    // Otimiza imagem (redimensiona + comprime)
    const optimized = await sharp(req.file.buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .png({ quality: 80, progressive: true })
      .toBuffer();
    
    // Salva arquivo temporário
    fs.writeFileSync(tmpIn, optimized);

    // Remove fundo com rembg
    await execAsync(`python3 -c "from rembg import remove; import sys; open(sys.argv[2],'wb').write(remove(open(sys.argv[1],'rb').read()))" ${tmpIn} ${tmpOut}`);

    // Lê resultado
    const outputBuffer = fs.readFileSync(tmpOut);
    const filename = sanitizeName(req.file.originalname.replace(/\.[^.]+$/, '.png'));
    const fullPath = `${category}/${filename}`;

    // Sobe para MinIO
    await minioClient.putObject(BUCKET, fullPath, outputBuffer, outputBuffer.length, { 'Content-Type': 'image/png' });

    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, filename, size: outputBuffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});

// ── Upload com remoção de fundo v2 (via microserviço quente — rápido) ────────
// Usa o microserviço Python persistente (modelo já carregado em memória) em vez
// de iniciar um processo Python novo a cada chamada — ~15x mais rápido por
// imagem (medido: 87s no spawn frio vs 5.7s no microserviço quente).
router.post('/upload-nobg2/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;

  try {
    // Detecta automaticamente se a imagem enviada ja nao tem fundo (ex: ja veio
    // recortada de um cadastro anterior) pra nao chamar o rembg de novo a toa.
    const alreadyCutOut = await isAlreadyCutOut(req.file.buffer);

    let rembgBuffer: Buffer;
    if (alreadyCutOut) {
      rembgBuffer = req.file.buffer;
    } else {
      // Envia para o microserviço rembg (processo já rodando, modelo pré-carregado).
      // Esse microserviço só existe na VPS (fora deste repo/compose) — em dev local
      // ele não roda, então cai no fallback abaixo (usa a imagem original sem
      // remover fundo) em vez de quebrar o cadastro inteiro por causa disso.
      try {
        const FormData = (await import('form-data')).default;
        const fetch2 = (await import('node-fetch')).default;

        const form = new FormData();
        form.append('image', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

        const rembgRes = await fetch2('http://172.18.0.1:5001/remove-bg', { method: 'POST', body: form });
        if (!rembgRes.ok) throw new Error('Erro no microserviço rembg');
        rembgBuffer = Buffer.from(await rembgRes.arrayBuffer());
      } catch (rembgErr: any) {
        console.warn('[gallery] microserviço rembg indisponível, usando imagem original sem remover fundo:', rembgErr.message);
        rembgBuffer = req.file.buffer;
      }
    }

    let finalBuffer = rembgBuffer;
    if (req.body?.duplicate === 'true') {
      try {
        finalBuffer = await composeDuplicate(rembgBuffer);
      } catch (duplicateErr: any) {
        console.warn('[gallery] falha ao duplicar imagem, usando imagem sem duplicar:', duplicateErr.message);
      }
    }

    const rawName = (req.body && req.body.name && req.body.name.trim()) ? req.body.name.trim() : req.file.originalname.replace(/\.[^.]+$/, '');
    const cleanName = rawName.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().substring(0, 80) || 'produto';

    const mainBuffer = await sharp(finalBuffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const thumbBuffer = await sharp(finalBuffer).resize(200, 200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();

    const filename = `${cleanName}.webp`;
    const thumbFilename = `${cleanName}-thumb.webp`;
    const fullPath = `${category}/${filename}`;
    const thumbPath = `${category}/${thumbFilename}`;

    await minioClient.putObject(BUCKET, fullPath, mainBuffer, mainBuffer.length, { 'Content-Type': 'image/webp' });
    await minioClient.putObject(BUCKET, thumbPath, thumbBuffer, thumbBuffer.length, { 'Content-Type': 'image/webp' });

    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, thumbUrl: `${PUBLIC_URL}/${BUCKET}/${thumbPath}`, filename, size: mainBuffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upload com remoção de fundo v3 (python interno) ──────────────────────────
router.post('/upload-nobg3/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;
  const tmpIn = path.join(os.tmpdir(), `in_${Date.now()}.png`);
  const tmpOut = path.join(os.tmpdir(), `out_${Date.now()}.png`);
  try {
    fs.writeFileSync(tmpIn, req.file.buffer);
    await execAsync(`python3 -c "from rembg import remove; open('${tmpOut}','wb').write(remove(open('${tmpIn}','rb').read()))"`);
    const rembgBuffer = fs.readFileSync(tmpOut);
    const rawName = (req.body && req.body.name && req.body.name.trim()) ? req.body.name.trim() : req.file.originalname.replace(/\.[^.]+$/, '');
    const cleanName = rawName.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-zA-Z0-9\s_-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().substring(0, 80) || 'produto';
    const mainBuffer = await sharp(rembgBuffer).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const thumbBuffer = await sharp(rembgBuffer).resize(200, 200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    const filename = `${cleanName}.webp`;
    const thumbFilename = `${cleanName}-thumb.webp`;
    const fullPath = `${category}/${filename}`;
    const thumbPath = `${category}/${thumbFilename}`;
    await minioClient.putObject(BUCKET, fullPath, mainBuffer, mainBuffer.length, { 'Content-Type': 'image/webp' });
    await minioClient.putObject(BUCKET, thumbPath, thumbBuffer, thumbBuffer.length, { 'Content-Type': 'image/webp' });
    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, thumbUrl: `${PUBLIC_URL}/${BUCKET}/${thumbPath}`, filename, size: mainBuffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});
