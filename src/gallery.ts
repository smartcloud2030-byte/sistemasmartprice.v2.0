// ─────────────────────────────────────────
// gallery.ts v2.1 — Galeria com Categorias
// Fix: nome original + preview de imagem
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import * as Minio from 'minio';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
const execAsync = promisify(exec);

const router = Router();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

const BUCKET = process.env.MINIO_BUCKET || 'smartprice-images';
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

// ── Listar categorias ─────────────────────
router.get('/categories', authGallery, async (_req: Request, res: Response) => {
  try {
    const categories = new Set<string>();
    const stream = minioClient.listObjectsV2(BUCKET, '', true);
    stream.on('data', (obj) => {
      if (obj.name && obj.name.includes('/')) categories.add(obj.name.split('/')[0]);
    });
    stream.on('end', () => res.json([...categories].sort()));
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Criar categoria ───────────────────────
router.post('/categories', authGallery, async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const safeName = name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
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

// ── Listar imagens da categoria ───────────
router.get('/list/:category', authGallery, async (req: Request, res: Response) => {
  const prefix = req.params.category + '/';
  try {
    const images: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name && !obj.name.endsWith('.keep')) {
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
  .login-card { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:40px; width:100%; max-width:380px; text-align:center; }
  .logo { font-size:22px; font-weight:700; margin-bottom:6px; }
  .logo span { color:var(--accent); }
  .login-card p { color:var(--muted); font-size:13px; margin-bottom:28px; }
  input { width:100%; padding:11px 14px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-size:14px; outline:none; transition:border-color .2s; font-family:inherit; }
  input:focus { border-color:var(--accent); }
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
  .img-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; transition:border-color .2s, transform .15s; }
  .img-card:hover { border-color:var(--accent); transform:translateY(-2px); }
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
    <div class="logo">SMART<span>PRICE</span></div>
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
    <div style="font-size:13px;color:var(--muted)" id="header-info"></div>
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
    <a id="preview-download" href="" download target="_blank">
      <button class="btn btn-sm btn-ghost" style="margin-top:0">⬇️ Abrir original</button>
    </a>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let token = '';
  let categories = [];
  let currentCat = null;
  let allImages = [];
  let currentPreviewUrl = '';

  function doLogin() {
    token = document.getElementById('pwd-input').value;
    fetch('/gallery/categories', { headers: { 'x-gallery-token': token } })
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
        <button class="cat-del" onclick="event.stopPropagation();deleteCategory('\${cat}')" title="Deletar">✕</button>
      </div>
    \`).join('');
  }

  function formatCatName(cat) {
    return cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function selectCategory(cat) {
    currentCat = cat;
    renderSidebar();
    loadImages(cat);
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

  function deleteCategory(cat) {
    if (!confirm(\`Deletar a galeria "\${formatCatName(cat)}" e todas as imagens dentro dela?\`)) return;
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
    fetch('/gallery/categories', { headers: { 'x-gallery-token': token } })
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
    const safe = encodeURIComponent(img.fullPath);
    const safeName = img.displayName.replace(/'/g, "\\\\'");
    const safeMeta = formatSize(img.size);
    return \`
      <div class="img-card">
        <img class="img-thumb" src="\${img.url}" alt="\${img.displayName}" loading="lazy"
          onclick="openPreview('\${img.url}', '\${safeName}', '\${safeMeta}')"
          onerror="this.style.height='80px';this.style.background='var(--surface2)'">
        <div class="card-body">
          <div class="img-label" title="\${img.displayName}">\${img.displayName}</div>
          <div class="img-meta">\${safeMeta}</div>
          <div class="card-actions">
            <button class="btn-copy" onclick="copyUrl('\${img.url}')">📋 Copiar URL</button>
            <button class="btn-del" onclick="deleteImage('\${img.fullPath}')">🗑️</button>
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
  function openPreview(url, name, meta) {
    currentPreviewUrl = url;
    document.getElementById('preview-img').src = url;
    document.getElementById('preview-name').textContent = name;
    document.getElementById('preview-meta').textContent = meta;
    document.getElementById('preview-download').href = url;
    document.getElementById('preview-modal').classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closePreview() {
    document.getElementById('preview-modal').classList.remove('show');
    document.getElementById('preview-img').src = '';
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePreview(); });

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
    fetch('/gallery/delete/' + encodeURIComponent(fullPath), { method:'DELETE', headers:{'x-gallery-token':token} })
      .then(r => r.json())
      .then(data => { if (data.success) { loadImages(currentCat); showToast('🗑️ Imagem deletada'); } });
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
    // Salva arquivo temporário
    fs.writeFileSync(tmpIn, req.file.buffer);

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

// ── Upload com remoção de fundo v2 (via microserviço) ─────────────────────────
router.post('/upload-nobg2/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;

  try {
    // Envia para o microserviço rembg
    const FormData = (await import('form-data')).default;
    const fetch2 = (await import('node-fetch')).default;

    const form = new FormData();
    form.append('image', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    const rembgRes = await fetch2('http://172.18.0.1:5001/remove-bg', { method: 'POST', body: form });
    if (!rembgRes.ok) throw new Error('Erro no microserviço rembg');

    const outputBuffer = Buffer.from(await rembgRes.arrayBuffer());
    const filename = sanitizeName(req.file.originalname.replace(/\.[^.]+$/, '.png'));
    const fullPath = `${category}/${filename}`;

    await minioClient.putObject(BUCKET, fullPath, outputBuffer, outputBuffer.length, { 'Content-Type': 'image/png' });
    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, filename, size: outputBuffer.length });
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
    const outputBuffer = fs.readFileSync(tmpOut);
    const filename = sanitizeName(req.file.originalname.replace(/\.[^.]+$/, '.png'));
    const fullPath = `${category}/${filename}`;
    await minioClient.putObject(BUCKET, fullPath, outputBuffer, outputBuffer.length, { 'Content-Type': 'image/png' });
    res.json({ url: `${PUBLIC_URL}/${BUCKET}/${fullPath}`, filename, size: outputBuffer.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
});
