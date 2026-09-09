# Despesas de viagem — Fase 2 (tela no SmartPrice, CRUD manual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela no SmartPrice pra criar viagem, lançar/editar/excluir
despesas à mão e ver o total (geral e por categoria). Sem WhatsApp, sem IA.
A partir daqui o José já usa o módulo digitando as despesas.

**Architecture:** Modal novo `src/components/DespesasViagemModal.tsx` no menu
Administração — mesmo padrão do `ProductReport` (casca do modal em `App.tsx`,
o componente é só o miolo). Um client tipado `src/lib/despesasViagemApi.ts`
sobre `fetch` + header `x-api-token` (mesmo esquema de
`ProductReport.handleConfirmImport`) concentra as 8 chamadas ao
`/api/despesas-viagem`. O cálculo de exibição reaproveita
`centavosParaBRL` / `resumoPorCategoria` / `CATEGORIAS_VALIDAS` do módulo puro
da fase 1; a fase 2 acrescenta `reaisParaCentavos` (pura, testada). O estado
do modal entra no `store.ts` igual `isProductReportModalOpen`. A fase 2 também
corrige o router da fase 1 pra devolver datas como texto `YYYY-MM-DD`.

**Tech Stack:** React + Zustand + Tailwind + lucide-react + sonner. Sem
dependência nova. Testes: `tsx` + `node:assert` (só pro `reaisParaCentavos`).

**Spec de referência:** `docs/superpowers/specs/2026-09-09-despesas-viagem-whatsapp-design.md`
**Fase 1:** `docs/superpowers/plans/2026-09-09-despesas-viagem-fase1.md`

## Global Constraints

- **Datas trafegam como string `YYYY-MM-DD`.** O driver `pg` converte coluna
  `DATE` em `Date` JS, e `JSON.stringify` de `Date` aplica fuso — o que desloca
  o dia em ±1 dependendo do TZ do servidor. Os `SELECT` de leitura do router
  usam `coluna::text` pra formatar no Postgres. O front nunca instancia `Date`
  a partir desses campos — só fatia string.
- **Dinheiro:** o usuário digita em reais (`"250,00"`, `"1.234,56"`, tolera
  `"R$ "`). Conversão pra centavos por `reaisParaCentavos` (pura); exibição por
  `centavosParaBRL`. Nunca manda string de moeda pro backend, nunca manda
  `valor_centavos` não-inteiro.
- **IDs de viagem e despesa são `string` (UUID)** — nunca `Number(...)`.
  `valor_centavos` / `total_centavos` são `BIGINT` → o `pg` devolve **string**;
  o front faz `Number(...)` só pra somar/exibir.
- O componente **não fala com o Postgres nem monta SQL** — só chama
  `despesasViagemApi`. Depois de qualquer mutação, **recarrega** lista + detalhe
  do backend (nada de merge otimista de total).
- **Sem `window.confirm`.** Excluir viagem/despesa é confirmação inline
  (clicar de novo em até alguns segundos).
- O item fica no dropdown **Administração**, que só aparece pra
  `userRole === 'admin'` — não precisa de gate extra no componente.

---

### Task 1: Router da fase 1 devolve datas como texto

**Files:**
- Modify: `src/despesasViagem.ts` (consts de SELECT + os 2 handlers GET)

**Interfaces:**
- Sem mudança de contrato além de `data_inicio` / `data_fim` / `data_despesa`
  virarem `"YYYY-MM-DD"` (ou `null`) no JSON de resposta dos GET, em vez de
  ISO-datetime. `POST`/`PATCH` continuam com `RETURNING *` (o front recarrega
  via GET, não depende da data no corpo da mutação).

- [ ] **Step 1: Adicionar as listas de colunas**

Logo depois de `function parseCentavos(...) { ... }` (linha ~86, antes de
`// ── Viagens ──`), inserir:

```ts
// Colunas explícitas nos SELECT de leitura: `::text` formata a DATE no
// Postgres (YYYY-MM-DD) e evita o Date do driver `pg` + shift de fuso no
// JSON.stringify.
const VIAGEM_SELECT = `id, titulo, destino, motivo, empresa,
  data_inicio::text AS data_inicio, data_fim::text AS data_fim,
  status, criada_por, observacoes, total_centavos, created_at, updated_at`;

const DESPESA_SELECT = `id, viagem_id, categoria, descricao, valor_centavos,
  data_despesa::text AS data_despesa, estabelecimento, documento_numero,
  km_veiculo, litros, recibo_key, origem, ia_status, ia_confianca, ia_raw,
  criado_por, created_at, updated_at`;
```

- [ ] **Step 2: `GET /viagens` — tirar o alias `v` e usar `VIAGEM_SELECT`**

Trocar o corpo do handler `router.get('/viagens', ...)` por:

