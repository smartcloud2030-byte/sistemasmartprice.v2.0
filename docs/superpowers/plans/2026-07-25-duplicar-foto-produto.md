# Duplicar foto do produto (efeito "2 unidades") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a rota de upload de imagem de produto (`/gallery/upload-nobg2/:category`) detectar automaticamente se a foto já não tem fundo (pulando o rembg quando desnecessário) e, quando o admin marcar a opção "Duplicar foto" no cadastro, compor a imagem final com 2 unidades do produto sobrepostas, sem usar nenhuma IA generativa.

**Architecture:** Dois módulos novos e independentes em `src/` (`backgroundDetect.ts` e `duplicateComposite.ts`), cada um só usando `sharp` (já é dependência do projeto) e testável isoladamente com scripts standalone (o projeto não tem framework de testes — `tsc --noEmit` é o único "lint" hoje). A rota `upload-nobg2` em `src/gallery.ts` passa a usar os dois módulos. O frontend (`ProductManager.tsx`) ganha um único checkbox novo ("Duplicar foto"), desmarcado por padrão.

**Tech Stack:** TypeScript, Express, `sharp` (processamento de imagem), `tsx` (rodar scripts/testes `.ts` diretamente, já é devDependency), React (frontend).

## Global Constraints

- Sem IA generativa nova, sem chave de API nova, sem dependência nova — spec em `docs/superpowers/specs/2026-07-25-duplicar-foto-produto-design.md`.
- Escopo só a rota `POST /gallery/upload-nobg2/:category`; nenhuma outra rota de galeria muda.
- Checkbox "Duplicar foto" desmarcado por padrão em qualquer fluxo (manual ou código de barras).
- Detecção de fundo é 100% automática no servidor — não existe mais checkbox manual "Remover fundo".
- Projeto não tem framework de teste instalado; testes deste plano são scripts standalone rodados via `npx tsx`, usando `node:assert`.
- Testar tudo localmente (`npm run dev`) antes de qualquer commit/deploy — preferência já registrada do usuário.

---

### Task 1: Detecção automática de fundo (`isAlreadyCutOut`)

**Files:**
- Create: `src/backgroundDetect.ts`
- Test: `src/backgroundDetect.test.ts`

**Interfaces:**
- Produces: `isAlreadyCutOut(buffer: Buffer): Promise<boolean>` — `true` se a imagem já não tem fundo (não precisa passar pelo rembg), `false` se tem fundo (precisa rodar o rembg).

- [ ] **Step 1: Escrever o teste (vai falhar por o módulo ainda não existir)**

Criar `src/backgroundDetect.test.ts`:

```ts
import assert from 'node:assert';
import sharp from 'sharp';
import { isAlreadyCutOut } from './backgroundDetect';

async function opaqueJpegHasBackground() {
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg().toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, false, 'JPEG opaco (sem canal alfa) deveria ser detectado como COM fundo');
}

async function transparentPngIsAlreadyCutOut() {
  const opaqueCore = await sharp({
    create: { width: 6, height: 6, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
  const buffer = await sharp(opaqueCore)
    .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, true, 'PNG com pixels totalmente transparentes deveria ser detectado como JA sem fundo');
}

async function opaquePngWithAlphaChannelHasBackground() {
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, false, 'PNG com canal alfa mas 100% opaco deveria ser detectado como COM fundo');
}

async function main() {
  await opaqueJpegHasBackground();
  await transparentPngIsAlreadyCutOut();
  await opaquePngWithAlphaChannelHasBackground();
  console.log('PASS: todos os testes de backgroundDetect passaram');
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/backgroundDetect.test.ts`
Expected: erro do tipo `Cannot find module './backgroundDetect'` (o módulo ainda não existe).

- [ ] **Step 3: Implementar `isAlreadyCutOut`**

Criar `src/backgroundDetect.ts`:

```ts
import sharp from 'sharp';

// Se a imagem tem canal alfa com pixels totalmente transparentes (min === 0),
// ela já veio recortada (sem fundo) antes — não precisa passar pelo rembg de novo.
// Sem canal alfa, ou com alfa 100% opaco (min === 255), ainda tem fundo.
export async function isAlreadyCutOut(buffer: Buffer): Promise<boolean> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) return false;

  const { channels } = await image.stats();
  const alphaChannel = channels[channels.length - 1];
  return alphaChannel.min === 0;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/backgroundDetect.test.ts`
