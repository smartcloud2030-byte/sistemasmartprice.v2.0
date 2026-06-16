// ─────────────────────────────────────────
// gallery.ts — Galeria de imagens Admin
// Adicionar no server.ts ou importar como módulo
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import * as Minio from 'minio';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const router = Router();

// ── MinIO Client ──────────────────────────
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

const BUCKET = process.env.MINIO_BUCKET || 'smartprice-images';
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://imagens.sistemasmartprice.com.br';
const GALLERY_PASSWORD = process.env.GALLERY_PASSWORD || 'smartprice@admin';

// ── Multer (memória) ──────────────────────
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

// ── Middleware de autenticação simples ────
function authGallery(req: Request, res: Response, next: Function) {
  const token = req.headers['x-gallery-token'] || req.query.token;
  if (token === GALLERY_PASSWORD) return next();
  res.status(401).json({ error: 'Acesso negado' });
}

// ── Rota: Upload de imagem ────────────────
router.post('/upload', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const hash = crypto.randomBytes(8).toString('hex');
    const filename = `${Date.now()}-${hash}${ext}`;

    await minioClient.putObject(
      BUCKET,
      filename,
      req.file.buffer,
      req.file.size,
      { 'Content-Type': req.file.mimetype }
    );

    const url = `${PUBLIC_URL}/${BUCKET}/${filename}`;
    res.json({ url, filename, size: req.file.size });
  } catch (err: any) {
    console.error('Erro upload MinIO:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Rota: Listar imagens ──────────────────
router.get('/list', authGallery, async (_req: Request, res: Response) => {
  try {
    const images: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET, '', true);

    stream.on('data', (obj) => {
      if (obj.name) {
        images.push({
          filename: obj.name,
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

    stream.on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rota: Deletar imagem ──────────────────
router.delete('/delete/:filename', authGallery, async (req: Request, res: Response) => {
  try {
    await minioClient.removeObject(BUCKET, req.params.filename);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rota: Interface HTML da galeria ───────
router.get('/', (req: Request, res: Response) => {
  res.send(galleryHTML());
});

export default router;

// ── HTML da Galeria ───────────────────────
function galleryHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartPrice — Galeria de Imagens</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #13131a;
    --border: #1e1e2e;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --text: #e2e8f0;
    --muted: #64748b;
    --success: #22c55e;
    --danger: #ef4444;
    --radius: 10px;
  }

  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* ── Login ── */
  #login-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }

  .login-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 380px;
    text-align: center;
  }

  .login-card .logo {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
  }

  .login-card .logo span { color: var(--accent); }

  .login-card p {
    color: var(--muted);
    font-size: 13px;
    margin-bottom: 28px;
  }

  .login-card input {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 14px;
    margin-bottom: 12px;
    outline: none;
    transition: border-color 0.2s;
  }

  .login-card input:focus { border-color: var(--accent); }

  .btn {
    width: 100%;
    padding: 12px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn:hover { background: var(--accent-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-msg {
    color: var(--danger);
    font-size: 13px;
    margin-top: 10px;
    display: none;
  }

  /* ── App ── */
  #app { display: none; }

  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .header-logo { font-size: 16px; font-weight: 700; }
  .header-logo span { color: var(--accent); }

  .header-actions { display: flex; gap: 10px; align-items: center; }

  .btn-sm {
    padding: 8px 16px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
    white-space: nowrap;
  }

  .btn-sm:hover { background: var(--accent-hover); }

  .btn-danger {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
  }

  .btn-danger:hover { background: var(--danger); color: #fff; }

  main { padding: 24px; max-width: 1400px; margin: 0 auto; }

  /* ── Upload Zone ── */
  .upload-zone {
    border: 2px dashed var(--border);
    border-radius: 16px;
    padding: 40px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    margin-bottom: 28px;
    position: relative;
  }

  .upload-zone:hover, .upload-zone.drag-over {
    border-color: var(--accent);
    background: rgba(59,130,246,0.05);
  }

  .upload-zone input[type="file"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .upload-icon { font-size: 36px; margin-bottom: 10px; }

  .upload-zone h3 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }

  .upload-zone p { font-size: 13px; color: var(--muted); }

  /* ── Progress ── */
  .progress-bar {
    height: 4px;
    background: var(--border);
    border-radius: 99px;
    margin-top: 16px;
    display: none;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 99px;
    width: 0%;
    transition: width 0.3s;
  }

  /* ── Stats ── */
  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 18px;
    font-size: 13px;
    color: var(--muted);
  }

  .stat strong { color: var(--text); font-size: 18px; display: block; }

  /* ── Search ── */
  .search-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
  }

  .search-bar input {
    flex: 1;
    padding: 10px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }

  .search-bar input:focus { border-color: var(--accent); }

  /* ── Grid ── */
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
  }

  .img-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color 0.2s, transform 0.15s;
    position: relative;
  }

  .img-card:hover { border-color: var(--accent); transform: translateY(-2px); }

  .img-card img {
    width: 100%;
    height: 150px;
    object-fit: cover;
    display: block;
    background: var(--bg);
  }

  .img-card .card-body {
    padding: 10px;
  }

  .img-card .filename {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 8px;
  }

  .img-card .card-actions { display: flex; gap: 6px; }

  .img-card .card-actions button {
    flex: 1;
    padding: 6px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-copy {
    background: var(--accent);
    color: #fff;
  }

  .btn-del {
    background: transparent;
    border: 1px solid var(--danger) !important;
    color: var(--danger);
  }

  .btn-copy:hover, .btn-del:hover { opacity: 0.85; }

  /* ── Toast ── */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--success);
    color: #fff;
    padding: 12px 20px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    z-index: 999;
    transform: translateY(80px);
    opacity: 0;
    transition: all 0.3s;
  }

  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.error { background: var(--danger); }

  /* ── Empty ── */
  .empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--muted);
    display: none;
  }

  .empty p { margin-top: 10px; font-size: 14px; }

  .loading { text-align: center; padding: 40px; color: var(--muted); }
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
      <span id="header-count" style="font-size:13px;color:var(--muted)"></span>
      <button class="btn-sm" onclick="document.getElementById('file-input').click()">+ Upload</button>
    </div>
  </header>

  <main>
    <!-- Upload Zone -->
    <div class="upload-zone" id="drop-zone">
      <input type="file" id="file-input" accept="image/*" multiple onchange="handleFiles(this.files)">
      <div class="upload-icon">🖼️</div>
      <h3>Arraste imagens aqui ou clique para selecionar</h3>
      <p>PNG, JPG, WEBP, GIF, SVG — até 100MB por arquivo</p>
      <div class="progress-bar" id="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </div>

    <!-- Stats -->
    <div class="stats">
      <div class="stat"><strong id="stat-total">0</strong>Imagens</div>
      <div class="stat"><strong id="stat-size">0 MB</strong>Total</div>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Buscar imagem pelo nome..." oninput="filterImages()">
    </div>

    <!-- Grid -->
    <div class="gallery-grid" id="gallery-grid">
      <div class="loading">Carregando imagens...</div>
    </div>

    <div class="empty" id="empty-state">
      <div style="font-size:48px">📭</div>
      <p>Nenhuma imagem encontrada</p>
    </div>
  </main>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
  let token = '';
  let allImages = [];

  // ── Login ──────────────────────────────
  function doLogin() {
    const pwd = document.getElementById('pwd-input').value;
    token = pwd;
    fetch('/gallery/list', { headers: { 'x-gallery-token': token } })
      .then(r => {
        if (r.status === 401) throw new Error('unauthorized');
        return r.json();
      })
      .then(data => {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        renderImages(data);
      })
      .catch(() => {
        document.getElementById('login-error').style.display = 'block';
        token = '';
      });
  }

  // ── Load images ────────────────────────
  function loadImages() {
    fetch('/gallery/list', { headers: { 'x-gallery-token': token } })
      .then(r => r.json())
      .then(renderImages);
  }

  function renderImages(images) {
    allImages = images;
    updateStats(images);
    filterImages();
  }

  function filterImages() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const filtered = allImages.filter(img => img.filename.toLowerCase().includes(q));
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('empty-state');

    if (filtered.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    grid.innerHTML = filtered.map(img => \`
      <div class="img-card" id="card-\${img.filename.replace(/[^a-z0-9]/gi,'_')}">
        <img src="\${img.url}" alt="\${img.filename}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"200\\" height=\\"150\\"><rect fill=\\"%231e1e2e\\" width=\\"200\\" height=\\"150\\"/><text fill=\\"%2364748b\\" x=\\"50%\\" y=\\"50%\\" text-anchor=\\"middle\\" dy=\\".3em\\" font-size=\\"12\\">Erro ao carregar</text></svg>'">
        <div class="card-body">
          <div class="filename">\${img.filename}</div>
          <div class="card-actions">
            <button class="btn-copy" onclick="copyUrl('\${img.url}')">📋 Copiar URL</button>
            <button class="btn-del" onclick="deleteImage('\${img.filename}')">🗑️</button>
          </div>
        </div>
      </div>
    \`).join('');
  }

  function updateStats(images) {
    const totalSize = images.reduce((acc, img) => acc + (img.size || 0), 0);
    document.getElementById('stat-total').textContent = images.length;
    document.getElementById('stat-size').textContent = (totalSize / (1024 * 1024)).toFixed(1) + ' MB';
    document.getElementById('header-count').textContent = images.length + ' imagens';
  }

  // ── Upload ─────────────────────────────
  async function handleFiles(files) {
    if (!files.length) return;
    const bar = document.getElementById('progress-bar');
    const fill = document.getElementById('progress-fill');
    bar.style.display = 'block';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      fill.style.width = Math.round(((i) / files.length) * 100) + '%';

      const fd = new FormData();
      fd.append('image', file);

      try {
        const res = await fetch('/gallery/upload', {
          method: 'POST',
          headers: { 'x-gallery-token': token },
          body: fd
        });
        const data = await res.json();
        if (data.url) {
          showToast('✅ ' + file.name + ' enviada!');
        } else {
          showToast('❌ Erro: ' + (data.error || 'Falha no upload'), true);
        }
      } catch (e) {
        showToast('❌ Erro no upload', true);
      }
    }

    fill.style.width = '100%';
    setTimeout(() => { bar.style.display = 'none'; fill.style.width = '0%'; }, 800);
    loadImages();
    document.getElementById('file-input').value = '';
  }

  // ── Copy URL ───────────────────────────
  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => showToast('📋 URL copiada!'));
  }

  // ── Delete ─────────────────────────────
  function deleteImage(filename) {
    if (!confirm('Deletar esta imagem?')) return;
    fetch('/gallery/delete/' + encodeURIComponent(filename), {
      method: 'DELETE',
      headers: { 'x-gallery-token': token }
    }).then(r => r.json()).then(data => {
      if (data.success) {
        allImages = allImages.filter(img => img.filename !== filename);
        renderImages(allImages);
        showToast('🗑️ Imagem deletada');
      }
    });
  }

  // ── Toast ──────────────────────────────
  function showToast(msg, error = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (error ? ' error' : '');
    setTimeout(() => t.className = 'toast', 3000);
  }

  // ── Drag & Drop ────────────────────────
  const zone = document.getElementById('drop-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
</script>
</body>
</html>`;
}