```ts
router.get('/viagens', apiAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const params: any[] = [];
    let where = '';
    if (typeof status === 'string' && (STATUS_VALIDOS as readonly string[]).includes(status)) {
      params.push(status);
      where = 'WHERE status = $1';
    }
    const result = await pool.query(
      `SELECT ${VIAGEM_SELECT},
              (SELECT COUNT(*)::int FROM despesas_viagem d WHERE d.viagem_id = viagens_despesa.id) AS qtd_despesas
         FROM viagens_despesa
         ${where}
        ORDER BY created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: `GET /viagens/:id` — usar `VIAGEM_SELECT` / `DESPESA_SELECT`**

Trocar as duas queries do handler:

```ts
    const viagem = await pool.query(`SELECT ${VIAGEM_SELECT} FROM viagens_despesa WHERE id = $1`, [req.params.id]);
    if (viagem.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    const despesas = await pool.query(
      `SELECT ${DESPESA_SELECT} FROM despesas_viagem WHERE viagem_id = $1 ORDER BY data_despesa ASC, created_at ASC`,
      [req.params.id]
    );
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/despesasViagem.ts
git commit -m "fix: router de despesas de viagem devolve datas como texto YYYY-MM-DD"
```

---

### Task 2: `reaisParaCentavos` no módulo puro (+ testes)

**Files:**
- Modify: `src/lib/despesasViagemReport.ts`
- Modify: `src/lib/despesasViagemReport.test.ts`

**Interfaces:**
- Produces: `export function reaisParaCentavos(input: string): number | null`
  - `""`, `null`, `undefined`, não-numérico, valor `<= 0` → `null`
  - `"250"` → `25000` · `"250,00"` / `"250.00"` → `25000`
  - `"1.234,56"` → `123456` (ponto = milhar, vírgula = decimal)
  - `"12,5"` → `1250` · `"1234"` → `123400` · `"12.50"` → `1250`
  - `"1.234"` (só ponto, 3 dígitos depois) → `123400` (ponto tratado como milhar)
  - `"R$ 1.234,56"` → `123456` (tolera prefixo e espaços)
  - resultado sempre inteiro (`Math.round`)

- [ ] **Step 1: Acrescentar os casos ao teste**

Em `src/lib/despesasViagemReport.test.ts`, adicionar ao import
`reaisParaCentavos`, e a função abaixo + a chamada dela no bloco `try`:

```ts
function reaisParaCentavosCobreOsFormatosBR() {
  assert.strictEqual(reaisParaCentavos(''), null);
  assert.strictEqual(reaisParaCentavos('abc'), null);
  assert.strictEqual(reaisParaCentavos('0'), null);
  assert.strictEqual(reaisParaCentavos('-5'), null);
  assert.strictEqual(reaisParaCentavos('250'), 25000);
  assert.strictEqual(reaisParaCentavos('250,00'), 25000);
  assert.strictEqual(reaisParaCentavos('250.00'), 25000);
  assert.strictEqual(reaisParaCentavos('1.234,56'), 123456);
  assert.strictEqual(reaisParaCentavos('12,5'), 1250);
  assert.strictEqual(reaisParaCentavos('1234'), 123400);
  assert.strictEqual(reaisParaCentavos('12.50'), 1250);
  assert.strictEqual(reaisParaCentavos('1.234'), 123400);
  assert.strictEqual(reaisParaCentavos('R$ 1.234,56'), 123456);
  assert.strictEqual(reaisParaCentavos('  99,90 '), 9990);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/despesasViagemReport.test.ts`
Expected: `FAIL` (`reaisParaCentavos is not a function`).

- [ ] **Step 3: Implementar em `src/lib/despesasViagemReport.ts`**

Acrescentar ao fim do arquivo:

```ts
export function reaisParaCentavos(input: string): number | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^r\$\s*/i, '').replace(/\s/g, '');
  if (s === '' || /[^\d.,]/.test(s)) return null;

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.replace(/\./g, '').replace(',', '.');       // ponto=milhar, vírgula=decimal
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto) {
    const partes = s.split('.');
    // um único ponto com <=2 dígitos depois = decimal; qualquer outra coisa = milhar
    if (!(partes.length === 2 && partes[1].length <= 2)) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/despesasViagemReport.test.ts` → `PASS: ...`

- [ ] **Step 5: Suíte + typecheck**