Expected: `PASS: todos os testes de backgroundDetect passaram`, exit code 0.

- [ ] **Step 5: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos relacionados a `src/backgroundDetect.ts` ou `src/backgroundDetect.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/backgroundDetect.ts src/backgroundDetect.test.ts
git commit -m "feat: deteccao automatica de fundo (isAlreadyCutOut)"
```

---

### Task 2: Composição da imagem duplicada (`composeDuplicate`)

**Files:**
- Create: `src/duplicateComposite.ts`
- Test: `src/duplicateComposite.test.ts`

**Interfaces:**
- Consumes: nenhuma dependência de outras tasks.
- Produces: `composeDuplicate(buffer: Buffer): Promise<Buffer>` — recebe um PNG/WEBP com canal alfa (produto já sem fundo) e devolve um novo buffer PNG com 2 cópias do produto sobrepostas + sombra. Lança erro se a imagem de entrada não puder ser processada (buffer inválido/corrompido) — quem chama essa função decide o que fazer no catch (task 3 usa fallback pra imagem original).

- [ ] **Step 1: Escrever o teste (vai falhar por o módulo ainda não existir)**

Criar `src/duplicateComposite.test.ts`:

```ts
import assert from 'node:assert';
import sharp from 'sharp';
import { composeDuplicate } from './duplicateComposite';

async function opaqueCoreWithTransparentPadding(): Promise<Buffer> {
  const core = await sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: 0, g: 120, b: 200 } },
  }).png().toBuffer();
  return sharp(core)
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function producesLargerTransparentComposite() {
  const input = await opaqueCoreWithTransparentPadding();

  const result = await composeDuplicate(input);
  const resultMeta = await sharp(result).metadata();

  assert.strictEqual(resultMeta.format, 'png', 'saida deveria ser PNG');
  assert.strictEqual(resultMeta.hasAlpha, true, 'saida deveria manter canal alfa');
  // A imagem original tem 40x60 de produto (sem contar a margem transparente que
  // foi extendida). A composicao com 2 copias deslocadas sempre fica maior que
  // isso em largura e altura.
  assert.ok((resultMeta.width || 0) > 40, 'composicao deveria ser mais larga que o produto recortado sozinho (40px)');
  assert.ok((resultMeta.height || 0) > 60, 'composicao deveria ser mais alta que o produto recortado sozinho (60px)');
}

async function throwsOnInvalidBuffer() {
  await assert.rejects(
    () => composeDuplicate(Buffer.from('nao e uma imagem de verdade')),
    'buffer invalido deveria fazer composeDuplicate rejeitar a promise'
  );
}

async function main() {
  await producesLargerTransparentComposite();
  await throwsOnInvalidBuffer();
  console.log('PASS: todos os testes de duplicateComposite passaram');
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/duplicateComposite.test.ts`
Expected: erro do tipo `Cannot find module './duplicateComposite'`.

- [ ] **Step 3: Implementar `composeDuplicate`**

Criar `src/duplicateComposite.ts`:

