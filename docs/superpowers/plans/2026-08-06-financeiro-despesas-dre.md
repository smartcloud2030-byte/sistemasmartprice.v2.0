# Despesas e DRE no painel Financeiro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba de Despesas dentro do modal Financeiro existente, com lançamento de custos (domínio, IA, outros — recorrentes ou avulsos) e um resumo estilo DRE (Receita − Despesas = Resultado) navegável por mês.

**Architecture:** A lógica de cálculo (quais despesas contam em qual mês, totais) vive em funções puras e testáveis em `src/lib/despesas.ts`. O estado global (`src/store.ts`) ganha um array `despesas`, persistido reaproveitando o mesmo blob JSON que `saveUsersAndFlags`/`loadUsersAndFlags` já salvam em `settings.users_and_flags` — sem endpoint novo no backend. A UI se divide em `FinanceiroPanel.tsx` (casca: header, resumo DRE, abas) e um componente novo `FinanceiroDespesasTab.tsx` (lista, formulário, navegação de mês).

**Tech Stack:** React + Zustand (front-end apenas — nenhuma mudança de backend). Testes com `node:assert` via `tsx`, mesmo padrão de `src/notaFiscal.test.ts`.

## Global Constraints

- Categoria de despesa é enum fixo: `'dominio' | 'ia' | 'outros'` — sem categoria livre.
- Receita no DRE é sempre o MRR **atual** (não histórico), mesmo navegando pra meses passados — deixar isso visualmente explícito na UI.
- Nenhuma rota de API nova — persistência via `saveUsersAndFlags`/`loadUsersAndFlags` já existentes.
- Spec de referência: `docs/superpowers/specs/2026-08-06-financeiro-despesas-dre-design.md`.

---

### Task 1: Tipo `Despesa` e funções puras de cálculo do DRE (`src/lib/despesas.ts`)

**Files:**
- Create: `src/lib/despesas.ts`
- Create: `src/lib/despesas.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (usado pelas Tasks 2, 3 e 4):
  - `export interface Despesa { id: string; descricao: string; categoria: 'dominio' | 'ia' | 'outros'; valor: number; recorrente: boolean; data: string; dataFim?: string; fornecedor?: string; }`
  - `export function mesAnoStr(ano: number, mes: number): string`
  - `export function isDespesaAtivaNoMes(despesa: Despesa, ano: number, mes: number): boolean`
  - `export function despesasDoMes(despesas: Despesa[], ano: number, mes: number): Despesa[]`
  - `export function totalDespesasDoMes(despesas: Despesa[], ano: number, mes: number): number`
  - `export function formatMesAno(ano: number, mes: number): string`
  - `export function mesAnterior(ano: number, mes: number): { ano: number; mes: number }`
  - `export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number }`

- [ ] **Step 1: Escrever o teste que falha primeiro (`src/lib/despesas.test.ts`)**

```typescript
import assert from 'node:assert';
import { isDespesaAtivaNoMes, despesasDoMes, totalDespesasDoMes, formatMesAno, mesAnterior, mesSeguinte, Despesa } from './despesas';

const base: Despesa = {
  id: '1',
  descricao: 'Domínio sistemasmartprice.com.br',
  categoria: 'dominio',
  valor: 45,
  recorrente: false,
  data: '2026-08-06',
};

function despesaAvulsaSoContaNoMesExato() {
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 8), true);
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 7), false);
  assert.strictEqual(isDespesaAtivaNoMes(base, 2026, 9), false);
}

function despesaRecorrenteContaNoMesDeInicioEEmMesesFuturos() {
  const d: Despesa = { ...base, recorrente: true, data: '2026-06-01' };
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 5), false);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 6), true);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 12), true);
}

function despesaRecorrenteComDataFimParaDeContarNoMesDefinido() {
  const d: Despesa = { ...base, recorrente: true, data: '2026-01-01', dataFim: '2026-09-01' };
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 8), true);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 9), false);
  assert.strictEqual(isDespesaAtivaNoMes(d, 2026, 10), false);
}