Run: `npm test` → todas `PASS`.
Run: `npm run lint` → sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/despesasViagemReport.ts src/lib/despesasViagemReport.test.ts
git commit -m "feat: reaisParaCentavos (parse de valor em reais BR para centavos)"
```

---

### Task 3: Client tipado `src/lib/despesasViagemApi.ts`

**Files:**
- Create: `src/lib/despesasViagemApi.ts`

**Interfaces:**
- Produces (usado pela Task 4): tipos `ViagemResumo`, `ViagemRow`,
  `ViagemDetalhe`, `DespesaViagem`, `NovaViagemInput`, `PatchViagemInput`,
  `NovaDespesaInput`, `PatchDespesaInput`; funções `listarViagens`,
  `criarViagem`, `getViagem`, `atualizarViagem`, `excluirViagem`,
  `criarDespesa`, `atualizarDespesa`, `excluirDespesa`.

- [ ] **Step 1: Criar o arquivo**

```ts
// ─────────────────────────────────────────
// despesasViagemApi.ts — cliente tipado do /api/despesas-viagem.
// Só I/O: fetch + header x-api-token, mesmo esquema do resto do front
// (ProductReport.handleConfirmImport). Sem estado, sem React.
// ─────────────────────────────────────────
const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';
const BASE = '/api/despesas-viagem';

export interface ViagemRow {
  id: string;
  titulo: string;
  destino: string | null;
  motivo: string | null;
  empresa: string;
  data_inicio: string | null;   // YYYY-MM-DD
  data_fim: string | null;
  status: string;               // aberta | fechada | enviada
  criada_por: string | null;
  observacoes: string | null;
  total_centavos: string;       // BIGINT -> string
  created_at: string;
  updated_at: string;
}
export interface ViagemResumo extends ViagemRow {
  qtd_despesas: number;
}

export interface DespesaViagem {
  id: string;
  viagem_id: string;
  categoria: string;
  descricao: string | null;
  valor_centavos: string;       // BIGINT -> string
  data_despesa: string;         // YYYY-MM-DD
  estabelecimento: string | null;
  documento_numero: string | null;
  km_veiculo: number | null;
  litros: string | null;        // NUMERIC -> string
  recibo_key: string | null;
  origem: string;
  ia_status: string;
  ia_confianca: string | null;
  ia_raw: unknown;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type ViagemDetalhe = ViagemRow & { despesas: DespesaViagem[] };

export interface NovaViagemInput {
  titulo: string;
  destino?: string;
  motivo?: string;
  data_inicio?: string;
  data_fim?: string;
  observacoes?: string;
}
export type PatchViagemInput = Partial<
  Pick<ViagemRow, 'titulo' | 'destino' | 'motivo' | 'empresa' | 'data_inicio' | 'data_fim' | 'observacoes' | 'status'>
>;

export interface NovaDespesaInput {
  categoria: string;
  descricao?: string;
  valor_centavos: number;
  data_despesa: string;
  estabelecimento?: string;
  documento_numero?: string;
  km_veiculo?: number | null;
  litros?: number | null;
}
export type PatchDespesaInput = Partial<NovaDespesaInput>;

async function req<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-api-token': API_SECRET,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(data?.error || `${method} ${path} falhou (${res.status})`);
  return data as T;
}

export const listarViagens = (status?: string) =>
  req<ViagemResumo[]>(`/viagens${status ? `?status=${encodeURIComponent(status)}` : ''}`, 'GET');
export const criarViagem = (input: NovaViagemInput) =>
  req<ViagemRow>('/viagens', 'POST', input);
export const getViagem = (id: string) =>
  req<ViagemDetalhe>(`/viagens/${id}`, 'GET');
export const atualizarViagem = (id: string, patch: PatchViagemInput) =>
  req<ViagemRow>(`/viagens/${id}`, 'PATCH', patch);
export const excluirViagem = (id: string) =>
  req<{ success: true }>(`/viagens/${id}`, 'DELETE').then(() => undefined);
export const criarDespesa = (viagemId: string, input: NovaDespesaInput) =>
  req<DespesaViagem>(`/viagens/${viagemId}/despesas`, 'POST', input);
export const atualizarDespesa = (id: string, patch: PatchDespesaInput) =>
  req<DespesaViagem>(`/despesas/${id}`, 'PATCH', patch);