```ts
import sharp from 'sharp';

const BACK_SCALE = 0.85;
const BACK_ROTATION_DEG = -8;
const FRONT_ROTATION_DEG = 3;
const OFFSET_X_RATIO = 0.16;
const OFFSET_Y_RATIO = 0.12;
const MARGIN_RATIO = 0.25;
const SHADOW_BLUR_SIGMA = 8;
const SHADOW_OPACITY = 0.35;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 14;

// Recorta o produto, cria uma copia "de tras" (menor, rotacionada) e uma copia
// "da frente" (tamanho original, levemente rotacionada), com uma sombra suave
// atras da copia da frente, e compoe tudo num canvas transparente maior.
// Deterministico: mesmos pixels reais do produto, nunca inventa/distorce o rotulo.
export async function composeDuplicate(buffer: Buffer): Promise<Buffer> {
  const trimmed = await sharp(buffer).trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  if (!width || !height) {
    throw new Error('composeDuplicate: imagem recortada ficou sem dimensoes validas');
  }

  const backCopy = await sharp(trimmed)
    .resize(Math.round(width * BACK_SCALE), Math.round(height * BACK_SCALE))
    .rotate(BACK_ROTATION_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const backMeta = await sharp(backCopy).metadata();
  if (!backMeta.width || !backMeta.height) {
    throw new Error('composeDuplicate: falha ao gerar a copia de tras');
  }

  const frontCopy = await sharp(trimmed)
    .rotate(FRONT_ROTATION_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const frontMeta = await sharp(frontCopy).metadata();
  if (!frontMeta.width || !frontMeta.height) {
    throw new Error('composeDuplicate: falha ao gerar a copia da frente');
  }

  // Sombra: silhueta preta solida (RGB preto + canal alfa da copia da frente),
  // borrada e com opacidade reduzida.
  const alphaMask = await sharp(frontCopy).extractChannel('alpha').toBuffer();
  const shadowBase = await sharp({
    create: { width: frontMeta.width, height: frontMeta.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .joinChannel(alphaMask)
    .png()
    .toBuffer();
  const shadowLayer = await sharp(shadowBase)
    .blur(SHADOW_BLUR_SIGMA)
    .linear([1, 1, 1, SHADOW_OPACITY], [0, 0, 0, 0])
    .toBuffer();

  const offsetX = Math.round(width * OFFSET_X_RATIO);
  const offsetY = Math.round(height * OFFSET_Y_RATIO);
  const margin = Math.round(Math.max(width, height) * MARGIN_RATIO);

  const backLeft = margin;
  const backTop = margin;
  const frontLeft = margin + offsetX;
  const frontTop = margin + offsetY;

  const canvasWidth = Math.max(backLeft + backMeta.width, frontLeft + frontMeta.width) + margin;
  const canvasHeight = Math.max(backTop + backMeta.height, frontTop + frontMeta.height) + margin;

  return sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadowLayer, left: frontLeft + SHADOW_OFFSET_X, top: frontTop + SHADOW_OFFSET_Y },
      { input: backCopy, left: backLeft, top: backTop },
      { input: frontCopy, left: frontLeft, top: frontTop },
    ])
    .png()
    .toBuffer();
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/duplicateComposite.test.ts`
Expected: `PASS: todos os testes de duplicateComposite passaram`, exit code 0.

- [ ] **Step 5: Conferir visualmente o resultado**

Rodar um script rápido pra salvar um PNG de exemplo e olhar o resultado:

```bash
npx tsx -e "
import('./src/duplicateComposite').then(async ({ composeDuplicate }) => {
  const sharp = (await import('sharp')).default;
  const core = await sharp({ create: { width: 120, height: 180, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
  const cutout = await sharp(core).extend({ top: 15, bottom: 15, left: 15, right: 15, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const result = await composeDuplicate(cutout);
  await sharp(result).toFile('_preview_duplicate.png');
  console.log('salvo em _preview_duplicate.png');
});
"
```

Abrir `_preview_duplicate.png` e confirmar visualmente que parece 2 unidades sobrepostas com sombra (não precisa ficar pixel-perfeito — se os ângulos/deslocamentos não agradarem, ajustar as constantes no topo de `src/duplicateComposite.ts` e repetir este step). Depois, apagar o arquivo de preview (`rm _preview_duplicate.png`) — não deve ser commitado.

- [ ] **Step 6: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos relacionados a `src/duplicateComposite.ts` ou `src/duplicateComposite.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/duplicateComposite.ts src/duplicateComposite.test.ts
git commit -m "feat: composicao deterministica de foto duplicada (composeDuplicate)"
```

---

### Task 3: Ligar os dois módulos na rota `upload-nobg2`

**Files:**
- Modify: `src/gallery.ts:1003-1046`

**Interfaces:**
- Consumes: `isAlreadyCutOut(buffer: Buffer): Promise<boolean>` (Task 1), `composeDuplicate(buffer: Buffer): Promise<Buffer>` (Task 2).
- Produces: rota `POST /gallery/upload-nobg2/:category` passa a aceitar um campo de form-data `duplicate` (`"true"` ativa a composição). Resposta JSON (`{ url, thumbUrl, filename, size }`) não muda de formato.

- [ ] **Step 1: Adicionar os imports no topo de `src/gallery.ts`**

