# Despesas de viagem — Fase 4 (webhook WhatsApp + bucket privado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O José manda a foto da nota no WhatsApp (número dedicado, Meta Cloud
API). O sistema valida a origem, baixa a imagem, guarda num bucket privado do
MinIO, cria a despesa na **viagem aberta** dele, roda a extração da fase 3 e
responde um card com o que leu. A imagem fica visível na aba Viagens do
SmartPrice.

Fora de escopo desta fase (vai pra fase 5): comandos por texto
(`nova viagem`, `fechar viagem`), o loop de confirmação `ok`/correção, e a
máquina de estados da conversa. A fase 4 é o caminho feliz **foto → despesa
extraída → aviso**.

**Architecture:** Router novo `src/whatsappBot.ts` montado em `/api/whatsapp`
(Pool próprio, padrão do `src/monitoring.ts`), com `GET /webhook`
(verificação) e `POST /webhook` (mensagens). As partes puras — validar a
assinatura HMAC e desmontar o JSON aninhado da Meta — ficam em
`src/lib/whatsappWebhook.ts`, testáveis. O armazenamento e a assinatura de URL
dos recibos ficam em `src/lib/recibos.ts` (bucket privado `smartprice-recibos`,
cliente MinIO próprio; URL assinada pelo backend, não presigned do MinIO, pra
funcionar igual local e em produção sem depender de proxy). Reaproveita
`extrairRecibo` (fase 3). O `server.ts` passa a capturar o corpo cru
(`express.json({ verify })`) pra validação de assinatura.

**Tech Stack:** TypeScript, Express, `pg`, `minio` (já no projeto), `crypto`
(nativo), `fetch` global. Sem dependência nova. Testes: `tsx` + `node:assert`.

**Spec:** `docs/superpowers/specs/2026-09-09-despesas-viagem-whatsapp-design.md`
**Fases 1-3:** `.../plans/2026-09-09-despesas-viagem-fase{1,2,3}.md`

## Global Constraints

- **Validação de assinatura obrigatória.** `X-Hub-Signature-256` =
  `sha256=` + HMAC-SHA256(`WHATSAPP_APP_SECRET`, corpo cru). Comparação com
  `crypto.timingSafeEqual`. Assinatura inválida → 401, nada é processado.
- **Idempotência por `message.id`** (`whatsapp_inbound_log.message_id UNIQUE`).
  A Meta re-entrega; mensagem repetida é ignorada em silêncio.
- **Allowlist.** Só número em `whatsapp_sessions.autorizado = true` cria dado.
  Número desconhecido → responde "não autorizado" e para. Seed a partir de
  `WHATSAPP_ALLOWED_NUMBERS` (csv) no `ensureWhatsappSchema()`.
- **Responder 200 na hora** e processar o resto em background (a Meta re-envia
  se não receber 200 em ~5s; baixar mídia + Claude leva 10-20s).
- **`valor_centavos` passa a ser NULLABLE** (`ALTER ... DROP NOT NULL`,
  idempotente): a despesa nasce sem valor quando vem por foto e é preenchida
  pela extração. O POST manual da fase 1 continua exigindo `> 0`.
- **Recibos em bucket privado** `smartprice-recibos` (sem `mc anonymous set
  download`). A UI abre o recibo por
  `GET /api/despesas-viagem/recibo/:id?k=<assinatura>` — assinatura HMAC do
  `id` com `API_SECRET`, o backend faz stream do objeto. Nada de imagem de
  recibo em URL pública.
- **Sem viagem aberta (ou mais de uma)** → a fase 4 responde pedindo pra
  abrir/escolher no SmartPrice e **não cria** a despesa (a escolha de viagem
  por conversa é fase 5).
- Graph API version por env (`WHATSAPP_GRAPH_VERSION`, default `v22.0`).

---

### Task 1: Env + docker-compose

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: `.env.example`** — antes do bloco `# Node`, acrescentar:

```
# WhatsApp (Meta Cloud API) — captura de nota de despesa de viagem por foto.
# Precisa de um número dedicado + app na Meta (verificação business). Sem
# essas vars, o webhook responde 503 e o resto do módulo segue funcionando.
WHATSAPP_TOKEN=                      # System User token permanente
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=               # você inventa; cadastra no painel da Meta
WHATSAPP_APP_SECRET=                 # valida a assinatura do webhook
WHATSAPP_ALLOWED_NUMBERS=            # csv de números E.164 (ex.: 5599XXXXXXXXX)
WHATSAPP_GRAPH_VERSION=v22.0
MINIO_BUCKET_RECIBOS=smartprice-recibos
```