export const excluirDespesa = (id: string) =>
  req<{ success: true }>(`/despesas/${id}`, 'DELETE').then(() => undefined);
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/despesasViagemApi.ts
git commit -m "feat: client tipado do /api/despesas-viagem"
```

---

### Task 4: `src/components/DespesasViagemModal.tsx`

**Files:**
- Create: `src/components/DespesasViagemModal.tsx`

**Interfaces:**
- Consumes: `despesasViagemApi` (Task 3); `centavosParaBRL`,
  `reaisParaCentavos`, `resumoPorCategoria`, `rotuloCategoria`,
  `CATEGORIAS_VALIDAS`, `ItemDespesa` (fase 1 + Task 2).
- Produces: `export default function DespesasViagemModal()` — sem props,
  usado pela Task 5 dentro da casca de modal em `App.tsx`.

- [ ] **Step 1: Criar o componente**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, RefreshCw } from 'lucide-react';
import {
  centavosParaBRL, reaisParaCentavos, resumoPorCategoria, rotuloCategoria,
  CATEGORIAS_VALIDAS, type ItemDespesa,
} from '../lib/despesasViagemReport';
import {
  listarViagens, criarViagem, getViagem, atualizarViagem, excluirViagem,
  criarDespesa, atualizarDespesa, excluirDespesa,
} from '../lib/despesasViagemApi';
import type {
  ViagemResumo, ViagemDetalhe, DespesaViagem,
  PatchViagemInput, NovaDespesaInput,
} from '../lib/despesasViagemApi';

const STATUS_ORDEM = ['aberta', 'fechada', 'enviada'] as const;
const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', fechada: 'Fechada', enviada: 'Enviada' };
const STATUS_BADGE: Record<string, string> = {
  aberta: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  fechada: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  enviada: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
};

const inputCls =
  'w-full mt-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-black dark:text-white';
const labelCls = 'text-xs font-semibold text-zinc-500 dark:text-zinc-400';

const brDate = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const hoje = () => new Date().toISOString().slice(0, 10);

function periodoLabel(v: { data_inicio: string | null; data_fim: string | null }) {
  const a = brDate(v.data_inicio);
  const b = brDate(v.data_fim);
  if (a && b) return `${a} – ${b}`;
  return a || b || 'sem período';
}
function toItem(d: DespesaViagem): ItemDespesa {
  return {
    categoria: d.categoria,
    descricao: d.descricao,
    valorCentavos: Number(d.valor_centavos),
    dataDespesa: d.data_despesa,
    estabelecimento: d.estabelecimento,
  };
}

// ── Formulário de despesa (criar/editar) ──────────────────────────
interface DespesaFormValue {
  categoria: string;
  valor: string;
  data_despesa: string;
  estabelecimento: string;
  descricao: string;
  documento_numero: string;
}
const despesaFormVazio = (): DespesaFormValue => ({
  categoria: 'combustivel', valor: '', data_despesa: hoje(),
  estabelecimento: '', descricao: '', documento_numero: '',
});
function despesaParaForm(d: DespesaViagem): DespesaFormValue {
  return {
    categoria: d.categoria,
    valor: centavosParaBRL(Number(d.valor_centavos)).replace('R$ ', ''),
    data_despesa: d.data_despesa.slice(0, 10),
    estabelecimento: d.estabelecimento ?? '',
    descricao: d.descricao ?? '',
    documento_numero: d.documento_numero ?? '',
  };
}

function DespesaForm({ inicial, salvando, onSalvar, onCancelar }: {
  inicial: DespesaFormValue;
  salvando: boolean;
  onSalvar: (p: NovaDespesaInput) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<DespesaFormValue>(inicial);
  const set = (k: keyof DespesaFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const centavos = reaisParaCentavos(f.valor);
    if (centavos === null) return toast.error('Valor inválido. Ex.: 250,00 ou 1.234,56');
    if (!f.data_despesa) return toast.error('Informe a data da despesa');
    onSalvar({
      categoria: f.categoria,
      valor_centavos: centavos,
      data_despesa: f.data_despesa,
      descricao: f.descricao.trim() || undefined,
      estabelecimento: f.estabelecimento.trim() || undefined,
      documento_numero: f.documento_numero.trim() || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
      <label className={labelCls}>
        Categoria
        <select className={inputCls} value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>
          {CATEGORIAS_VALIDAS.map((c) => <option key={c} value={c}>{rotuloCategoria(c)}</option>)}
        </select>
      </label>
      <label className={labelCls}>
        Valor (R$)
        <input className={inputCls} inputMode="decimal" placeholder="250,00" value={f.valor} onChange={(e) => set('valor', e.target.value)} />
      </label>
      <label className={labelCls}>
        Data
        <input type="date" className={inputCls} value={f.data_despesa} onChange={(e) => set('data_despesa', e.target.value)} />
      </label>
      <label className={labelCls}>
        Estabelecimento
        <input className={inputCls} value={f.estabelecimento} onChange={(e) => set('estabelecimento', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Descrição
        <input className={inputCls} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Nº do documento (opcional)
        <input className={inputCls} value={f.documento_numero} onChange={(e) => set('documento_numero', e.target.value)} />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-black dark:text-white">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

// ── Formulário de cabeçalho da viagem ─────────────────────────────
interface ViagemFormValue {
  titulo: string; destino: string; motivo: string;
  data_inicio: string; data_fim: string; observacoes: string;
}
function ViagemForm({ inicial, salvando, textoBotao, onSalvar, onCancelar }: {
  inicial: ViagemFormValue;
  salvando: boolean;
  textoBotao: string;
  onSalvar: (v: ViagemFormValue) => void;
  onCancelar: () => void;
}) {
  const [f, setF] = useState<ViagemFormValue>(inicial);
  const set = (k: keyof ViagemFormValue, v: string) => setF((p) => ({ ...p, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.titulo.trim()) return toast.error('Dê um título à viagem');
    onSalvar(f);
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
      <label className={`${labelCls} col-span-2`}>
        Título
        <input className={inputCls} value={f.titulo} placeholder="Bacabal → São Luís" onChange={(e) => set('titulo', e.target.value)} />
      </label>
      <label className={labelCls}>
        Destino
        <input className={inputCls} value={f.destino} onChange={(e) => set('destino', e.target.value)} />
      </label>
      <label className={labelCls}>
        Motivo
        <input className={inputCls} value={f.motivo} onChange={(e) => set('motivo', e.target.value)} />
      </label>
      <label className={labelCls}>
        Início
        <input type="date" className={inputCls} value={f.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
      </label>
      <label className={labelCls}>
        Fim
        <input type="date" className={inputCls} value={f.data_fim} onChange={(e) => set('data_fim', e.target.value)} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Observações
        <textarea className={inputCls} rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 text-black dark:text-white">Cancelar</button>
        <button type="submit" disabled={salvando} className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50">
          {salvando ? 'Salvando…' : textoBotao}
        </button>
      </div>
    </form>
  );
}

// ── Componente principal ──────────────────────────────────────────
export default function DespesasViagemModal() {
  const [viagens, setViagens] = useState<ViagemResumo[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [selId, setSelId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ViagemDetalhe | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [novaViagemAberta, setNovaViagemAberta] = useState(false);
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);
  const [addDespesaAberta, setAddDespesaAberta] = useState(false);
  const [editDespesaId, setEditDespesaId] = useState<string | null>(null);
  const [confirmDelViagem, setConfirmDelViagem] = useState(false);
  const [confirmDelDespesa, setConfirmDelDespesa] = useState<string | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  const carregarLista = useCallback(async () => {
    setCarregandoLista(true);
    try {
      setViagens(await listarViagens(filtro || undefined));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar viagens');
    } finally {
      setCarregandoLista(false);
    }
  }, [filtro]);

  const carregarDetalhe = useCallback(async (id: string) => {
    setCarregandoDetalhe(true);
    try {
      setDetalhe(await getViagem(id));
    } catch (e: any) {
      toast.error(e.message || 'Erro ao abrir a viagem');
      setDetalhe(null);
    } finally {
      setCarregandoDetalhe(false);
    }
  }, []);

  useEffect(() => { carregarLista(); }, [carregarLista]);
  useEffect(() => {
    if (selId) carregarDetalhe(selId);
    else setDetalhe(null);
    setEditandoCabecalho(false);
    setAddDespesaAberta(false);
    setEditDespesaId(null);
    setConfirmDelViagem(false);
    setConfirmDelDespesa(null);
  }, [selId, carregarDetalhe]);

  const recarregar = async () => {
    await carregarLista();
    if (selId) await carregarDetalhe(selId);
  };

  const handleNovaViagem = async (v: ViagemFormValue) => {
    setSalvando(true);
    try {
      const nova = await criarViagem({
        titulo: v.titulo.trim(),
        destino: v.destino.trim() || undefined,
        motivo: v.motivo.trim() || undefined,
        data_inicio: v.data_inicio || undefined,
        data_fim: v.data_fim || undefined,
        observacoes: v.observacoes.trim() || undefined,
      });
      setNovaViagemAberta(false);
      await carregarLista();
      setSelId(nova.id);
      toast.success('Viagem criada');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar viagem');
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarCabecalho = async (v: ViagemFormValue) => {
    if (!selId) return;
    setSalvando(true);
    try {
      const patch: PatchViagemInput = {
        titulo: v.titulo.trim(),
        destino: v.destino.trim(),
        motivo: v.motivo.trim(),
        data_inicio: v.data_inicio,
        data_fim: v.data_fim,
        observacoes: v.observacoes.trim(),
      };
      await atualizarViagem(selId, patch);
      setEditandoCabecalho(false);
      await recarregar();
      toast.success('Viagem atualizada');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!selId || detalhe?.status === status) return;
    try {
      await atualizarViagem(selId, { status });
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao mudar status');
    }
  };

  const handleExcluirViagem = async () => {
    if (!selId) return;
    try {
      await excluirViagem(selId);
      setSelId(null);
      await carregarLista();
      toast.success('Viagem excluída');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir viagem');
    }
  };

  const handleSalvarDespesa = async (p: NovaDespesaInput) => {
    if (!selId) return;
    setSalvando(true);
    try {
      if (editDespesaId) {
        await atualizarDespesa(editDespesaId, p);
        setEditDespesaId(null);
        toast.success('Despesa atualizada');
      } else {
        await criarDespesa(selId, p);
        setAddDespesaAberta(false);
        toast.success('Despesa lançada');
      }
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar despesa');
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirDespesa = async (id: string) => {
    try {
      await excluirDespesa(id);
      setConfirmDelDespesa(null);
      await recarregar();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir despesa');
    }
  };

  const despesas = detalhe?.despesas ?? [];
  const resumo = resumoPorCategoria(despesas.map(toItem));
  const totalNum = despesas.reduce((s, d) => s + Number(d.valor_centavos), 0);
  const despesasVisiveis = soPendentes
    ? despesas.filter((d) => d.ia_status === 'pendente' || d.ia_status === 'extraido' || d.ia_confianca === 'baixa')
    : despesas;

  return (
    <div className="flex h-[75vh] min-h-0">
      {/* ── Coluna esquerda: lista ── */}
      <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col min-h-0">
        <div className="p-3 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => { setNovaViagemAberta(true); setSelId(null); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Nova viagem
          </button>
          <div className="flex gap-1">
            {['', ...STATUS_ORDEM].map((s) => (
              <button
                key={s || 'todas'}
                onClick={() => setFiltro(s)}
                className={`flex-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
                  filtro === s
                    ? 'bg-zinc-800 text-white dark:bg-white dark:text-black'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                }`}
              >
                {s ? STATUS_LABEL[s] : 'Todas'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {carregandoLista && <p className="text-xs text-zinc-400 px-2 py-4">Carregando…</p>}
          {!carregandoLista && viagens.length === 0 && (
            <p className="text-xs text-zinc-400 px-2 py-4">Nenhuma viagem{filtro ? ' com esse status' : ''}.</p>
          )}
          {viagens.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelId(v.id)}
              className={`w-full text-left rounded-lg p-2.5 border ${
                selId === v.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-black dark:text-white truncate">{v.titulo}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${STATUS_BADGE[v.status] || ''}`}>
                  {STATUS_LABEL[v.status] || v.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 truncate">{v.destino || '—'} · {periodoLabel(v)}</p>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {centavosParaBRL(Number(v.total_centavos))} <span className="font-normal text-zinc-400">· {v.qtd_despesas} item(ns)</span>
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Coluna direita: detalhe ── */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-5">
        {novaViagemAberta && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-black dark:text-white">Nova viagem</p>
            <ViagemForm
              inicial={{ titulo: '', destino: '', motivo: '', data_inicio: hoje(), data_fim: '', observacoes: '' }}
              salvando={salvando}
              textoBotao="Criar viagem"
              onSalvar={handleNovaViagem}
              onCancelar={() => setNovaViagemAberta(false)}
            />
          </div>
        )}

        {!novaViagemAberta && !selId && (
          <div className="h-full flex items-center justify-center text-sm text-zinc-400">
            Selecione uma viagem à esquerda ou crie uma nova.
          </div>
        )}

        {!novaViagemAberta && selId && carregandoDetalhe && !detalhe && (
          <p className="text-sm text-zinc-400">Carregando viagem…</p>
        )}

        {!novaViagemAberta && detalhe && (
          <div className="space-y-5">
            {/* Cabeçalho */}
            {editandoCabecalho ? (
              <ViagemForm
                inicial={{
                  titulo: detalhe.titulo,
                  destino: detalhe.destino ?? '',
                  motivo: detalhe.motivo ?? '',
                  data_inicio: detalhe.data_inicio ?? '',
                  data_fim: detalhe.data_fim ?? '',
                  observacoes: detalhe.observacoes ?? '',
                }}
                salvando={salvando}
                textoBotao="Salvar"
                onSalvar={handleSalvarCabecalho}
                onCancelar={() => setEditandoCabecalho(false)}
              />
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-black dark:text-white truncate">{detalhe.titulo}</h3>
                  <p className="text-xs text-zinc-500">
                    {[detalhe.destino, detalhe.motivo].filter(Boolean).join(' · ') || 'sem destino/motivo'}
                  </p>
                  <p className="text-xs text-zinc-500">{periodoLabel(detalhe)} · {detalhe.empresa}</p>
                  {detalhe.observacoes && <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{detalhe.observacoes}</p>}
                </div>
                <button
                  onClick={() => setEditandoCabecalho(true)}
                  className="shrink-0 flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-black dark:hover:text-white"
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar dados
                </button>
              </div>
            )}

            {/* Status + excluir */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-1">
                {STATUS_ORDEM.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      detalhe.status === s
                        ? 'bg-zinc-800 text-white dark:bg-white dark:text-black'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              {confirmDelViagem ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-red-500 font-semibold">Excluir a viagem e todas as despesas?</span>
                  <button onClick={handleExcluirViagem} className="px-2 py-1 rounded-md bg-red-600 text-white font-bold">Sim, excluir</button>
                  <button onClick={() => setConfirmDelViagem(false)} className="px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-700">Não</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelViagem(true)}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir viagem
                </button>
              )}
            </div>

            {/* Totais */}
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Total da viagem</span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{centavosParaBRL(totalNum)}</span>
              </div>
              {resumo.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {resumo.map((r) => (
                    <span key={r.categoria} className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">
                      {r.rotulo}: {centavosParaBRL(r.totalCentavos)} ({r.qtd})
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Despesas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-black dark:text-white">Despesas</p>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
                    Só pendências
                  </label>
                  <button onClick={recarregar} className="text-zinc-400 hover:text-black dark:hover:text-white" title="Recarregar">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setAddDespesaAberta(true); setEditDespesaId(null); }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar despesa
                  </button>
                </div>
              </div>

              {addDespesaAberta && (
                <DespesaForm
                  inicial={despesaFormVazio()}
                  salvando={salvando}
                  onSalvar={handleSalvarDespesa}
                  onCancelar={() => setAddDespesaAberta(false)}
                />
              )}

              {despesasVisiveis.length === 0 && !addDespesaAberta && (
                <p className="text-xs text-zinc-400 py-3">
                  {soPendentes ? 'Nenhuma pendência.' : 'Nenhuma despesa nesta viagem ainda.'}
                </p>
              )}

              <div className="space-y-1.5">
                {despesasVisiveis.map((d) =>
                  editDespesaId === d.id ? (
                    <DespesaForm
                      key={d.id}
                      inicial={despesaParaForm(d)}
                      salvando={salvando}
                      onSalvar={handleSalvarDespesa}
                      onCancelar={() => setEditDespesaId(null)}
                    />
                  ) : (
                    <div key={d.id} className="flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-black dark:text-white truncate">
                          <span className="font-semibold">{rotuloCategoria(d.categoria)}</span>
                          {d.estabelecimento ? ` · ${d.estabelecimento}` : ''}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {brDate(d.data_despesa)}{d.descricao ? ` · ${d.descricao}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-black dark:text-white shrink-0">{centavosParaBRL(Number(d.valor_centavos))}</span>
                      <button onClick={() => { setEditDespesaId(d.id); setAddDespesaAberta(false); }} className="text-zinc-400 hover:text-black dark:hover:text-white shrink-0" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {confirmDelDespesa === d.id ? (
                        <button onClick={() => handleExcluirDespesa(d.id)} className="text-[11px] font-bold text-red-600 shrink-0">confirmar</button>
                      ) : (
                        <button onClick={() => setConfirmDelDespesa(d.id)} className="text-red-400 hover:text-red-600 shrink-0" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint` → sem erros. (Se acusar `custom-scrollbar` — é classe CSS
do projeto, já usada em `App.tsx`, não é erro de TS.)

- [ ] **Step 3: Commit**

```bash
git add src/components/DespesasViagemModal.tsx
git commit -m "feat: tela de despesas de viagem (CRUD manual de viagem e despesa)"
```

---

### Task 5: Ligar no store e no `App.tsx`

**Files:**
- Modify: `src/store.ts` (interface + implementação do estado do modal)
- Modify: `src/App.tsx` (import, ícone, destructure, DropdownItem, casca do modal)

**Interfaces:**
- Produces: `isDespesasViagemModalOpen: boolean` /
  `setDespesasViagemModalOpen(open: boolean)` na store, idêntico ao par
  `isProductReportModalOpen` (não entra em `partialize`).

- [ ] **Step 1: Estado na store**

`src/store.ts`, na interface (depois da linha 459,
`setProductReportModalOpen: (open: boolean) => void;`):
```ts
  isDespesasViagemModalOpen: boolean;
  setDespesasViagemModalOpen: (open: boolean) => void;
```

Na implementação (depois da linha 1063,
`setProductReportModalOpen: (open) => set({ isProductReportModalOpen: open }),`):
```ts
      isDespesasViagemModalOpen: false,
      setDespesasViagemModalOpen: (open) => set({ isDespesasViagemModalOpen: open }),
```

- [ ] **Step 2: Imports em `App.tsx`**

Junto dos outros imports de componente (perto da linha 5,
`import ProductReport from './components/ProductReport';`):
```ts
import DespesasViagemModal from './components/DespesasViagemModal';
```

No bloco de ícones lucide (termina na linha 33 em
`... FileSpreadsheet, Save, FolderPlus, FolderOpen`), acrescentar `Plane`:
```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet, Save, FolderPlus, FolderOpen, Plane
} from 'lucide-react';
```

- [ ] **Step 3: Desestruturar o estado**

Perto da linha 48 (`isProductReportModalOpen, setProductReportModalOpen,`):
```ts
    isProductReportModalOpen, setProductReportModalOpen,
    isDespesasViagemModalOpen, setDespesasViagemModalOpen,
```

- [ ] **Step 4: Item no dropdown Administração**

Logo depois do item "Relatório de Produtos" (linha 921):
```tsx
                  <DropdownItem icon={<Plane className="w-4 h-4" />} label="Despesas de Viagem" onClick={() => setDespesasViagemModalOpen(true)} />
```

- [ ] **Step 5: Casca do modal**

Logo depois do bloco `{isProductReportModalOpen && ( ... )}` (fecha na
linha ~1326, antes de `<SaveToFolderModal ... />`), inserir:

```tsx
      {/* Despesas de Viagem Modal */}
      {isDespesasViagemModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <Plane className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Despesas de Viagem</h3>
                  <p className="text-xs text-black dark:text-white opacity-60">Lançamento e relatório de despesas de viagem da Ultra Popular</p>
                </div>
              </div>
              <button
                onClick={() => setDespesasViagemModalOpen(false)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-grow overflow-hidden">
              <DespesasViagemModal />
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/store.ts src/App.tsx
git commit -m "feat: liga a tela de Despesas de Viagem no menu Administracao"
```

---

### Task 6: Teste manual no navegador

**Files:** nenhum — só verificação.

Pré-requisito: Postgres local do SmartPrice de pé (Postgres.app
`var-16-smartprice`, porta 5433 — o `.env` já aponta pra lá). MinIO não é
usado nesta fase.

- [ ] **Step 1: Subir o dev server**

Run: `npm run dev` → sobe em `http://localhost:3000`, sem
"Erro ao preparar schema de despesas de viagem" no log.

- [ ] **Step 2: Abrir a tela**

Login como admin → "Administração" → "Despesas de Viagem" → o modal abre com a
coluna de viagens (vazia ou com o que já existir) à esquerda.

- [ ] **Step 3: Criar viagem**

"Nova viagem" → título "Bacabal → São Luís", destino "São Luís/MA", motivo
"Visita lojas", início hoje → "Criar viagem". A viagem aparece selecionada à
direita, status "Aberta", total R$ 0,00.

- [ ] **Step 4: Lançar despesas (testa o parser de valor)**

"Adicionar despesa" → Combustível, valor `250,00`, hoje, "Posto Ipiranga" →
Salvar. Total vira **R$ 250,00**.
Outra → Pedágio, valor `1.234,56` → Salvar. Total vira **R$ 1.484,56**, e o
resumo por categoria mostra "Combustível: R$ 250,00 (1)" e
"Pedágio: R$ 1.234,56 (1)".

- [ ] **Step 5: Editar despesa**

Lápis na linha do combustível → troca o valor pra `245,90` → Salvar. Total
vira **R$ 1.480,46**.

- [ ] **Step 6: Status e pendências**

Clicar "Fechada" → badge da viagem na lista vira "Fechada". Marcar "Só
pendências" → lista de despesas fica vazia (na fase 2 tudo entra como
`revisado`). Desmarcar.

- [ ] **Step 7: Excluir**

Lixeira numa despesa → "confirmar" → some, total recalcula.
"Excluir viagem" → "Sim, excluir" → volta pro estado vazio e some da lista.
Conferir no banco:
```bash
psql -h localhost -p 5433 -U smartprice -d smartprice -tAc "SELECT count(*) FROM viagens_despesa; SELECT count(*) FROM despesas_viagem;"
```
Expected: as contagens refletem só o que você deixou (0 se apagou tudo).

- [ ] **Step 8: Filtro por status**

Criar 2 viagens, fechar uma. Os botões "Todas / Aberta / Fechada / Enviada" na
coluna esquerda filtram a lista corretamente.

---

### Task 7: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Suíte de testes**

Run: `npm test` → todas as linhas `PASS`, exit 0.

- [ ] **Step 2: Typecheck**

Run: `npm run lint` → sem erros.

- [ ] **Step 3: Atualizar o índice do vault**

Em `../../projetos/CLAUDE.md` (vault), atualizar a linha do SmartPrice: fase 2
(tela de CRUD manual no menu Administração) implementada.

- [ ] **Step 4: Não fazer deploy ainda**

Combinar com o José. Deploy só depois de uma leva de fases (a fase 4+ traz as
envs do WhatsApp/IA e o bucket privado no MinIO).

---

## Próximas fases

3. `src/lib/reciboExtract.ts` + endpoint de extração + botão "extrair" na tela.
4. Webhook WhatsApp (Meta Cloud API): verificação, assinatura, download de mídia.
5. Máquina de estados da conversa (viagem ativa, confirmação, correção).
6. Geração de PDF (`pdfkit`) + Excel (`xlsx`), entrega pelos dois canais.
7. Polish: realtime no modal, revisão de pendências, lembrete de viagem aberta.