Adicionar junto aos outros imports (perto da linha 14, depois de `import { Pool } from 'pg';`):

```ts
import { isAlreadyCutOut } from './backgroundDetect';
import { composeDuplicate } from './duplicateComposite';
```

- [ ] **Step 2: Substituir o corpo da rota `upload-nobg2`**

Em `src/gallery.ts`, o bloco atual (linhas 1003-1046) é:

```ts
router.post('/upload-nobg2/:category', authGallery, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const category = req.params.category;

  try {
    // Envia para o microserviço rembg (processo já rodando, modelo pré-carregado).
    // Esse microserviço só existe na VPS (fora deste repo/compose) — em dev local
    // ele não roda, então cai no fallback abaixo (usa a imagem original sem
    // remover fundo) em vez de quebrar o cadastro inteiro por causa disso.
    let rembgBuffer: Buffer;
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
  }
});
```

Substituir por:

```ts
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
```

- [ ] **Step 3: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Testar manualmente contra o servidor local**

Subir o dev server:

Run: `npm run dev`
Expected: log mostrando o servidor rodando (ex: `http://localhost:3000` ou porta configurada em `.env`).

Em outro terminal, com o servidor rodando, testar a rota direto com curl (usar o mesmo token que `VITE_GALLERY_PASSWORD` no `.env` local, ou o padrão `smartprice@admin2026` se a env var não estiver setada):

```bash
curl -s -X POST http://localhost:3000/gallery/upload-nobg2/padrao \
  -H "x-gallery-token: smartprice@admin2026" \
  -F "name=teste-duplicado" \
  -F "duplicate=true" \
  -F "image=@caminho/para/uma/foto.jpg" | node -e "process.stdin.on('data', d => console.log(d.toString()))"
```

Expected: resposta JSON com `url` e `thumbUrl` apontando pro MinIO local, sem erro 500. Se o MinIO local não estiver rodando (`docker compose up minio` ou equivalente do projeto), subir ele antes de testar.

Testar de novo sem duplicar, pra garantir que o caminho antigo continua funcionando:

```bash
curl -s -X POST http://localhost:3000/gallery/upload-nobg2/padrao \
  -H "x-gallery-token: smartprice@admin2026" \
  -F "name=teste-normal" \
  -F "image=@caminho/para/uma/foto.jpg" | node -e "process.stdin.on('data', d => console.log(d.toString()))"
```

Expected: resposta JSON igual, imagem sem o efeito de duplicação.

- [ ] **Step 5: Commit**

```bash
git add src/gallery.ts
git commit -m "feat: deteccao automatica de fundo e duplicacao opcional na rota upload-nobg2"
```

---

### Task 4: Checkbox "Duplicar foto" no cadastro

**Files:**
- Modify: `src/components/ProductManager.tsx:45-61` (função `uploadToMinio`)
- Modify: `src/components/ProductManager.tsx:70` (state, perto de `pendingFile`)
- Modify: `src/components/ProductManager.tsx:218-245` (`doUpload`)
- Modify: `src/components/ProductManager.tsx:257-262,276-277` (`handleSubmit`)
- Modify: `src/components/ProductManager.tsx:543-571` (seção "Imagem" do modal)

**Interfaces:**
- Consumes: rota `POST /gallery/upload-nobg2/:category` (Task 3) — agora aceita campo `duplicate`.
- Produces: nenhuma interface nova consumida por outro código; é a ponta final da feature.

- [ ] **Step 1: Adicionar o state `duplicateOption`**

Em `src/components/ProductManager.tsx`, na linha 70 (junto do `pendingFile`):

```ts
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [duplicateOption, setDuplicateOption] = useState(false);
```

- [ ] **Step 2: Passar o flag pra `uploadToMinio`**

Substituir a função `uploadToMinio` (linhas 45-61):

```ts
async function uploadToMinio(file: File, category: string, productName: string): Promise<{ url: string; thumbUrl: string }> {
  const folder = getFolder(category);
  const formData = new FormData();
  formData.append('image', file);
  formData.append('name', productName || '');
  const res = await fetch(`/gallery/upload-nobg2/${folder}`, {
    method: 'POST',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload');
  }
  const data = await res.json();
  return { url: data.url || '', thumbUrl: data.thumbUrl || data.url || '' };
}
```