- [ ] **Step 2: `docker-compose.yml`** — no `environment:` do serviço `app`,
  junto das outras vars:

```yaml
      WHATSAPP_TOKEN: ${WHATSAPP_TOKEN}
      WHATSAPP_PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID}
      WHATSAPP_VERIFY_TOKEN: ${WHATSAPP_VERIFY_TOKEN}
      WHATSAPP_APP_SECRET: ${WHATSAPP_APP_SECRET}
      WHATSAPP_ALLOWED_NUMBERS: ${WHATSAPP_ALLOWED_NUMBERS}
      WHATSAPP_GRAPH_VERSION: ${WHATSAPP_GRAPH_VERSION:-v22.0}
      MINIO_BUCKET_RECIBOS: ${MINIO_BUCKET_RECIBOS:-smartprice-recibos}
```

  E no `entrypoint` do serviço `minio_setup`, depois da linha do
  `smartprice-images`, acrescentar (sem tornar público):

```sh
        mc mb --ignore-existing local/smartprice-recibos;
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "chore: env e bucket privado (smartprice-recibos) pro webhook WhatsApp"
```

---

### Task 2: `src/lib/whatsappWebhook.ts` (partes puras + TDD)

**Files:**
- Create: `src/lib/whatsappWebhook.ts`
- Create: `src/lib/whatsappWebhook.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `export function verificarAssinatura(corpoCru: Buffer | string, header: string | undefined, appSecret: string): boolean`
  - `export interface MensagemRecebida { messageId: string; from: string; tipo: 'text' | 'image' | 'outro'; imageId?: string; caption?: string; texto?: string }`
  - `export function parseWebhookPayload(body: any): MensagemRecebida[]`

- [ ] **Step 1: Teste que falha primeiro (`src/lib/whatsappWebhook.test.ts`)**

```ts
import assert from 'node:assert';
import crypto from 'node:crypto';
import { verificarAssinatura, parseWebhookPayload } from './whatsappWebhook';

const SEGREDO = 'top-secret';
function assina(corpo: string) {
  return 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(corpo).digest('hex');
}

function assinaturaValidaPassa() {
  const corpo = '{"a":1}';
  assert.strictEqual(verificarAssinatura(corpo, assina(corpo), SEGREDO), true);
}
function assinaturaInvalidaFalha() {
  assert.strictEqual(verificarAssinatura('{"a":1}', 'sha256=deadbeef', SEGREDO), false);
  assert.strictEqual(verificarAssinatura('{"a":1}', undefined, SEGREDO), false);
  assert.strictEqual(verificarAssinatura('{"a":1}', assina('{"a":2}'), SEGREDO), false);
}

const payloadImagem = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'wamid.ABC', from: '5599111111111', type: 'image',
          image: { id: 'MEDIA-1', caption: 'abastecimento', mime_type: 'image/jpeg' },
        }],
      },
    }],
  }],
};
const payloadTexto = {
  entry: [{ changes: [{ value: { messages: [{ id: 'wamid.T', from: '5599222', type: 'text', text: { body: 'oi' } }] } }] }],
};