function despesasDoMesFiltraCorretamenteEntreRecorrentesEAvulsas() {
  const avulsaForaDoMes: Despesa = { ...base, id: '2', data: '2026-01-10' };
  const recorrenteAtiva: Despesa = { ...base, id: '3', recorrente: true, data: '2026-01-01', categoria: 'ia', valor: 100 };
  const lista = [base, avulsaForaDoMes, recorrenteAtiva];
  const doMes = despesasDoMes(lista, 2026, 8);
  assert.strictEqual(doMes.length, 2);
  assert.ok(doMes.some((d) => d.id === '1'));
  assert.ok(doMes.some((d) => d.id === '3'));
}

function totalDespesasDoMesSomaOsValoresAtivos() {
  const lista: Despesa[] = [
    { ...base, id: '1', valor: 45 },
    { ...base, id: '2', recorrente: true, data: '2026-01-01', valor: 100 },
    { ...base, id: '3', data: '2026-01-10', valor: 999 },
  ];
  assert.strictEqual(totalDespesasDoMes(lista, 2026, 8), 145);
}

function formatMesAnoFormataEmPortugues() {
  assert.strictEqual(formatMesAno(2026, 8), 'Agosto 2026');
  assert.strictEqual(formatMesAno(2026, 1), 'Janeiro 2026');
}

function mesAnteriorEMesSeguinteViramOAno() {
  assert.deepStrictEqual(mesAnterior(2026, 1), { ano: 2025, mes: 12 });
  assert.deepStrictEqual(mesSeguinte(2026, 12), { ano: 2027, mes: 1 });
  assert.deepStrictEqual(mesAnterior(2026, 8), { ano: 2026, mes: 7 });
  assert.deepStrictEqual(mesSeguinte(2026, 8), { ano: 2026, mes: 9 });
}

