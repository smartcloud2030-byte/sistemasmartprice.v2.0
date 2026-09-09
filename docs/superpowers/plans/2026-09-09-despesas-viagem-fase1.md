# Despesas de viagem — Fase 1 (backend: schema + CRUD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ter o backend do módulo de despesas de viagem de pé: tabelas no
Postgres local, funções puras de agregação testadas, e uma API REST completa
de CRUD de viagens e despesas. Sem WhatsApp, sem IA, sem PDF/Excel, sem tela —
isso é fase 2 em diante. Ao fim da fase 1 dá pra criar viagem, lançar despesa e
ler tudo de volta via `curl`.

**Architecture:** Mesmo padrão de `src/monitoring.ts` e `src/notaFiscal.ts` —
um router Express em `src/despesasViagem.ts` com `Pool` próprio (evita import
circular com `api.ts`), função `ensureDespesasViagemSchema()` chamada no
`server.ts`, autenticação por header `x-api-token == API_SECRET`. A lógica que
não faz I/O (formatação de centavos, agregação por categoria, ordenação de
linhas do relatório) fica em `src/lib/despesasViagemReport.ts`, pura e testável
com `tsx` + `node:assert`. Esse módulo puro também guarda as constantes
`CATEGORIAS_VALIDAS` / `STATUS_VALIDOS` usadas pela validação do router.

**Tech Stack:** TypeScript, Express, `pg`. Sem dependência nova. Testes com
`node:assert` via `tsx`, mesmo padrão de `src/notaFiscal.test.ts` e
`src/lib/despesas.test.ts`.

**Spec de referência:** `docs/superpowers/specs/2026-09-09-despesas-viagem-whatsapp-design.md`

## Global Constraints

- **Dinheiro sempre em centavos** (`BIGINT` no banco, `number` inteiro na API).
  Nada de `float`/`R$` string no backend — a formatação pra `"R$ 1.234,56"` é
  só no módulo de relatório.
- **Categoria e status são enums fixos** (`CATEGORIAS_VALIDAS`,
  `STATUS_VALIDOS` em `despesasViagemReport.ts`). Valor fora da lista: categoria
  cai pra `'outros'`, status inválido devolve 400.
- `total_centavos` da viagem é **cache recalculado** por
  `recalcularTotal(viagemId)` após todo insert/update/delete de despesa —
  nunca é escrito direto pela API.
- Toda rota (menos nenhuma nesta fase) exige `x-api-token`. O webhook do
  WhatsApp (fase 4) terá autenticação própria; não existe nesta fase.
- `centavosParaBRL` faz o agrupamento de milhar **na mão** (regex), não via
  `toLocaleString` — pra ser determinística independente do ICU do ambiente.
- Não fazer deploy nem migração manual no banco: `ensureDespesasViagemSchema()`
  cria as tabelas com `CREATE TABLE IF NOT EXISTS` no boot, igual os outros
  módulos.

---

### Task 1: Módulo puro de agregação (`src/lib/despesasViagemReport.ts`)

**Files:**
- Create: `src/lib/despesasViagemReport.ts`
- Create: `src/lib/despesasViagemReport.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (usado pelas Tasks 2 e, nas fases seguintes, pela geração de
  PDF/Excel):
  - `export const CATEGORIAS_VALIDAS` (readonly tuple) + `type CategoriaDespesa`
  - `export const STATUS_VALIDOS` (readonly tuple) + `type StatusViagem`
  - `export function rotuloCategoria(cat: string): string`
  - `export function centavosParaBRL(centavos: number): string`
  - `export function formatarDataBR(iso: string): string`
  - `export interface ItemDespesa { categoria: string; descricao: string | null; valorCentavos: number; dataDespesa: string; estabelecimento: string | null }`
  - `export function totalCentavos(itens: ItemDespesa[]): number`
  - `export function resumoPorCategoria(itens: ItemDespesa[]): ResumoCategoria[]`
  - `export function linhasRelatorio(itens: ItemDespesa[]): LinhaRelatorio[]`

- [ ] **Step 1: Escrever o teste que falha primeiro (`src/lib/despesasViagemReport.test.ts`)**

```ts
import assert from 'node:assert';
import {
  centavosParaBRL, totalCentavos, resumoPorCategoria, linhasRelatorio,
  rotuloCategoria, formatarDataBR, CATEGORIAS_VALIDAS, type ItemDespesa,
} from './despesasViagemReport';

