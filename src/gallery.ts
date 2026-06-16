// ─────────────────────────────────────────
// gallery.ts v2.0 — Galeria com Categorias
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import * as Minio from 'minio';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

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
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
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

// ── Listar categorias (pastas no MinIO) ──
router.get('/categories', authGallery, async (_req: Request, res: Response) => {
  try {
    const categories = new Set<string>();
    const stream = minioClient.listObjectsV2(BUCKET, '', true);
    stream.on('data', (obj) => {
      if (obj.name && obj.name.includes('/')) {
        categories.add(obj.name.split('/')[0]);
      }
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
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');

  if (!safeName) return res.status(400).json({ error: 'Nome inválido' });

  try {
    // Cria um objeto placeholder para "criar" a pasta
    const placeholder = Buffer.from('');
    await minioClient.putObject(BUCKET, `${safeName}/.keep`, placeholder, 0);
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
      for (const obj of objects) {
        await minioClient.removeObject(BUCKET, obj);
      }
      res.json({ success: true, deleted: objects.length });
    });
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Listar imagens de uma categoria ──────
router.get('/list/:category', authGallery, async (req: Request, res: Response) => {
  const prefix = req.params.category + '/';
  try {
    const images: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name && !obj.name.endsWith('.keep')) {
        images.push({
          filename: obj.name.replace(prefix, ''),
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

// ── Upload para uma categoria ─────────────
router.post('/upload/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${category}/${Date.now()}-${hash}${ext}`;
    await minioClient.putObject(BUCKET, filename, req.file.buffer, req.file.size, { 'Content-Type': req.file.mimetype });
    const url = `${PUBLIC_URL}/${BUCKET}/${filename}`;
    res.json({ url, filename, size: req.file.size });
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
    --success: #22c55e; --danger: #ef4444; --warn: #f59e0b;
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
  .btn-danger { background:transparent; border:1px solid var(--danger); color:var(--danger); }
  .btn-danger:hover { background:var(--danger); color:#fff; }
  .btn-ghost { background:transparent; border:1px solid var(--border); color:var(--muted); }
  .btn-ghost:hover { border-color:var(--accent); color:var(--accent); }
  .error-msg { color:var(--danger); font-size:13px; margin-top:10px; display:none; }

  /* APP */
  #app { display:none; }
  header { background:var(--surface); border-bottom:1px solid var(--border); padding:0 24px; height:60px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:10; }
  .header-logo { font-size:16px; font-weight:700; }
  .header-logo span { color:var(--accent); }
  .header-actions { display:flex; gap:8px; align-items:center; }

  /* LAYOUT */
  .layout { display:flex; min-height:calc(100vh - 60px); }

  /* SIDEBAR */
  .sidebar { width:240px; min-width:240px; background:var(--surface); border-right:1px solid var(--border); padding:16px; display:flex; flex-direction:column; gap:8px; }
  .sidebar-title { font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; padding:4px 8px; margin-bottom:4px; }
  .cat-item { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; border-radius:8px; cursor:pointer; transition:background .15s; border:1px solid transparent; }
  .cat-item:hover { background:var(--surface2); }
  .cat-item.active { background:rgba(59,130,246,.12); border-color:rgba(59,130,246,.3); }
  .cat-name { font-size:13px; font-weight:500; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cat-item.active .cat-name { color:var(--accent); }
  .cat-count { font-size:11px; color:var(--muted); background:var(--surface2); padding:2px 7px; border-radius:99px; }
  .cat-del { opacity:0; font-size:12px; color:var(--danger); border:none; background:none; cursor:pointer; padding:2px 4px; }
  .cat-item:hover .cat-del { opacity:1; }
  .add-cat-btn { display:flex; align-items:center; gap:8px; padding:9px 12px; border-radius:8px; cursor:pointer; color:var(--muted); font-size:13px; font-weight:500; border:1px dashed var(--border); transition:all .15s; background:none; font-family:inherit; width:100%; margin-top:4px; }
  .add-cat-btn:hover { border-color:var(--accent); color:var(--accent); }

  /* MAIN */
  .main { flex:1; padding:24px; overflow:auto; }

  /* EMPTY STATE */
  .empty-cats { text-align:center; padding:80px 20px; color:var(--muted); }
  .empty-cats .icon { font-size:48px; margin-bottom:16px; }
  .empty-cats h3 { font-size:16px; font-weight:600; color:var(--text); margin-bottom:8px; }
  .empty-cats p { font-size:14px; margin-bottom:20px; }

  /* UPLOAD ZONE */
  .upload-zone { border:2px dashed var(--border); border-radius:16px; padding:32px; text-align:center; cursor:pointer; transition:border-color .2s, background .2s; margin-bottom:24px; position:relative; }
  .upload-zone:hover, .upload-zone.drag-over { border-color:var(--accent); background:rgba(59,130,246,.04); }
  .upload-zone input[type="file"] { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .upload-zone h3 { font-size:14px; font-weight:600; margin-bottom:4px; }
  .upload-zone p { font-size:12px; color:var(--muted); }
  .progress-bar { height:4px; background:var(--border); border-radius:99px; margin-top:12px; display:none; overflow:hidden; }
  .progress-fill { height:100%; background:var(--accent); border-radius:99px; width:0%; transition:width .3s; }

  /* TOPBAR */
  .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:10px; }
  .topbar-left h2 { font-size:18px; font-weight:700; }
  .topbar-left p { font-size:13px; color:var(--muted); margin-top:2px; }
  .search-input { padding:9px 14px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-size:13px; outline:none; width:220px; transition:border-color .2s; font-family:inherit; }
  .search-input:focus { border-color:var(--accent); }

  /* GRID */
  .gallery-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; }
  .img-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; transition:border-color .2s, transform .15s; }
  .img-card:hover { border-color:var(--accent); transform:translateY(-2px); }
  .img-card img { width:100%; height:130px; object-fit:cover; display:block; background:var(--bg); }
  .card-body { padding:9px; }
  .filename { font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:7px; }
  .card-actions { display:flex; gap:5px; }
  .card-actions button { flex:1; padding:5px; font-size:11px; font-weight:600; border-radius:6px; border:none; cursor:pointer; transition:opacity .2s; font-family:inherit; }
  .btn-copy { background:var(--accent); color:#fff; }
  .btn-del { background:transparent; border:1px solid var(--danger) !important; color:var(--danger); }
  .btn-copy:hover, .btn-del:hover { opacity:.82; }

  /* MODAL */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:100; display:flex; align-items:center; justify-content:center; padding:20px; display:none; }
  .modal-overlay.show { display:flex; }
  .modal { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:28px; width:100%; max-width:400px; }
  .modal h3 { font-size:16px; font-weight:700; margin-bottom:6px; }
  .modal p { font-size:13px; color:var(--muted); margin-bottom:18px; }
  .modal-actions { display:flex; gap:8px; margin-top:16px; }
  .modal-actions .btn { margin-top:0; }

  /* EMPTY */
  .empty { text-align:center; padding:50px 20px; color:var(--muted); display:none; }
  .empty p { margin-top:8px; font-size:13px; }

  /* TOAST */
  .toast { position:fixed; bottom:24px; right:24px; background:var(--success); color:#fff; padding:11px 18px; border-radius:var(--radius); font-size:13px; font-weight:600; z-index:999; transform:translateY(80px); opacity:0; transition:all .3s; }
  .toast.show { transform:translateY(0); opacity:1; }
  .toast.error { background:var(--danger); }

  .loading { text-align:center; padding:40px; color:var(--muted); }
  .no-cat { display:flex; flex:1; align-items:center; justify-content:center; color:var(--muted); flex-direction:column; gap:12px; padding:60px; text-align:center; }
  .no-cat .icon { font-size:40px; }
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
    <div class="header-actions">
      <span id="header-info" style="font-size:13px;color:var(--muted)"></span>
    </div>
  </header>

  <div class="layout">
    <!-- SIDEBAR -->
    <div class="sidebar">
      <div class="sidebar-title">Galerias</div>
      <div id="cat-list"></div>
      <button class="add-cat-btn" onclick="showCreateModal()">＋ Nova galeria</button>
    </div>

    <!-- MAIN -->
    <div class="main" id="main-content">
      <div class="no-cat">
        <div class="icon">🗂️</div>
        <p>Selecione ou crie uma galeria<br>para começar</p>
      </div>
    </div>
  </div>
</div>

<!-- MODAL CRIAR GALERIA -->
<div class="modal-overlay" id="create-modal">
  <div class="modal">
    <h3>Nova Galeria</h3>
    <p>Dê um nome para a galeria. Ex: Dermocosméticos, Medicamentos, Promoções</p>
    <input type="text" id="cat-name-input" placeholder="Nome da galeria" onkeydown="if(event.key==='Enter')createCategory()">
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="hideCreateModal()">Cancelar</button>
      <button class="btn btn-sm" onclick="createCategory()" style="flex:1">Criar Galeria</button>
    </div>
  </div>
</div>

<!-- TOAST -->
<div class="toast" id="toast"></div>

<script>
  let token = '';
  let categories = [];
  let currentCat = null;
  let allImages = [];

  // ── LOGIN ──────────────────────────────
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

  // ── SIDEBAR ────────────────────────────
  function renderSidebar() {
    const list = document.getElementById('cat-list');
    if (categories.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:8px 12px;">Nenhuma galeria ainda</div>';
      return;
    }
    list.innerHTML = categories.map(cat => \`
      <div class="cat-item \${currentCat === cat ? 'active' : ''}" onclick="selectCategory('\${cat}')">
        <span class="cat-name">📁 \${cat}</span>
        <button class="cat-del" onclick="event.stopPropagation();deleteCategory('\${cat}')" title="Deletar galeria">✕</button>
      </div>
    \`).join('');
  }

  // ── SELECIONAR CATEGORIA ───────────────
  function selectCategory(cat) {
    currentCat = cat;
    renderSidebar();
    loadImages(cat);
  }

  // ── CRIAR CATEGORIA ────────────────────
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
        showToast('✅ Galeria "' + data.name + '" criada!');
      }
    });
  }

  // ── DELETAR CATEGORIA ──────────────────
  function deleteCategory(cat) {
    if (!confirm(\`Deletar a galeria "\${cat}" e todas as imagens?\`)) return;
    fetch(\`/gallery/categories/\${cat}\`, {
      method: 'DELETE',
      headers: { 'x-gallery-token': token }
    })
    .then(r => r.json())
    .then(() => {
      if (currentCat === cat) {
        currentCat = null;
        document.getElementById('main-content').innerHTML = \`
          <div class="no-cat">
            <div class="icon">🗂️</div>
            <p>Selecione ou crie uma galeria<br>para começar</p>
          </div>\`;
      }
      loadCategories();
      showToast('🗑️ Galeria deletada');
    });
  }

  // ── CARREGAR CATEGORIAS ────────────────
  function loadCategories(cb) {
    fetch('/gallery/categories', { headers: { 'x-gallery-token': token } })
      .then(r => r.json())
      .then(cats => { categories = cats; renderSidebar(); if (cb) cb(); });
  }

  // ── CARREGAR IMAGENS ───────────────────
  function loadImages(cat) {
    document.getElementById('main-content').innerHTML = '<div class="loading">Carregando imagens...</div>';
    fetch(\`/gallery/list/\${cat}\`, { headers: { 'x-gallery-token': token } })
      .then(r => r.json())
      .then(images => { allImages = images; renderMain(cat, images); });
  }

  // ── RENDERIZAR MAIN ────────────────────
  function renderMain(cat, images) {
    document.getElementById('header-info').textContent = images.length + ' imagens';
    document.getElementById('main-content').innerHTML = \`
      <div class="topbar">
        <div class="topbar-left">
          <h2>📁 \${cat}</h2>
          <p>\${images.length} imagem(ns)</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="search-input" type="text" placeholder="Buscar..." oninput="filterImages(this.value)">
          <button class="btn btn-sm" onclick="document.getElementById('file-input-\${cat}').click()">+ Upload</button>
        </div>
      </div>

      <div class="upload-zone" id="drop-zone">
        <input type="file" id="file-input-\${cat}" accept="image/*" multiple onchange="handleFiles(this.files, '\${cat}')">
        <h3>🖼️ Arraste imagens aqui ou clique para selecionar</h3>
        <p>PNG, JPG, WEBP, GIF, SVG — até 100MB por arquivo</p>
        <div class="progress-bar" id="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
      </div>

      <div class="gallery-grid" id="gallery-grid">
        \${images.length === 0
          ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">📭 Nenhuma imagem nesta galeria. Faça upload acima!</div>'
          : images.map(img => imgCard(img)).join('')}
      </div>
    \`;
    setupDrop(cat);
  }

  function imgCard(img) {
    const safePath = img.fullPath.replace(/'/g, "\\\\'");
    return \`
      <div class="img-card">
        <img src="\${img.url}" alt="\${img.filename}" loading="lazy"
          onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"130\\"><rect fill=\\"%231e1e2e\\" width=\\"200\\" height=\\"130\\"/><text fill=\\"%2364748b\\" x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" dy=\\".3em\\" font-size=\\"11\\">Erro</text></svg>'">
        <div class="card-body">
          <div class="filename">\${img.filename}</div>
          <div class="card-actions">
            <button class="btn-copy" onclick="copyUrl('\${img.url}')">📋 Copiar URL</button>
            <button class="btn-del" onclick="deleteImage('\${safePath}')">🗑️</button>
          </div>
        </div>
      </div>\`;
  }

  // ── FILTRAR IMAGENS ────────────────────
  function filterImages(q) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    const filtered = allImages.filter(img => img.filename.toLowerCase().includes(q.toLowerCase()));
    grid.innerHTML = filtered.length === 0
      ? '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--muted)">Nenhuma imagem encontrada</div>'
      : filtered.map(img => imgCard(img)).join('');
  }

  // ── UPLOAD ─────────────────────────────
  async function handleFiles(files, cat) {
    if (!files.length) return;
    const bar = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    if (bar) bar.style.display = 'block';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (fill) fill.style.width = Math.round((i / files.length) * 100) + '%';
      const fd = new FormData();
      fd.append('image', file);
      try {
        const res = await fetch(\`/gallery/upload/\${cat}\`, {
          method: 'POST',
          headers: { 'x-gallery-token': token },
          body: fd
        });
        const data = await res.json();
        if (data.url) showToast('✅ ' + file.name + ' enviada!');
        else showToast('❌ ' + (data.error || 'Erro no upload'), true);
      } catch { showToast('❌ Erro no upload', true); }
    }

    if (fill) fill.style.width = '100%';
    setTimeout(() => { if (bar) bar.style.display = 'none'; if (fill) fill.style.width = '0%'; }, 800);
    loadImages(cat);
  }

  // ── DRAG & DROP ────────────────────────
  function setupDrop(cat) {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files, cat);
    });
  }

  // ── COPIAR URL ─────────────────────────
  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => showToast('📋 URL copiada!'));
  }

  // ── DELETAR IMAGEM ─────────────────────
  function deleteImage(fullPath) {
    if (!confirm('Deletar esta imagem?')) return;
    fetch('/gallery/delete/' + encodeURIComponent(fullPath), {
      method: 'DELETE',
      headers: { 'x-gallery-token': token }
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) { loadImages(currentCat); showToast('🗑️ Imagem deletada'); }
    });
  }

  // ── TOAST ──────────────────────────────
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