por:

```ts
async function uploadToMinio(file: File, category: string, productName: string, duplicate: boolean): Promise<{ url: string; thumbUrl: string }> {
  const folder = getFolder(category);
  const formData = new FormData();
  formData.append('image', file);
  formData.append('name', productName || '');
  formData.append('duplicate', duplicate ? 'true' : 'false');
  const res = await fetch(`/gallery/upload-nobg2/${folder}`, {
    method: 'POST',
    headers: { 'x-gallery-token': GALLERY_PASSWORD },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Falha no upload');
  }
  const data = await res.json();
  return { url: data.url || '', thumbUrl: data.thumbUrl || data.url || '' };
}
```

- [ ] **Step 3: Passar o flag por `doUpload` até `uploadToMinio`**

Em `doUpload` (linhas 218-245), mudar a assinatura e a chamada:

```ts
  const doUpload = async (file: File, category: string, name: string): Promise<{ url: string; thumbUrl: string } | null> => {
```
vira:
```ts
  const doUpload = async (file: File, category: string, name: string, duplicate: boolean): Promise<{ url: string; thumbUrl: string } | null> => {
```

E dentro do `try`, trocar:
```ts
      const result = await uploadToMinio(file, category, name);
```
por:
```ts
      const result = await uploadToMinio(file, category, name, duplicate);
```

Também ajustar os steps de progresso pra refletirem melhor o que está rolando — trocar o array `steps` (linhas 222-227):
```ts
    const steps = [
      { p: 20, l: 'Enviando para o servidor...' },
      { p: 40, l: 'Removendo fundo com IA...' },
      { p: 65, l: 'Processando...' },
      { p: 80, l: 'Quase pronto...' },
    ];
```
por:
```ts
    const steps = duplicate
      ? [
          { p: 20, l: 'Enviando para o servidor...' },
          { p: 40, l: 'Verificando fundo da imagem...' },
          { p: 60, l: 'Duplicando foto...' },
          { p: 80, l: 'Quase pronto...' },
        ]
      : [
          { p: 20, l: 'Enviando para o servidor...' },
          { p: 40, l: 'Verificando fundo da imagem...' },
          { p: 65, l: 'Processando...' },
          { p: 80, l: 'Quase pronto...' },
        ];
```

- [ ] **Step 4: Passar `duplicateOption` no `handleSubmit` e resetar após salvar**

Em `handleSubmit` (linhas 257-262), trocar:
```ts
    if (pendingFile) {
      const result = await doUpload(pendingFile, formData.category, formData.name);
      if (!result) return;
      finalImage = result.url;
      finalThumb = result.thumbUrl;
    }
```
por:
```ts
    if (pendingFile) {
      const result = await doUpload(pendingFile, formData.category, formData.name, duplicateOption);
      if (!result) return;
      finalImage = result.url;
      finalThumb = result.thumbUrl;
    }
```

E logo depois (linhas 276-277), onde reseta `pendingFile` após salvar com sucesso:
```ts
      setPendingFile(null);
```
vira:
```ts
      setPendingFile(null);
      setDuplicateOption(false);
```

- [ ] **Step 5: Adicionar o checkbox na seção "Imagem" do modal**

Em `src/components/ProductManager.tsx`, dentro da seção "Imagem" (linhas 543-571), o bloco:

```tsx
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Imagem</p>
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-20 h-20 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center relative">
                      {formData.image ? (
                        <>
                          <img src={formData.image.startsWith('blob:') ? formData.image : getProxyUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                          <button type="button" onClick={() => { setFormData({ ...formData, image: null }); setPendingFile(null); }}
                            className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </>
                      ) : <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-xs text-blue-600 font-medium truncate">
                          {pendingFile ? `✓ ${pendingFile.name}` : 'Selecionar imagem (remove fundo ao salvar)'}
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }} />
                      </label>
                      <input type="text" placeholder="ou cole a URL aqui"
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                        value={formData.image?.startsWith('blob:') ? '' : (formData.image || '')}
                        onChange={e => { setPendingFile(null); setFormData({ ...formData, image: e.target.value }); }} />
                    </div>
                  </div>
                </div>
```