try {
  despesaAvulsaSoContaNoMesExato();
  despesaRecorrenteContaNoMesDeInicioEEmMesesFuturos();
  despesaRecorrenteComDataFimParaDeContarNoMesDefinido();
  despesasDoMesFiltraCorretamenteEntreRecorrentesEAvulsas();
  totalDespesasDoMesSomaOsValoresAtivos();
  formatMesAnoFormataEmPortugues();
  mesAnteriorEMesSeguinteViramOAno();
  console.log('PASS: todos os testes de despesas (calculo do DRE) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/despesas.test.ts`
Expected: falha com `Cannot find module './despesas'`.

- [ ] **Step 3: Implementar `src/lib/despesas.ts`**

```typescript
// ─────────────────────────────────────────
// despesas.ts — Modelo e cálculo do DRE do painel Financeiro
// Funções puras: quais despesas contam em qual mês, totais, navegação de mês.
// ─────────────────────────────────────────

export interface Despesa {
  id: string;
  descricao: string;
  categoria: 'dominio' | 'ia' | 'outros';
  valor: number;
  recorrente: boolean;
  data: string;        // ISO date — início da despesa (avulsa: a data do gasto)
  dataFim?: string;     // ISO date, opcional — despesa recorrente para de contar a partir desse mês
  fornecedor?: string;  // opcional — nome do fornecedor e/ou link
}

export function mesAnoStr(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

export function isDespesaAtivaNoMes(despesa: Despesa, ano: number, mes: number): boolean {
  const alvo = mesAnoStr(ano, mes);
  const inicio = despesa.data.slice(0, 7);
  if (!despesa.recorrente) {
    return inicio === alvo;
  }
  if (inicio > alvo) return false;
  if (despesa.dataFim && alvo >= despesa.dataFim.slice(0, 7)) return false;
  return true;
}

export function despesasDoMes(despesas: Despesa[], ano: number, mes: number): Despesa[] {
  return despesas.filter((d) => isDespesaAtivaNoMes(d, ano, mes));
}

export function totalDespesasDoMes(despesas: Despesa[], ano: number, mes: number): number {
  return despesasDoMes(despesas, ano, mes).reduce((sum, d) => sum + d.valor, 0);
}

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function formatMesAno(ano: number, mes: number): string {
  return `${NOMES_MES[mes - 1]} ${ano}`;
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export function mesSeguinte(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/despesas.test.ts`
Expected: `PASS: todos os testes de despesas (calculo do DRE) passaram`

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

Adiciona `tsx src/lib/despesas.test.ts` à cadeia do script `"test"`, mesma convenção dos outros `tsx src/*.test.ts` já encadeados.

Run: `npm test`
Expected: todas as linhas `PASS: ...` aparecem, sem `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/despesas.ts src/lib/despesas.test.ts
git commit -m "feat: funcoes puras de calculo do DRE (despesas por mes)"
```

---

### Task 2: Estado global — `despesas` em `src/store.ts`

**Files:**
- Modify: `src/store.ts` (imports, interface `AppState`, implementação das ações, `saveUsersAndFlags`, `loadUsersAndFlags`, `partialize`)

**Interfaces:**
- Consumes: `Despesa` de `./lib/despesas` (Task 1).
- Produces (usado pelas Tasks 3 e 4):
  - `despesas: Despesa[]`
  - `addDespesa: (despesa: Despesa) => void`
  - `updateDespesa: (id: string, patch: Partial<Despesa>) => void`
  - `removeDespesa: (id: string) => void`
  - Re-exporta o tipo `Despesa` (pra componentes importarem via `../store`, mesmo padrão de `Product`/`Announcement`).

- [ ] **Step 1: Importar o tipo `Despesa`**

No topo de `src/store.ts`, junto dos outros imports (perto da linha 4, `import { isStoreOnline } from './lib/utils';`):

```typescript
import type { Despesa } from './lib/despesas';

export type { Despesa };
```

- [ ] **Step 2: Adicionar à interface `AppState`**

Perto da declaração de `announcements`/`addAnnouncement`/`deleteAnnouncement` (linhas 556-559):

```typescript
  announcements: Announcement[];
  setAnnouncements: (announcements: Announcement[]) => void;
  addAnnouncement: (announcement: Announcement) => void;
  deleteAnnouncement: (id: string) => void;
  despesas: Despesa[];
  addDespesa: (despesa: Despesa) => void;
  updateDespesa: (id: string, patch: Partial<Despesa>) => void;
  removeDespesa: (id: string) => void;
```

- [ ] **Step 3: Implementar as ações**

Logo depois de `deleteAnnouncement` (depois da linha 1190, antes de `seenAnnouncements: [],`):

```typescript
      despesas: [],
      addDespesa: (despesa) => set((state) => {
        const newDespesas = [...state.despesas, despesa];
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { despesas: newDespesas };
      }),
      updateDespesa: (id, patch) => set((state) => {
        const newDespesas = state.despesas.map((d) => d.id === id ? { ...d, ...patch } : d);
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { despesas: newDespesas };
      }),
      removeDespesa: (id) => set((state) => {
        const newDespesas = state.despesas.filter((d) => d.id !== id);
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { despesas: newDespesas };
      }),
```

- [ ] **Step 4: Incluir `despesas` no payload salvo (`saveUsersAndFlags`)**

Dentro do objeto `value` passado pra `apiPost('/settings/users_and_flags', ...)` (perto da linha 1650, junto de `announcements: state.announcements,`):

```typescript
              allowedStores: cleanAllowedStores,
              flags: state.flags,
              maxConcurrentStores: state.maxConcurrentStores,
              cnpjUserLimits: state.cnpjUserLimits,
              userGroups: state.userGroups,
              announcements: state.announcements,
              seenAnnouncements: state.seenAnnouncements,
              despesas: state.despesas,
              isChatEnabled: state.isChatEnabled
```

- [ ] **Step 5: Incluir `despesas` no carregamento (`loadUsersAndFlags`)**

Dentro do `set({...})` de `loadUsersAndFlags` (perto da linha 1691, junto de `announcements: settings.announcements || [],`):

```typescript
            allowedStores: mergedStores,
            flags: settings.flags || currentState.flags,
            maxConcurrentStores: settings.maxConcurrentStores !== undefined ? settings.maxConcurrentStores : currentState.maxConcurrentStores,
            cnpjUserLimits: settings.cnpjUserLimits || currentState.cnpjUserLimits,
            userGroups: settings.userGroups || [],
            announcements: settings.announcements || [],
            seenAnnouncements: settings.seenAnnouncements || currentState.seenAnnouncements,
            despesas: settings.despesas || currentState.despesas,
            isChatEnabled: settings.isChatEnabled !== undefined ? settings.isChatEnabled : true
```

- [ ] **Step 6: Incluir `despesas` no `partialize` (cache local via localStorage)**

Perto da linha 1944 (`announcements: state.announcements,`), dentro do objeto retornado por `partialize`:

```typescript
        announcements: state.announcements,
        seenAnnouncements: state.seenAnnouncements,
        despesas: state.despesas,
```

- [ ] **Step 7: Rodar o typecheck**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/store.ts
git commit -m "feat: estado global de despesas (persistido junto com users_and_flags)"
```

---

### Task 3: `src/components/FinanceiroDespesasTab.tsx` — lista, formulário e navegação de mês

**Files:**
- Create: `src/components/FinanceiroDespesasTab.tsx`

**Interfaces:**
- Consumes: `despesas`, `addDespesa`, `updateDespesa`, `removeDespesa` de `useStore()` (Task 2); `Despesa`, `despesasDoMes`, `formatMesAno` de `../lib/despesas` (Task 1); `cn` de `../lib/utils`.
- Produces (usado pela Task 4):
  - `export default function FinanceiroDespesasTab(props: { year: number; month: number; onPrevMonth: () => void; onNextMonth: () => void }): JSX.Element`

- [ ] **Step 1: Implementar o componente**

```tsx
import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Globe, Sparkles, Tag, X } from 'lucide-react';
import { useStore } from '../store';
import type { Despesa } from '../lib/despesas';
import { despesasDoMes, formatMesAno } from '../lib/despesas';
import { cn } from '../lib/utils';

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CATEGORIAS: Record<Despesa['categoria'], { label: string; icon: React.ElementType; badgeClass: string }> = {
  dominio: { label: 'Domínio', icon: Globe, badgeClass: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  ia: { label: 'IA', icon: Sparkles, badgeClass: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' },
  outros: { label: 'Outros', icon: Tag, badgeClass: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300' },
};

interface Props {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

interface FormState {
  descricao: string;
  categoria: Despesa['categoria'];
  valor: string;
  recorrente: boolean;
  data: string;
  fornecedor: string;
}

const emptyForm: FormState = {
  descricao: '',
  categoria: 'outros',
  valor: '',
  recorrente: true,
  data: new Date().toISOString().slice(0, 10),
  fornecedor: '',
};

export default function FinanceiroDespesasTab({ year, month, onPrevMonth, onNextMonth }: Props) {
  const { despesas, addDespesa, updateDespesa, removeDespesa } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const doMes = despesasDoMes(despesas, year, month);

  const openNewForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (d: Despesa) => {
    setEditingId(d.id);
    setForm({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: String(d.valor),
      recorrente: d.recorrente,
      data: d.data.slice(0, 10),
      fornecedor: d.fornecedor || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = Number(form.valor.replace(',', '.'));
    if (!form.descricao.trim() || !valor || valor <= 0) return;

    const payload = {
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      valor,
      recorrente: form.recorrente,
      data: form.data,
      fornecedor: form.fornecedor.trim() || undefined,
    };

    if (editingId) {
      updateDespesa(editingId, payload);
    } else {
      addDespesa({ id: crypto.randomUUID(), ...payload });
    }
    closeForm();
  };

  const handleEncerrarRecorrente = (d: Despesa) => {
    updateDespesa(d.id, { dataFim: new Date().toISOString().slice(0, 10) });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onPrevMonth} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-bold text-black dark:text-white w-32 text-center">{formatMesAno(year, month)}</p>
          <button onClick={onNextMonth} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nova despesa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mx-6 mt-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{editingId ? 'Editar despesa' : 'Nova despesa'}</p>
            <button type="button" onClick={closeForm} className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Descrição (ex.: Domínio sistemasmartprice.com.br)"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as Despesa['categoria'] })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
            >
              {Object.entries(CATEGORIAS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Valor (R$)"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
              className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
              required
            />
            <label className="flex items-center gap-2 text-sm text-black dark:text-white px-1">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={(e) => setForm({ ...form, recorrente: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Recorrente (todo mês)
            </label>
          </div>
          <input
            type="text"
            placeholder="Fornecedor/link (opcional)"
            value={form.fornecedor}
            onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            className="w-full px-3 py-2 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-black dark:text-white"
          />
          <button
            type="submit"
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            {editingId ? 'Salvar alterações' : 'Adicionar despesa'}
          </button>
        </form>
      )}

      <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-4 space-y-2">
        {doMes.length === 0 ? (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">
            Nenhuma despesa neste mês.
          </p>
        ) : (
          doMes.map((d) => {
            const { label, icon: Icon, badgeClass } = CATEGORIAS[d.categoria];
            return (
              <div key={d.id} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', badgeClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-black dark:text-white truncate">{d.descricao}</p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {label} · {currency(d.valor)}{d.recorrente ? '/mês' : ''}
                      {d.fornecedor && <> · {d.fornecedor}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {d.recorrente && !d.dataFim && (
                    <button
                      onClick={() => handleEncerrarRecorrente(d)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                    >
                      Encerrar
                    </button>
                  )}
                  <button onClick={() => openEditForm(d)} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
                    <Pencil className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button onClick={() => removeDespesa(d.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-colors">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npm run lint`
Expected: erro esperado só de "`FinanceiroDespesasTab` declarado mas nunca usado" não deve aparecer (é `export default`, não sobra import não usado); qualquer outro erro de tipo deve ser corrigido antes de prosseguir.

- [ ] **Step 3: Commit**

```bash
git add src/components/FinanceiroDespesasTab.tsx
git commit -m "feat: componente da aba Despesas (lista, formulario, navegacao de mes)"
```

---

### Task 4: `src/components/FinanceiroPanel.tsx` — abas + resumo DRE

**Files:**
- Modify: `src/components/FinanceiroPanel.tsx` (reescrita completa)

**Interfaces:**
- Consumes: `despesas` de `useStore()` (Task 2); `totalDespesasDoMes`, `mesAnterior`, `mesSeguinte` de `../lib/despesas` (Task 1); `FinanceiroDespesasTab` (Task 3).

- [ ] **Step 1: Reescrever o arquivo**

```tsx
import React, { useState } from 'react';
import { X, CreditCard, AlertTriangle, Search, Wallet, Info } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { totalDespesasDoMes, mesAnterior, mesSeguinte } from '../lib/despesas';
import FinanceiroDespesasTab from './FinanceiroDespesasTab';

interface Props {
  onClose: () => void;
}

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function FinanceiroPanel({ onClose }: Props) {
  const { allowedStores, togglePaymentBlock, despesas } = useStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'receitas' | 'despesas'>('receitas');
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const withSubscription = allowedStores.filter((s) => s.asaasSubscriptionId);
  const blockedCount = withSubscription.filter((s) => s.isPaymentBlocked).length;
  const mrr = withSubscription.reduce((sum, s) => sum + (s.subscriptionValue || 0), 0);
  const despesasDoMesTotal = totalDespesasDoMes(despesas, selectedYear, selectedMonth);
  const resultado = mrr - despesasDoMesTotal;

  const handlePrevMonth = () => {
    const { ano, mes } = mesAnterior(selectedYear, selectedMonth);
    setSelectedYear(ano);
    setSelectedMonth(mes);
  };
  const handleNextMonth = () => {
    const { ano, mes } = mesSeguinte(selectedYear, selectedMonth);
    setSelectedYear(ano);
    setSelectedMonth(mes);
  };

  const filtered = withSubscription.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return s.cnpj.toLowerCase().includes(q) || s.bandeira?.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600 rounded-lg text-white">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-black dark:text-white">Financeiro</h3>
              <p className="text-xs text-black dark:text-white opacity-60">Receitas, despesas e resultado do sistema</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-3 gap-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-black text-black dark:text-white tracking-tighter">{currency(mrr)}</p>
              <Info className="w-3.5 h-3.5 text-zinc-400" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400" title="Receita atual (MRR) — sem histórico por mês">Receita Atual</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <p className="text-2xl font-black text-red-600 tracking-tighter">{currency(despesasDoMesTotal)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Despesas do Mês</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
            <p className={cn('text-2xl font-black tracking-tighter', resultado >= 0 ? 'text-emerald-600' : 'text-red-600')}>{currency(resultado)}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Resultado</p>
          </div>
        </div>

        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => setActiveTab('receitas')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'receitas' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Receitas
          </button>
          <button
            onClick={() => setActiveTab('despesas')}
            className={cn(
              'px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors',
              activeTab === 'despesas' ? 'bg-amber-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
            )}
          >
            Despesas
          </button>
        </div>

        {activeTab === 'receitas' ? (
          <>
            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por CNPJ ou bandeira..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-4 space-y-2">
              {withSubscription.length === 0 ? (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">
                  Nenhum CNPJ com assinatura ainda — crie uma em "Gerenciar Usuários".
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-xs font-bold uppercase tracking-widest text-zinc-400 py-10">Nenhum resultado.</p>
              ) : (
                filtered.map((s) => (
                  <div key={s.cnpj} className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                        s.isPaymentBlocked ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600'
                      )}>
                        {s.isPaymentBlocked ? <AlertTriangle className="w-4 h-4" /> : <CreditCard className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-black dark:text-white truncate">{s.cnpj} <span className="text-zinc-400 font-normal">· {s.bandeira}</span></p>
                        <p className="text-[11px] text-zinc-400">{currency(s.subscriptionValue || 0)}/mês · vence dia {s.subscriptionDueDay}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePaymentBlock(s.cnpj)}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm flex-shrink-0',
                        s.isPaymentBlocked
                          ? 'bg-orange-600 border-orange-600 text-white'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                      )}
                    >
                      {s.isPaymentBlocked ? 'Bloqueado' : 'Em dia'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <FinanceiroDespesasTab
            year={selectedYear}
            month={selectedMonth}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
        )}
      </div>
    </div>
  );
}
```

Nota: `blockedCount` deixa de ser exibido como card próprio (o card "Pendências" existia antes; nesta reescrita os 3 cards do topo viram Receita/Despesas/Resultado, formando o DRE). Se quiser manter a contagem de pendências visível em algum lugar, ela já aparece implicitamente em cada linha da aba Receitas (badge "Bloqueado" por CNPJ) — confirme com o usuário se isso é aceitável antes de remover de vez a variável, ou mantenha `blockedCount` calculado mas sem card dedicado (a variável já não é mais lida em lugar nenhum nesta versão — se o `tsc --noEmit` acusar "declared but never used", remova a linha `const blockedCount = ...` do arquivo).

- [ ] **Step 2: Rodar o typecheck**

Run: `npm run lint`
Expected: sem erros. Se `blockedCount` acusar erro de variável não utilizada, remova a linha (ver nota acima).

- [ ] **Step 3: Testar no navegador**

Run: `npm run dev`, logar como admin, abrir **Financeiro**.

- Aba Receitas: continua mostrando as assinaturas como antes.
- Aba Despesas: navegar entre meses (← →), cadastrar uma despesa recorrente (ex.: "IA — Claude", categoria IA, R$ 100, recorrente, data de hoje) e confirmar que ela aparece no mês atual e em meses futuros ao navegar, mas não em meses anteriores à data de início.
- Cadastrar uma despesa avulsa (ex.: "Renovação domínio", categoria Domínio, recorrente desmarcado) e confirmar que só aparece no mês exato da data informada.
- Clicar em "Encerrar" numa despesa recorrente e confirmar que ela some do mês seguinte em diante, mas continua aparecendo no mês atual.
- Editar e excluir uma despesa, confirmar que a lista atualiza.
- Conferir que o resumo no topo (Receita/Despesas do Mês/Resultado) muda ao trocar de aba de mês na aba Despesas.
- Fechar o modal e reabrir (ou dar F5) — as despesas cadastradas devem continuar lá (persistência via `saveUsersAndFlags`/`loadUsersAndFlags`).

Expected: todos os comportamentos acima batem.

- [ ] **Step 4: Commit**

```bash
git add src/components/FinanceiroPanel.tsx
git commit -m "feat: aba Despesas e resumo DRE no painel Financeiro"
```