const itens: ItemDespesa[] = [
  { categoria: 'combustivel', descricao: 'Tanque cheio', valorCentavos: 25000, dataDespesa: '2026-09-08', estabelecimento: 'Posto Ipiranga' },
  { categoria: 'pedagio',     descricao: null,           valorCentavos: 1230,  dataDespesa: '2026-09-07', estabelecimento: 'CLF' },
  { categoria: 'combustivel', descricao: null,           valorCentavos: 18050, dataDespesa: '2026-09-10', estabelecimento: 'Shell' },
  { categoria: 'refeicao',    descricao: 'Almoço',       valorCentavos: 4500,  dataDespesa: '2026-09-08', estabelecimento: 'Restaurante do Zé' },
];

function centavosFormataEmReal() {
  assert.strictEqual(centavosParaBRL(0), 'R$ 0,00');
  assert.strictEqual(centavosParaBRL(5), 'R$ 0,05');
  assert.strictEqual(centavosParaBRL(1230), 'R$ 12,30');
  assert.strictEqual(centavosParaBRL(25000), 'R$ 250,00');
  assert.strictEqual(centavosParaBRL(123456789), 'R$ 1.234.567,89');
  assert.strictEqual(centavosParaBRL(-1230), '-R$ 12,30');
}

function totalSomaTodosOsItens() {
  assert.strictEqual(totalCentavos(itens), 25000 + 1230 + 18050 + 4500);
  assert.strictEqual(totalCentavos([]), 0);
}

function resumoAgrupaPorCategoriaEOrdenaPorTotal() {
  const r = resumoPorCategoria(itens);
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].categoria, 'combustivel');
  assert.strictEqual(r[0].totalCentavos, 43050);
  assert.strictEqual(r[0].qtd, 2);
  assert.strictEqual(r[0].rotulo, 'Combustível');
  assert.strictEqual(r[1].categoria, 'refeicao');
  assert.strictEqual(r[2].categoria, 'pedagio');
}

function linhasSaoOrdenadasPorDataEFormatadas() {
  const l = linhasRelatorio(itens);
  assert.deepStrictEqual(l.map((x) => x.data), ['07/09/2026', '08/09/2026', '08/09/2026', '10/09/2026']);
  assert.strictEqual(l[0].categoria, 'Pedágio');
  assert.strictEqual(l[0].estabelecimento, 'CLF');
  assert.strictEqual(l[0].descricao, '');
  assert.strictEqual(l[0].valor, 'R$ 12,30');
}

function rotuloCategoriaCobreAsValidasEFazFallback() {
  for (const c of CATEGORIAS_VALIDAS) {
    assert.ok(typeof rotuloCategoria(c) === 'string' && rotuloCategoria(c).length > 0);
  }
  assert.strictEqual(rotuloCategoria('combustivel'), 'Combustível');
  assert.strictEqual(rotuloCategoria('xpto'), 'xpto');
}

function formatarDataBRLidaComISOComOuSemHora() {
  assert.strictEqual(formatarDataBR('2026-09-08'), '08/09/2026');
  assert.strictEqual(formatarDataBR('2026-09-08T13:00:00Z'), '08/09/2026');
  assert.strictEqual(formatarDataBR('sem-data'), 'sem-data');
}