vira (troca só o texto do label de upload e acrescenta o checkbox no fim, antes do `</div>` de fechamento da div `space-y-2`):

```tsx
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Imagem</p>
                  <div className="flex gap-3 items-start">
                    <div className="shrink-0 w-20 h-20 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center relative">
                      {formData.image ? (
                        <>
                          <img src={formData.image.startsWith('blob:') ? formData.image : getProxyUrl(formData.image)} alt="Preview" className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                          <button type="button" onClick={() => { setFormData({ ...formData, image: null }); setPendingFile(null); }}
                            className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </>
                      ) : <Package className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <label className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="text-xs text-blue-600 font-medium truncate">
                          {pendingFile ? `✓ ${pendingFile.name}` : 'Selecionar imagem'}
                        </span>
                        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectFile(f); }} />
                      </label>
                      <input type="text" placeholder="ou cole a URL aqui"
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                        value={formData.image?.startsWith('blob:') ? '' : (formData.image || '')}
                        onChange={e => { setPendingFile(null); setFormData({ ...formData, image: e.target.value }); }} />
                      {pendingFile && (
                        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                          <input type="checkbox" checked={duplicateOption} onChange={e => setDuplicateOption(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500" />
                          Duplicar foto (2 unidades sobrepostas)
                        </label>
                      )}
                    </div>
                  </div>
                </div>
```

Nota: o checkbox só aparece quando existe uma foto pendente de upload (`pendingFile`) — não faz sentido mostrar a opção quando não há imagem nova pra processar (ex: editando um produto sem trocar a foto). Isso já é consistente com o fato de o campo `duplicate` só ser usado dentro de `doUpload`, que só roda quando `pendingFile` existe.

- [ ] **Step 6: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 7: Testar manualmente no navegador**

Run: `npm run dev`

No navegador, abrir o cadastro de produto (como admin):
1. Selecionar uma categoria, escolher uma imagem manualmente → confirmar que o checkbox "Duplicar foto" aparece, desmarcado.
2. Marcar o checkbox, cadastrar o produto → confirmar no preview/galeria que a imagem final tem o efeito de 2 unidades.
3. Repetir sem marcar o checkbox → confirmar que sobe só 1 unidade (comportamento de hoje, mas agora só remove fundo se a detecção automática achar que tem fundo).
4. Testar o fluxo de busca por código de barras → confirmar que o checkbox aparece do mesmo jeito (desmarcado) depois que a foto é baixada, e que marcar/desmarcar funciona igual ao fluxo manual.

Expected: os 4 cenários funcionam sem erro no console e a imagem final bate com o esperado em cada caso.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: checkbox Duplicar foto no cadastro de produto"
```

---

### Task 5: Verificação final ponta-a-ponta

**Files:** nenhum arquivo novo — só verificação manual.

- [ ] **Step 1: Rodar a suíte completa de scripts de teste**

```bash
npx tsx src/backgroundDetect.test.ts && npx tsx src/duplicateComposite.test.ts
```

Expected: as duas linhas `PASS: ...` aparecem, exit code 0.

- [ ] **Step 2: Rodar o lint do projeto inteiro**

```bash
npm run lint
```

Expected: sem erros.

- [ ] **Step 3: Fluxo completo no navegador (dev server rodando)**

Repetir o roteiro de teste do spec (`docs/superpowers/specs/2026-07-25-duplicar-foto-produto-design.md`, seção "Teste"):
1. Cadastro manual, foto com fundo, "Duplicar" desmarcado → remove fundo, sobe 1 unidade.
2. Cadastro manual, foto com fundo, "Duplicar" marcado → sobe já composta com 2 unidades.
3. Cadastro manual, foto já sem fundo (PNG transparente), qualquer opção de duplicar → confirmar que o rembg NÃO é chamado (checar o log do servidor, não deve aparecer o warning de "microserviço rembg indisponível" nem a chamada — como não tem esse microserviço em dev, a ausência do log de erro rembg é o sinal de que a detecção pulou a chamada).
4. Cadastro via código de barras, com e sem "Duplicar" marcado.

- [ ] **Step 4: Não fazer deploy ainda**

Não subir pra VPS nesta task — combinar com o usuário antes, seguindo a preferência já registrada de só dar push/deploy quando pedido explicitamente.