function extraiImagem() {
  const [m] = parseWebhookPayload(payloadImagem);
  assert.strictEqual(m.messageId, 'wamid.ABC');
  assert.strictEqual(m.from, '5599111111111');
  assert.strictEqual(m.tipo, 'image');
  assert.strictEqual(m.imageId, 'MEDIA-1');
  assert.strictEqual(m.caption, 'abastecimento');
}
function extraiTexto() {
  const [m] = parseWebhookPayload(payloadTexto);
  assert.strictEqual(m.tipo, 'text');
  assert.strictEqual(m.texto, 'oi');
}
function payloadDeStatusOuVazioViraListaVazia() {
  assert.deepStrictEqual(parseWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  assert.deepStrictEqual(parseWebhookPayload({}), []);
  assert.deepStrictEqual(parseWebhookPayload(null), []);
}

try {
  assinaturaValidaPassa();
  assinaturaInvalidaFalha();
  extraiImagem();
  extraiTexto();
  payloadDeStatusOuVazioViraListaVazia();
  console.log('PASS: todos os testes de whatsappWebhook passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar → falha** (`Cannot find module './whatsappWebhook'`).

- [ ] **Step 3: Implementar `src/lib/whatsappWebhook.ts`**

```ts
// ─────────────────────────────────────────
// whatsappWebhook.ts — partes puras do webhook da Meta Cloud API:
// validação da assinatura HMAC e leitura do payload aninhado.
// ─────────────────────────────────────────
import crypto from 'node:crypto';

export function verificarAssinatura(
  corpoCru: Buffer | string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(corpoCru).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface MensagemRecebida {
  messageId: string;
  from: string;
  tipo: 'text' | 'image' | 'outro';
  imageId?: string;
  caption?: string;
  texto?: string;
}

export function parseWebhookPayload(body: any): MensagemRecebida[] {
  const out: MensagemRecebida[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const msgs = Array.isArray(ch?.value?.messages) ? ch.value.messages : [];
      for (const m of msgs) {
        if (!m?.id || !m?.from) continue;
        if (m.type === 'image') {
          out.push({
            messageId: m.id, from: String(m.from), tipo: 'image',
            imageId: m.image?.id, caption: m.image?.caption || undefined,
          });
        } else if (m.type === 'text') {
          out.push({ messageId: m.id, from: String(m.from), tipo: 'text', texto: m.text?.body || '' });
        } else {
          out.push({ messageId: m.id, from: String(m.from), tipo: 'outro' });
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Rodar → passa.** Adicionar
  ` && tsx src/lib/whatsappWebhook.test.ts` ao script `test`. `npm test` +
  `npm run lint` verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsappWebhook.ts src/lib/whatsappWebhook.test.ts package.json
git commit -m "feat: partes puras do webhook WhatsApp (assinatura HMAC + parse do payload)"
```

---

### Task 3: `src/lib/recibos.ts` (bucket privado + URL assinada)

**Files:**
- Create: `src/lib/recibos.ts`
- Create: `src/lib/recibos.test.ts` (só `assinarRecibo`/`conferirAssinaturaRecibo`)
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `export async function ensureBucketRecibos(): Promise<void>`
  - `export async function salvarRecibo(buffer: Buffer, contentType: string, viagemId: string): Promise<string>` (devolve a `key`)
  - `export function streamRecibo(key: string): Promise<NodeJS.ReadableStream>` + `export function statRecibo(key)` (pro endpoint fazer stream)
  - `export function assinarRecibo(despesaId: string): string`
  - `export function conferirAssinaturaRecibo(despesaId: string, assinatura: string): boolean`

- [ ] **Step 1: Teste (`src/lib/recibos.test.ts`)** — só a parte pura:

```ts
import assert from 'node:assert';
process.env.API_SECRET = process.env.API_SECRET || 'teste-secret';
import { assinarRecibo, conferirAssinaturaRecibo } from './recibos';

function assinaturaConfereConsigo() {
  const s = assinarRecibo('abc-123');
  assert.ok(s.length >= 16);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', s), true);
}
function assinaturaErradaOuDeOutroIdFalha() {
  const s = assinarRecibo('abc-123');
  assert.strictEqual(conferirAssinaturaRecibo('abc-124', s), false);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', s + 'x'), false);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', ''), false);
}
try {
  assinaturaConfereConsigo();
  assinaturaErradaOuDeOutroIdFalha();
  console.log('PASS: todos os testes de recibos (assinatura) passaram');
} catch (e: any) { console.error('FAIL:', e.message); process.exit(1); }
```

- [ ] **Step 2: Rodar → falha.**

- [ ] **Step 3: Implementar `src/lib/recibos.ts`**

```ts
// ─────────────────────────────────────────
// recibos.ts — armazenamento privado dos recibos de despesa de viagem.
// Bucket próprio (smartprice-recibos, SEM download anônimo). A UI abre o
// recibo por uma URL assinada pelo backend (HMAC do id da despesa com
// API_SECRET); o endpoint faz stream do objeto.
// ─────────────────────────────────────────
import * as Minio from 'minio';
import crypto from 'node:crypto';

const BUCKET = process.env.MINIO_BUCKET_RECIBOS || 'smartprice-recibos';

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

export async function ensureBucketRecibos(): Promise<void> {
  const existe = await client.bucketExists(BUCKET).catch(() => false);
  if (!existe) await client.makeBucket(BUCKET);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export async function salvarRecibo(buffer: Buffer, contentType: string, viagemId: string): Promise<string> {
  const ext = EXT[contentType] || 'bin';
  const key = `${viagemId}/${crypto.randomUUID()}.${ext}`;
  await client.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': contentType });
  return key;
}

export function statRecibo(key: string) {
  return client.statObject(BUCKET, key);
}
export function streamRecibo(key: string) {
  return client.getObject(BUCKET, key);
}

function segredo(): string {
  return process.env.API_SECRET || '';
}
export function assinarRecibo(despesaId: string): string {
  return crypto.createHmac('sha256', segredo()).update(`recibo:${despesaId}`).digest('hex').slice(0, 40);
}
export function conferirAssinaturaRecibo(despesaId: string, assinatura: string): boolean {
  if (!assinatura) return false;
  const esperado = assinarRecibo(despesaId);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Rodar → passa.** Adicionar ` && tsx src/lib/recibos.test.ts`
  ao script `test`. `npm test` + `npm run lint` verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recibos.ts src/lib/recibos.test.ts package.json
git commit -m "feat: armazenamento privado de recibos (bucket smartprice-recibos + URL assinada)"
```

---

### Task 4: `src/whatsappBot.ts` (router do webhook) + wiring

**Files:**
- Create: `src/whatsappBot.ts`
- Modify: `src/server.ts` → `server.ts` (import, `express.json({ verify })`, `app.use`, `ensure*` no boot)
- Modify: `src/despesasViagem.ts`:
  - `ensureDespesasViagemSchema`: `ALTER TABLE despesas_viagem ALTER COLUMN valor_centavos DROP NOT NULL;`
  - `GET /viagens/:id`: incluir `recibo_url` por despesa que tem `recibo_key`
  - novo `GET /recibo/:id?k=` (stream do objeto)

**Interfaces:**
- Produces:
  - `export default router` (Express), montado em `/api/whatsapp`
  - `export async function ensureWhatsappSchema(): Promise<void>`
  - `GET /api/whatsapp/webhook` — handshake `hub.challenge`
  - `POST /api/whatsapp/webhook` — recebe mensagens (200 imediato + processa async)

- [ ] **Step 1: `src/whatsappBot.ts`**

```ts
// ─────────────────────────────────────────
// whatsappBot.ts — webhook da Meta Cloud API pra captura de nota de despesa
// de viagem por foto. Fase 4: caminho feliz foto -> despesa extraída -> card.
// Comandos por texto e loop de confirmação são da fase 5.
// Pool próprio (padrão do src/monitoring.ts).
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { verificarAssinatura, parseWebhookPayload, type MensagemRecebida } from './lib/whatsappWebhook';
import { ensureBucketRecibos, salvarRecibo } from './lib/recibos';
import { extrairRecibo, IANaoConfiguradaError } from './lib/reciboExtract';

const router = Router();
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v22.0'}`;
const cfgOk = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET);

export async function ensureWhatsappSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      telefone         TEXT PRIMARY KEY,
      nome             TEXT,
      autorizado       BOOLEAN NOT NULL DEFAULT false,
      viagem_ativa_id  UUID,
      estado           JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_inbound_log (
      id            BIGSERIAL PRIMARY KEY,
      message_id    TEXT UNIQUE,
      telefone      TEXT,
      tipo          TEXT,
      payload       JSONB,
      processado_em TIMESTAMPTZ
    );
  `);
  const nums = (process.env.WHATSAPP_ALLOWED_NUMBERS || '')
    .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean);
  for (const n of nums) {
    await pool.query(
      `INSERT INTO whatsapp_sessions (telefone, autorizado) VALUES ($1, true)
       ON CONFLICT (telefone) DO UPDATE SET autorizado = true`,
      [n],
    );
  }
}

async function enviarTexto(telefone: string, texto: string) {
  if (!cfgOk()) return;
  await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'text', text: { body: texto } }),
  }).catch((e) => console.error('[whatsapp] enviarTexto:', e));
}

async function baixarMidia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const meta = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  }).then((r) => r.json());
  if (!meta?.url) throw new Error('mídia sem URL');
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const mime = bin.headers.get('content-type') || meta.mime_type || 'image/jpeg';
  const buffer = Buffer.from(await bin.arrayBuffer());
  return { buffer, mime };
}

const rotulo: Record<string, string> = {
  combustivel: 'Combustível', pedagio: 'Pedágio', refeicao: 'Refeição',
  hospedagem: 'Hospedagem', estacionamento: 'Estacionamento', manutencao: 'Manutenção', outros: 'Outros',
};
const brl = (c: number | null) =>
  c == null ? 'valor não lido' : 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function sessao(telefone: string) {
  const r = await pool.query(
    `INSERT INTO whatsapp_sessions (telefone) VALUES ($1)
     ON CONFLICT (telefone) DO UPDATE SET updated_at = now() RETURNING *`,
    [telefone],
  );
  return r.rows[0];
}

async function viagemAbertaDoRemetente(telefone: string) {
  const r = await pool.query(
    `SELECT id, titulo FROM viagens_despesa
      WHERE status = 'aberta' AND (criada_por = $1 OR criada_por IS NULL OR criada_por = 'admin')
      ORDER BY created_at DESC`,
    [telefone],
  );
  return r.rows.length === 1 ? r.rows[0] : null;
}

async function processar(msg: MensagemRecebida, payload: any) {
  // dedup
  const dup = await pool.query(
    `INSERT INTO whatsapp_inbound_log (message_id, telefone, tipo, payload)
     VALUES ($1,$2,$3,$4) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
    [msg.messageId, msg.from, msg.tipo, payload],
  );
  if (dup.rowCount === 0) return;

  const s = await sessao(msg.from);
  if (!s.autorizado) {
    await enviarTexto(msg.from, 'Número não autorizado a lançar despesas de viagem.');
    return;
  }

  if (msg.tipo !== 'image') {
    await enviarTexto(
      msg.from,
      'Manda a *foto da nota* com uma linha do que é (ex.: "abastecimento"). ' +
      'Abrir/fechar viagem e confirmar valores é pelo SmartPrice por enquanto.',
    );
    return;
  }

  const viagem = await viagemAbertaDoRemetente(msg.from);
  if (!viagem) {
    await enviarTexto(
      msg.from,
      'Você não tem exatamente uma viagem *aberta*. Abra ou escolha a viagem no SmartPrice ' +
      '(Financeiro › Viagens) e reenvie a foto.',
    );
    return;
  }

  let despesaId: string;
  try {
    const { buffer, mime } = await baixarMidia(msg.imageId!);
    const key = await salvarRecibo(buffer, mime, viagem.id);
    const ins = await pool.query(
      `INSERT INTO despesas_viagem (viagem_id, categoria, data_despesa, recibo_key, origem, ia_status, criado_por)
       VALUES ($1, 'outros', CURRENT_DATE, $2, 'whatsapp', 'pendente', $3) RETURNING id`,
      [viagem.id, key, msg.from],
    );
    despesaId = ins.rows[0].id;
  } catch (e: any) {
    console.error('[whatsapp] falha ao salvar recibo:', e);
    await enviarTexto(msg.from, 'Recebi a foto mas não consegui guardar. Tenta de novo daqui a pouco.');
    return;
  }

  await recalcularTotal(viagem.id);
  await enviarTexto(msg.from, `📸 Recebi a nota da viagem "${viagem.titulo}". Lendo…`);

  try {
    const r = await extrairRecibo(
      // reaproveita a imagem já baixada seria ideal; aqui rebaixa por simplicidade
      (await baixarMidia(msg.imageId!)).buffer.toString('base64'),
      'image/jpeg',
      msg.caption,
    );
    await pool.query(
      `UPDATE despesas_viagem SET
         categoria = $1, valor_centavos = $2, data_despesa = COALESCE($3::date, data_despesa),
         estabelecimento = $4, documento_numero = $5, litros = $6, km_veiculo = $7,
         ia_status = 'extraido', ia_confianca = $8, ia_raw = $9, updated_at = now()
       WHERE id = $10`,
      [
        r.categoria, r.valorCentavos, r.dataDespesa, r.estabelecimento, r.documentoNumero,
        r.litros, r.kmVeiculo, r.confianca, JSON.stringify(r), despesaId,
      ],
    );
    await recalcularTotal(viagem.id);
    const dt = r.dataDespesa ? r.dataDespesa.split('-').reverse().join('/') : 's/ data';
    await enviarTexto(
      msg.from,
      `✅ ${rotulo[r.categoria] || r.categoria} · ${brl(r.valorCentavos)} · ` +
      `${r.estabelecimento || 's/ estabelecimento'} · ${dt}` +
      (r.confianca === 'baixa' ? '\n⚠️ leitura incerta — confira no SmartPrice.' : '\nConfira e ajuste no SmartPrice se precisar.'),
    );
  } catch (e: any) {
    const msgErr = e instanceof IANaoConfiguradaError
      ? 'A leitura automática está desligada. Lança o valor no SmartPrice.'
      : 'Não consegui ler a nota. O recibo foi salvo; lança o valor no SmartPrice.';
    await enviarTexto(msg.from, msgErr);
  }
}