try {
  centavosFormataEmReal();
  totalSomaTodosOsItens();
  resumoAgrupaPorCategoriaEOrdenaPorTotal();
  linhasSaoOrdenadasPorDataEFormatadas();
  rotuloCategoriaCobreAsValidasEFazFallback();
  formatarDataBRLidaComISOComOuSemHora();
  console.log('PASS: todos os testes de despesasViagemReport passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/despesasViagemReport.test.ts`
Expected: falha com `Cannot find module './despesasViagemReport'`.

- [ ] **Step 3: Implementar `src/lib/despesasViagemReport.ts`**

```ts
// ─────────────────────────────────────────
// despesasViagemReport.ts — Constantes e agregação pura das despesas de viagem.
// Sem I/O: recebe itens já carregados e devolve totais/linhas formatadas.
// Usado pelo router (validação) e, nas fases seguintes, pela geração de
// PDF/Excel. Testado com node:assert via tsx.
// ─────────────────────────────────────────

export const CATEGORIAS_VALIDAS = [
  'combustivel', 'pedagio', 'refeicao', 'hospedagem',
  'estacionamento', 'manutencao', 'outros',
] as const;
export type CategoriaDespesa = (typeof CATEGORIAS_VALIDAS)[number];

export const STATUS_VALIDOS = ['aberta', 'fechada', 'enviada'] as const;
export type StatusViagem = (typeof STATUS_VALIDOS)[number];

const ROTULO_CATEGORIA: Record<CategoriaDespesa, string> = {
  combustivel: 'Combustível',
  pedagio: 'Pedágio',
  refeicao: 'Refeição',
  hospedagem: 'Hospedagem',
  estacionamento: 'Estacionamento',
  manutencao: 'Manutenção',
  outros: 'Outros',
};

export function rotuloCategoria(cat: string): string {
  return ROTULO_CATEGORIA[cat as CategoriaDespesa] ?? cat;
}

function agrupaMilhar(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function centavosParaBRL(centavos: number): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centavos));
  const reais = agrupaMilhar(Math.floor(abs / 100));
  const cent = String(abs % 100).padStart(2, '0');
  return `${sinal}R$ ${reais},${cent}`;
}

export function formatarDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export interface ItemDespesa {
  categoria: string;
  descricao: string | null;
  valorCentavos: number;
  dataDespesa: string;       // ISO date (YYYY-MM-DD), com ou sem hora
  estabelecimento: string | null;
}

export function totalCentavos(itens: ItemDespesa[]): number {
  return itens.reduce((s, i) => s + i.valorCentavos, 0);
}

export interface ResumoCategoria {
  categoria: string;
  rotulo: string;
  totalCentavos: number;
  qtd: number;
}

export function resumoPorCategoria(itens: ItemDespesa[]): ResumoCategoria[] {
  const mapa = new Map<string, ResumoCategoria>();
  for (const i of itens) {
    const cur = mapa.get(i.categoria) ?? {
      categoria: i.categoria, rotulo: rotuloCategoria(i.categoria), totalCentavos: 0, qtd: 0,
    };
    cur.totalCentavos += i.valorCentavos;
    cur.qtd += 1;
    mapa.set(i.categoria, cur);
  }
  return [...mapa.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export interface LinhaRelatorio {
  data: string;              // DD/MM/AAAA
  categoria: string;         // rótulo legível
  estabelecimento: string;
  descricao: string;
  valor: string;             // "R$ 1.234,56"
}

export function linhasRelatorio(itens: ItemDespesa[]): LinhaRelatorio[] {
  return [...itens]
    .sort((a, b) => a.dataDespesa.localeCompare(b.dataDespesa))
    .map((i) => ({
      data: formatarDataBR(i.dataDespesa),
      categoria: rotuloCategoria(i.categoria),
      estabelecimento: i.estabelecimento ?? '',
      descricao: i.descricao ?? '',
      valor: centavosParaBRL(i.valorCentavos),
    }));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/despesasViagemReport.test.ts`
Expected: `PASS: todos os testes de despesasViagemReport passaram`, exit 0.

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

O valor atual de `"test"` termina em
`... && tsx src/components/encarte-digital/gerador.test.ts`. Adicionar
` && tsx src/lib/despesasViagemReport.test.ts` no final dessa string.

- [ ] **Step 6: Rodar a suíte completa + typecheck**

Run: `npm test` — todas as linhas `PASS: ...`, exit 0.
Run: `npm run lint` — sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/despesasViagemReport.ts src/lib/despesasViagemReport.test.ts package.json
git commit -m "feat: funcoes puras de agregacao das despesas de viagem"
```

---

### Task 2: Router `src/despesasViagem.ts` — schema + CRUD

**Files:**
- Create: `src/despesasViagem.ts`

**Interfaces:**
- Consumes: `CATEGORIAS_VALIDAS`, `STATUS_VALIDOS` de `./lib/despesasViagemReport` (Task 1).
- Produces (montado pela Task 3):
  - `export default router` (Express Router)
  - `export async function ensureDespesasViagemSchema(): Promise<void>`
  - Rotas sob o prefixo `/api/despesas-viagem`:
    - `GET  /viagens` — lista (opcional `?status=aberta|fechada|enviada`), cada linha com `qtd_despesas`
    - `POST /viagens` — cria `{ titulo* , destino, motivo, data_inicio, data_fim, observacoes, criada_por }`
    - `GET  /viagens/:id` — viagem + `despesas: []` (ordenadas por data)
    - `PATCH /viagens/:id` — atualiza `titulo|destino|motivo|empresa|data_inicio|data_fim|observacoes|status`
    - `DELETE /viagens/:id` — apaga (cascade nas despesas)
    - `POST /viagens/:id/despesas` — cria despesa `{ categoria, descricao, valor_centavos*, data_despesa*, estabelecimento, documento_numero, km_veiculo, litros, recibo_key, origem, ia_status, ia_confianca, ia_raw, criado_por }`
    - `PATCH /despesas/:id` — atualiza campos da despesa
    - `DELETE /despesas/:id` — apaga a despesa
  - Todas as rotas de escrita/leitura protegidas por `x-api-token`.
  - Após todo insert/update/delete de despesa, `recalcularTotal(viagemId)` atualiza `viagens_despesa.total_centavos`.

- [ ] **Step 1: Criar `src/despesasViagem.ts`**

```ts
// ─────────────────────────────────────────
// despesasViagem.ts — Despesas de viagem (reembolso Ultra Popular).
// Fase 1: schema + CRUD de viagens e despesas. WhatsApp, extração por IA e
// geração de PDF/Excel entram nas fases seguintes.
// Pool próprio (mesmo padrão de src/monitoring.ts) — evita import circular
// com api.ts.
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { CATEGORIAS_VALIDAS, STATUS_VALIDOS } from './lib/despesasViagemReport';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

export async function ensureDespesasViagemSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS viagens_despesa (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo         TEXT NOT NULL,
      destino        TEXT,
      motivo         TEXT,
      empresa        TEXT NOT NULL DEFAULT 'Ultra Popular',
      data_inicio    DATE,
      data_fim       DATE,
      status         TEXT NOT NULL DEFAULT 'aberta',
      criada_por     TEXT,
      observacoes    TEXT,
      total_centavos BIGINT NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS despesas_viagem (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      viagem_id        UUID NOT NULL REFERENCES viagens_despesa(id) ON DELETE CASCADE,
      categoria        TEXT NOT NULL DEFAULT 'outros',
      descricao        TEXT,
      valor_centavos   BIGINT NOT NULL,
      data_despesa     DATE NOT NULL,
      estabelecimento  TEXT,
      documento_numero TEXT,
      km_veiculo       INTEGER,
      litros           NUMERIC(8,3),
      recibo_key       TEXT,
      origem           TEXT NOT NULL DEFAULT 'manual',
      ia_status        TEXT NOT NULL DEFAULT 'pendente',
      ia_confianca     TEXT,
      ia_raw           JSONB,
      criado_por       TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_viagem_viagem ON despesas_viagem(viagem_id);`);
}

async function recalcularTotal(viagemId: string) {
  await pool.query(
    `UPDATE viagens_despesa
        SET total_centavos = COALESCE(
              (SELECT SUM(valor_centavos) FROM despesas_viagem WHERE viagem_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [viagemId]
  );
}

function parseCentavos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.round(Number(v));
  return null;
}

// ── Viagens ──────────────────────────────

router.get('/viagens', apiAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const params: any[] = [];
    let where = '';
    if (typeof status === 'string' && (STATUS_VALIDOS as readonly string[]).includes(status)) {
      params.push(status);
      where = 'WHERE v.status = $1';
    }
    const result = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*)::int FROM despesas_viagem d WHERE d.viagem_id = v.id) AS qtd_despesas
         FROM viagens_despesa v
         ${where}
        ORDER BY v.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/viagens', apiAuth, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.titulo || !String(b.titulo).trim()) return res.status(400).json({ error: 'titulo é obrigatório' });
    const result = await pool.query(
      `INSERT INTO viagens_despesa (titulo, destino, motivo, data_inicio, data_fim, observacoes, criada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(b.titulo).trim(), b.destino || null, b.motivo || null,
        b.data_inicio || null, b.data_fim || null, b.observacoes || null, b.criada_por || 'admin',
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const viagem = await pool.query('SELECT * FROM viagens_despesa WHERE id = $1', [req.params.id]);
    if (viagem.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    const despesas = await pool.query(
      'SELECT * FROM despesas_viagem WHERE viagem_id = $1 ORDER BY data_despesa ASC, created_at ASC',
      [req.params.id]
    );
    res.json({ ...viagem.rows[0], despesas: despesas.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const campos = ['titulo', 'destino', 'motivo', 'empresa', 'data_inicio', 'data_fim', 'observacoes', 'status'];
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    for (const c of campos) {
      if (!(c in b)) continue;
      if (c === 'status' && !(STATUS_VALIDOS as readonly string[]).includes(b[c])) {
        return res.status(400).json({ error: `status inválido (use ${STATUS_VALIDOS.join(', ')})` });
      }
      vals.push(b[c] === '' ? null : b[c]);
      sets.push(`${c} = $${vals.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE viagens_despesa SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM viagens_despesa WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Despesas ─────────────────────────────

router.post('/viagens/:id/despesas', apiAuth, async (req: Request, res: Response) => {
  try {
    const viagem = await pool.query('SELECT id FROM viagens_despesa WHERE id = $1', [req.params.id]);
    if (viagem.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });

    const b = req.body || {};
    const valorCentavos = parseCentavos(b.valor_centavos);
    if (valorCentavos === null || valorCentavos <= 0) {
      return res.status(400).json({ error: 'valor_centavos precisa ser um inteiro > 0' });
    }
    if (!b.data_despesa) return res.status(400).json({ error: 'data_despesa é obrigatória' });
    const categoria = (CATEGORIAS_VALIDAS as readonly string[]).includes(b.categoria) ? b.categoria : 'outros';

    const result = await pool.query(
      `INSERT INTO despesas_viagem
         (viagem_id, categoria, descricao, valor_centavos, data_despesa, estabelecimento,
          documento_numero, km_veiculo, litros, recibo_key, origem, ia_status, ia_confianca, ia_raw, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        req.params.id, categoria, b.descricao || null, valorCentavos, b.data_despesa,
        b.estabelecimento || null, b.documento_numero || null,
        b.km_veiculo ?? null, b.litros ?? null, b.recibo_key || null,
        b.origem || 'manual', b.ia_status || 'revisado', b.ia_confianca || null,
        b.ia_raw ? JSON.stringify(b.ia_raw) : null, b.criado_por || 'admin',
      ]
    );
    await recalcularTotal(req.params.id);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/despesas/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const atual = await pool.query('SELECT viagem_id FROM despesas_viagem WHERE id = $1', [req.params.id]);
    if (atual.rowCount === 0) return res.status(404).json({ error: 'Despesa não encontrada' });

    const campos = ['categoria', 'descricao', 'valor_centavos', 'data_despesa', 'estabelecimento',
      'documento_numero', 'km_veiculo', 'litros', 'recibo_key', 'ia_status', 'ia_confianca'];
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    for (const c of campos) {
      if (!(c in b)) continue;
      let v = b[c];
      if (c === 'categoria' && !(CATEGORIAS_VALIDAS as readonly string[]).includes(v)) {
        return res.status(400).json({ error: `categoria inválida (use ${CATEGORIAS_VALIDAS.join(', ')})` });
      }
      if (c === 'valor_centavos') {
        const n = parseCentavos(v);
        if (n === null || n <= 0) return res.status(400).json({ error: 'valor_centavos precisa ser um inteiro > 0' });
        v = n;
      }
      vals.push(v === '' ? null : v);
      sets.push(`${c} = $${vals.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE despesas_viagem SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    await recalcularTotal(atual.rows[0].viagem_id);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/despesas/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM despesas_viagem WHERE id = $1 RETURNING viagem_id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Despesa não encontrada' });
    await recalcularTotal(result.rows[0].viagem_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/despesasViagem.ts
git commit -m "feat: router de despesas de viagem (schema + CRUD viagens/despesas)"
```

---

### Task 3: Ligar no `server.ts`

**Files:**
- Modify: `server.ts` (import, `app.use`, `ensureDespesasViagemSchema()`)

**Interfaces:**
- Consumes: `despesasViagemRouter` default + `ensureDespesasViagemSchema` (Task 2).

- [ ] **Step 1: Import**

Depois da linha 10 (`import monitoringRouter, ... from './src/monitoring';`), adicionar:
```ts
import despesasViagemRouter, { ensureDespesasViagemSchema } from './src/despesasViagem';
```

- [ ] **Step 2: Montar a rota**

Na sequência de `app.use('/api/...')` (linhas 124-127), entre o `monitoring` e o
`apiRouter` genérico:
```ts
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/despesas-viagem', despesasViagemRouter);
  app.use('/api', apiRouter);
```

- [ ] **Step 3: Criar o schema no boot**

Depois da linha 131 (`await ensureMonitoringSchema().catch(...)`), adicionar:
```ts
  await ensureDespesasViagemSchema().catch(err => console.error('Erro ao preparar schema de despesas de viagem:', err));
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: monta o router de despesas de viagem e cria o schema no boot"
```

---

### Task 4: Teste manual contra o Docker local

**Files:** nenhum — só verificação.

Pré-requisito: `docker compose up` local com `postgres` + `app` de pé
(o `minio` não é usado nesta fase). Servidor em `http://localhost:3000`,
token `smartprice-api-2026` (valor de `API_SECRET` no `.env` local).

- [ ] **Step 1: Subir o app e conferir que o schema foi criado**

Nos logs do boot não deve aparecer "Erro ao preparar schema de despesas de
viagem". Conferir as tabelas:
```bash
docker compose exec postgres psql -U smartprice -d smartprice -c "\dt viagens_despesa despesas_viagem"
```
Expected: as duas tabelas listadas.

- [ ] **Step 2: Criar uma viagem**

```bash
curl -s -X POST http://localhost:3000/api/despesas-viagem/viagens \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"titulo":"Bacabal → São Luís","destino":"São Luís/MA","motivo":"Visita lojas Ultra Popular","data_inicio":"2026-09-08"}'
```
Expected: 201 com o objeto da viagem, `status: "aberta"`, `total_centavos: "0"`,
`empresa: "Ultra Popular"`. Guardar o `id` retornado como `$VIAGEM`.

- [ ] **Step 3: Lançar duas despesas**

```bash
curl -s -X POST http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM/despesas \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"categoria":"combustivel","descricao":"Tanque cheio","valor_centavos":25000,"data_despesa":"2026-09-08","estabelecimento":"Posto Ipiranga"}'

curl -s -X POST http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM/despesas \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"categoria":"pedagio","valor_centavos":1230,"data_despesa":"2026-09-08"}'
```
Expected: 201 nos dois.

- [ ] **Step 4: Ler a viagem e conferir o total recalculado**

```bash
curl -s http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM \
  -H "x-api-token: smartprice-api-2026"
```
Expected: `total_centavos: "26230"`, `despesas` com 2 itens ordenados por data.

- [ ] **Step 5: Editar uma despesa e conferir o total de novo**

Pegar o `id` da despesa de combustível (`$DESP`) e:
```bash
curl -s -X PATCH http://localhost:3000/api/despesas-viagem/despesas/$DESP \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"valor_centavos":24590}'
```
Expected: 200; `GET` da viagem agora com `total_centavos: "25820"`.

- [ ] **Step 6: Casos de erro**

```bash
# sem token
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/despesas-viagem/viagens
# valor inválido
curl -s -X POST http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM/despesas \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"categoria":"combustivel","valor_centavos":0,"data_despesa":"2026-09-08"}'
# status inválido
curl -s -X PATCH http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM \
  -H "Content-Type: application/json" -H "x-api-token: smartprice-api-2026" \
  -d '{"status":"qualquer"}'
```
Expected: `401`; `400 valor_centavos precisa ser um inteiro > 0`;
`400 status inválido (use aberta, fechada, enviada)`.

- [ ] **Step 7: Apagar a viagem e conferir o cascade**

```bash
curl -s -X DELETE http://localhost:3000/api/despesas-viagem/viagens/$VIAGEM \
  -H "x-api-token: smartprice-api-2026"
docker compose exec postgres psql -U smartprice -d smartprice \
  -c "SELECT count(*) FROM despesas_viagem WHERE viagem_id = '$VIAGEM';"
```
Expected: `{ "success": true }` e contagem `0` (cascade apagou as despesas).

---

### Task 5: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Suíte de testes**

Run: `npm test`
Expected: todas as linhas `PASS: ...`, exit 0 (inclui
`PASS: todos os testes de despesasViagemReport passaram`).

- [ ] **Step 2: Typecheck do projeto**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 3: Atualizar o índice do vault**

Em `../../projetos/CLAUDE.md` (no vault JH-VAUT), acrescentar na entrada do
SmartPrice que a fase 1 do módulo de despesas de viagem está implementada
(schema + API), com link pro spec e pro plano.

- [ ] **Step 4: Não fazer deploy ainda**

Combinar com o José antes de subir pra VPS (precisa das envs das fases
seguintes e do bucket privado no MinIO). A fase 1 sozinha é inofensiva —
só cria duas tabelas vazias — mas o deploy fica pro fim de uma leva de fases.

---

## Próximas fases (fora deste plano)

2. Tela no SmartPrice (CRUD manual, sem WhatsApp).
3. `src/lib/reciboExtract.ts` + endpoint de extração + botão "extrair".
4. Webhook WhatsApp (Meta Cloud API): verificação, assinatura, download de mídia.
5. Máquina de estados da conversa (viagem ativa, confirmação, correção).
6. Geração de PDF (`pdfkit`) + Excel (`xlsx`), entrega pelos dois canais.
7. Polish: realtime no modal, revisão de pendências, lembrete de viagem aberta.