async function recalcularTotal(viagemId: string) {
  await pool.query(
    `UPDATE viagens_despesa
        SET total_centavos = COALESCE((SELECT SUM(valor_centavos) FROM despesas_viagem WHERE viagem_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [viagemId],
  );
}

// ── GET /webhook — verificação da Meta ──
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge ?? ''));
  }
  res.sendStatus(403);
});

// ── POST /webhook — mensagens ──
router.post('/webhook', (req: Request, res: Response) => {
  if (!cfgOk()) return res.status(503).json({ error: 'WhatsApp não configurado' });
  const cru = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
  if (!verificarAssinatura(cru, req.header('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET!)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ack imediato
  const msgs = parseWebhookPayload(req.body);
  for (const m of msgs) {
    processar(m, req.body).catch((e) => console.error('[whatsapp] processar:', e));
  }
});

export default router;
```

  > **Nota:** o handler rebaixa a mídia pra passar ao `extrairRecibo` (que
  > espera base64). Se quiser evitar o 2º download, refatore `processar` pra
  > guardar o `buffer` da 1ª chamada — fica pra polish, não bloqueia a fase.

- [ ] **Step 2: `server.ts` — capturar corpo cru + montar router + schema**

- No `import` block, junto dos outros:
  ```ts
  import whatsappBotRouter, { ensureWhatsappSchema } from './src/whatsappBot';
  import { ensureBucketRecibos } from './src/lib/recibos';
  ```
- Trocar `app.use(express.json({ limit: '50mb' }));` por:
  ```ts
  app.use(express.json({ limit: '50mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
  ```
- Na sequência de `app.use('/api/...')`:
  ```ts
  app.use('/api/whatsapp', whatsappBotRouter);
  ```
- No boot, junto dos outros `ensure*`:
  ```ts
  await ensureWhatsappSchema().catch(err => console.error('Erro ao preparar schema do WhatsApp:', err));
  await ensureBucketRecibos().catch(err => console.error('Erro ao preparar bucket de recibos:', err));
  ```

- [ ] **Step 3: `src/despesasViagem.ts` — valor nullable, recibo_url, GET /recibo**

- Em `ensureDespesasViagemSchema()`, ao final:
  ```ts
  await pool.query(`ALTER TABLE despesas_viagem ALTER COLUMN valor_centavos DROP NOT NULL;`).catch(() => {});
  ```
- No topo, importar:
  ```ts
  import { assinarRecibo, conferirAssinaturaRecibo, statRecibo, streamRecibo } from './lib/recibos';
  ```
- Em `GET /viagens/:id`, depois de buscar `despesas.rows`, mapear:
  ```ts
  const despesasComUrl = despesas.rows.map((d: any) => ({
    ...d,
    recibo_url: d.recibo_key
      ? `/api/despesas-viagem/recibo/${d.id}?k=${assinarRecibo(d.id)}`
      : null,
  }));
  res.json({ ...viagem.rows[0], despesas: despesasComUrl });
  ```
- Nova rota (sem `apiAuth` — a assinatura na query autentica; `<img>` não manda
  header):
  ```ts
  router.get('/recibo/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const k = String(req.query.k || '');
      if (!conferirAssinaturaRecibo(id, k)) return res.sendStatus(403);
      const row = await pool.query('SELECT recibo_key FROM despesas_viagem WHERE id = $1', [id]);
      const key = row.rows[0]?.recibo_key;
      if (!key) return res.sendStatus(404);
      const stat = await statRecibo(key);
      res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      (await streamRecibo(key)).pipe(res);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

- [ ] **Step 4: Typecheck** — `npm run lint` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/whatsappBot.ts server.ts src/despesasViagem.ts
git commit -m "feat: webhook WhatsApp (Meta Cloud API) — foto da nota vira despesa extraida"
```

---

### Task 5: Frontend — recibo e origem na linha da despesa

**Files:**
- Modify: `src/lib/despesasViagemApi.ts` (`DespesaViagem.recibo_url`, `valor_centavos: string | null`)
- Modify: `src/components/DespesasViagemModal.tsx`

- [ ] **Step 1: `despesasViagemApi.ts`**
  - `valor_centavos: string;` → `valor_centavos: string | null;`
  - acrescentar `recibo_url?: string | null;` em `DespesaViagem`.

- [ ] **Step 2: `DespesasViagemModal.tsx`**
  - `toItem`: `valorCentavos: Number(d.valor_centavos)` → `valorCentavos: d.valor_centavos == null ? 0 : Number(d.valor_centavos)`.
  - `totalNum`: idem (`d.valor_centavos == null ? 0 : Number(...)`).
  - Na linha da despesa (modo leitura), o valor: mostrar `—` quando
    `d.valor_centavos == null`; senão `centavosParaBRL(Number(d.valor_centavos))`.
  - Ao lado do valor, quando `d.recibo_url`, um link:
    ```tsx
    {d.recibo_url && (
      <a href={d.recibo_url} target="_blank" rel="noreferrer" title="Ver recibo"
         className="text-zinc-400 hover:text-black dark:hover:text-white shrink-0">
        <Camera className="w-3.5 h-3.5" />
      </a>
    )}
    ```
    (`Camera` já será importado pela fase 3.)
  - Badge discreto quando `d.origem === 'whatsapp'` (ex.: um `·wpp` cinza no
    subtítulo).

- [ ] **Step 3: Typecheck** — `npm run lint` sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/despesasViagemApi.ts src/components/DespesasViagemModal.tsx
git commit -m "feat: mostra recibo e origem WhatsApp na linha da despesa; valor pendente = —"
```

---

### Task 6: Teste manual (José — precisa da Meta + túnel)

**Files:** nenhum.

Pré-requisitos: app na Meta com WhatsApp, número dedicado,
`WHATSAPP_TOKEN` / `_PHONE_NUMBER_ID` / `_APP_SECRET` / `_VERIFY_TOKEN` no
`.env`, `WHATSAPP_ALLOWED_NUMBERS` com o seu número, `ANTHROPIC_API_KEY`,
Postgres :5433, e um túnel público pro `localhost:3000` (cloudflared/ngrok)
apontando o webhook da Meta pra `<túnel>/api/whatsapp/webhook`.

- [ ] **1. Verificação:** ao salvar o webhook no painel da Meta, ela chama
  `GET /api/whatsapp/webhook` — deve validar (log sem erro, painel "verde").
- [ ] **2. Assinatura ruim:** `curl -X POST <túnel>/api/whatsapp/webhook -d '{}'`
  sem header → **401**.
- [ ] **3. Número fora da allowlist** manda foto → responde "não autorizado",
  nada é criado.
- [ ] **4. Sem viagem aberta:** com o seu número, sem viagem `aberta` → manda
  foto → responde "abra/escolha no SmartPrice", nada criado.
- [ ] **5. Caminho feliz:** cria uma viagem `aberta` no SmartPrice → manda no
  Whats a foto de uma nota com legenda "abastecimento" → recebe "Recebi… Lendo…"
  e depois o card `✅ Combustível · R$ … · … · dd/mm/aaaa`. No SmartPrice
  (Financeiro › Viagens) a despesa aparece com o valor, `origem` whatsapp, e o
  ícone de recibo abre a foto.
- [ ] **6. Reentrega:** a Meta às vezes reenvia — a mesma foto não deve virar
  2 despesas (dedup por `message_id`).
- [ ] **7. Foto ruim / sem chave IA:** recibo é salvo, despesa fica `pendente`,
  card avisa pra lançar o valor no SmartPrice.

---

### Task 7: Verificação final

- [ ] `npm test` → todas `PASS`.
- [ ] `npm run lint` → sem erros.
- [ ] Atualizar `../../projetos/CLAUDE.md` (vault): fase 4 (webhook WhatsApp +
  bucket privado) implementada.
- [ ] **Não fazer deploy** sem: as envs do WhatsApp na VPS, o bucket
  `smartprice-recibos` criado no MinIO da VPS, e o webhook da Meta apontando
  pro domínio de produção.

---

## Próximas fases

5. Máquina de estados da conversa: `nova viagem`/`fechar viagem` por texto,
   escolha de viagem, loop `ok`/correção do card.
6. Geração de PDF (`pdfkit`) + Excel (`xlsx`), entrega pelos dois canais.
7. Polish: realtime no modal, revisão de pendências, lembrete de viagem aberta,
   evitar o 2º download da mídia.
