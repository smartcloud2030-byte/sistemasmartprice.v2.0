# Encarte Online v2 (Moldes + Perfil de Loja) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela "Encarte Online" atual (grade fixa 4/6/8/10/12) por um
sistema de Moldes reutilizáveis (arte de fundo + posições configuráveis) e
Perfis de Loja (logo/endereço/telefone/Instagram reaproveitáveis entre
clientes do grupo), pra reduzir o trabalho manual em Photoshop na montagem
dos encartes semanais.

**Architecture:** Três novas entidades persistidas via o padrão já existente
de `settings` (`POST /settings/:id`, `api.ts:350-367`) em ids dedicados
(`encarte_lojas`, `encarte_moldes`, `encarte_semanais`) — sem mexer no blob
`users_and_flags`. Cinco componentes novos em `src/components/encarte/`
substituem `src/components/EncarteCreator.tsx` (2601 linhas, deletado no
último task). Toda a lógica de posicionamento pura (distribuir grade,
formatar preço, ler resposta da API de CNPJ) fica isolada em
`src/lib/*.ts`, testada com o padrão de testes já usado no projeto (funções
+ `node:assert`, rodadas via `tsx`).

**Tech Stack:** React + TypeScript + Zustand (`useStore`), Tailwind, Pointer
Events nativos (sem lib de drag/resize nova), `html2canvas` + `jsPDF`
(já dependências do projeto), `sonner` (toast), `lucide-react` (ícones).

## Global Constraints

- **Testar local antes de qualquer deploy.** Nada sobe na VPS até o usuário
  aprovar depois de testar localmente (`npm run dev`).
- **Sem migração de dados do Encarte antigo** — ele está vazio na prática
  (spec, seção "Decisões já tomadas").
- **Sem novas dependências npm** — reaproveitar `html2canvas`, `jsPDF`,
  `lucide-react`, `sonner`, `motion/react` já presentes.
- **Tipografia**: manter o padrão condensado caixa-alta já usado no Encarte
  atual — não introduzir fontes novas.
- **Testes de lógica pura seguem o padrão do projeto**: arquivo
  `<nome>.test.ts` ao lado do arquivo testado, funções simples +
  `node:assert`, chamadas num bloco `try { ... } catch` no final do
  arquivo, adicionado à cadeia do script `test` em `package.json`. Não
  existe Vitest/Jest configurado — não introduzir um.
- **Componentes React não têm suite de teste automatizado** neste projeto
  (nenhum `EncarteCreator.tsx`, `ProductManager.tsx` etc. tem `.test.tsx`)
  — a verificação de cada componente é `npm run lint` (checagem de tipos,
  `tsc --noEmit`) + teste manual via `npm run dev`, seguindo o mesmo padrão
  já usado no restante do projeto.

---

## Mapa de arquivos

**Criar:**
- `src/lib/encarteGrid.ts` + `src/lib/encarteGrid.test.ts`
- `src/lib/encartePrice.ts` + `src/lib/encartePrice.test.ts`
- `src/lib/cnpjLookup.ts` + `src/lib/cnpjLookup.test.ts`
- `src/components/encarte/DraggableBox.tsx`
- `src/components/encarte/StoreProfileManager.tsx`
- `src/components/encarte/MoldeEditor.tsx`
- `src/components/encarte/MoldeList.tsx`
- `src/components/encarte/EncarteWeekly.tsx`
- `src/components/encarte/EncarteBuilder.tsx`

**Modificar:**
- `src/store.ts` — novos tipos/estado/ações (Task 1); remoção dos campos do
  Encarte antigo (Task 11).
- `src/App.tsx` — trocar `EncarteCreator` por `EncarteBuilder` (Task 11).
- `package.json` — adicionar os 3 novos arquivos de teste à cadeia do
  script `test` (Tasks 2-4).

**Deletar:**
- `src/components/EncarteCreator.tsx` (Task 11).

---

### Task 1: Tipos e persistência no store

**Files:**
- Modify: `src/store.ts`

**Interfaces:**
- Produz (usado por todos os tasks seguintes):
  - `interface StoreProfile { id: string; cnpj?: string; nome: string; logoUrl: string; endereco: string; telefone: string; instagram: string; }`
  - `interface EncarteSlotDef { id: string; tipo: 'produto' | 'data' | 'logo' | 'contato'; xPct: number; yPct: number; widthPct: number; heightPct: number; }`
  - `interface EncarteMolde { id: string; nome: string; frontBgUrl: string; backBgUrl?: string; frontSlots: EncarteSlotDef[]; backSlots?: EncarteSlotDef[]; }`
  - `interface EncarteSemanal { id: string; moldeId: string; storeProfileId: string; validade: string; produtos: Record<string, SelectedProduct | null>; }`
  - No `useStore()`: `storeProfiles`, `fetchStoreProfiles()`, `saveStoreProfiles(profiles)`; `encarteMoldes`, `fetchEncarteMoldes()`, `saveEncarteMoldes(moldes)`; `encartesSemanais`, `fetchEncartesSemanais()`, `saveEncartesSemanais(semanais)`.
- Consome: `SelectedProduct` já existente (`src/store.ts:150-170`), `apiGet`/`apiPost` já existentes (`src/store.ts:10-26`).

- [ ] **Step 1: Adicionar os tipos novos**

Em `src/store.ts`, logo após o fechamento da interface `SelectedProduct`
(procure por `tituloDesconto?: string;` seguido de `}` — é a última
propriedade da interface, por volta da linha 170), adicione:

```ts
export interface StoreProfile {
  id: string;
  cnpj?: string;
  nome: string;
  logoUrl: string;
  endereco: string;
  telefone: string;
  instagram: string;
}

export interface EncarteSlotDef {
  id: string;
  tipo: 'produto' | 'data' | 'logo' | 'contato';
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface EncarteMolde {
  id: string;
  nome: string;
  frontBgUrl: string;
  backBgUrl?: string;
  frontSlots: EncarteSlotDef[];
  backSlots?: EncarteSlotDef[];
}

export interface EncarteSemanal {
  id: string;
  moldeId: string;
  storeProfileId: string;
  validade: string;
  produtos: Record<string, SelectedProduct | null>;
}
```

- [ ] **Step 2: Declarar o estado e as ações na interface `AppState`**

Procure a linha `encartes: EncarteSlot[];` dentro de `interface AppState`
(por volta da linha 464) e adicione **antes** dela:

```ts
  storeProfiles: StoreProfile[];
  fetchStoreProfiles: () => Promise<void>;
  saveStoreProfiles: (profiles: StoreProfile[]) => Promise<void>;
  encarteMoldes: EncarteMolde[];
  fetchEncarteMoldes: () => Promise<void>;
  saveEncarteMoldes: (moldes: EncarteMolde[]) => Promise<void>;
  encartesSemanais: EncarteSemanal[];
  fetchEncartesSemanais: () => Promise<void>;
  saveEncartesSemanais: (semanais: EncarteSemanal[]) => Promise<void>;
```

- [ ] **Step 3: Implementar as ações no corpo da store**

Procure a linha `encartes: Array(10).fill(null).map(...)` dentro do corpo
da store (função `create<AppState>()(...)`, por volta da linha 1504) e
adicione **antes** dela:

```ts
      storeProfiles: [],
      fetchStoreProfiles: async () => {
        const data = await apiGet('/settings/encarte_lojas');
        set({ storeProfiles: data?.value || [] });
      },
      saveStoreProfiles: async (profiles) => {
        set({ storeProfiles: profiles });
        await apiPost('/settings/encarte_lojas', { value: profiles });
      },

      encarteMoldes: [],
      fetchEncarteMoldes: async () => {
        const data = await apiGet('/settings/encarte_moldes');
        set({ encarteMoldes: data?.value || [] });
      },
      saveEncarteMoldes: async (moldes) => {
        set({ encarteMoldes: moldes });
        await apiPost('/settings/encarte_moldes', { value: moldes });
      },

      encartesSemanais: [],
      fetchEncartesSemanais: async () => {
        const data = await apiGet('/settings/encarte_semanais');
        set({ encartesSemanais: data?.value || [] });
      },
      saveEncartesSemanais: async (semanais) => {
        set({ encartesSemanais: semanais });
        await apiPost('/settings/encarte_semanais', { value: semanais });
      },

```

- [ ] **Step 4: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos relacionados a `StoreProfile`, `EncarteMolde`,
`EncarteSlotDef`, `EncarteSemanal` ou às novas ações (erros pré-existentes
em `EncarteCreator.tsx`, se algum aparecer por causa de tipos deletados
depois, só serão resolvidos no Task 11 — não é esperado nenhum agora, já
que nada foi removido ainda).

- [ ] **Step 5: Commit**

```bash
git add src/store.ts
git commit -m "feat: tipos e persistencia para Perfil de Loja, Molde e Encarte semanal"
```

---

### Task 2: `src/lib/encarteGrid.ts` — distribuição automática de slots

**Files:**
- Create: `src/lib/encarteGrid.ts`
- Test: `src/lib/encarteGrid.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produz: `distributeSlots(cols: number, rows: number, area: { xPct: number; yPct: number; widthPct: number; heightPct: number }): EncarteSlotDef[]` — usado pelo `MoldeEditor.tsx` (Task 7).

- [ ] **Step 1: Escrever o teste (falhando)**

Create `src/lib/encarteGrid.test.ts`:

```ts
import assert from 'node:assert';
import { distributeSlots } from './encarteGrid';

function distributesA3x5GridInsideTheArea() {
  const slots = distributeSlots(3, 5, { xPct: 5, yPct: 20, widthPct: 90, heightPct: 70 });
  assert.strictEqual(slots.length, 15, 'deveria gerar 15 slots pra grade 3x5');
  assert.ok(slots.every(s => s.tipo === 'produto'));

  const first = slots[0];
  assert.strictEqual(first.xPct, 5);
  assert.strictEqual(first.yPct, 20);
  assert.strictEqual(first.widthPct, 30, 'largura de cada celula = 90 / 3 colunas');
  assert.strictEqual(first.heightPct, 14, 'altura de cada celula = 70 / 5 linhas');

  const last = slots[14];
  assert.strictEqual(last.xPct, 5 + 2 * 30, 'ultima celula: coluna 2 (0-indexed) da ultima linha');
  assert.strictEqual(last.yPct, 20 + 4 * 14, 'ultima celula: linha 4 (0-indexed)');
}

function generatesUniqueIdsInRowMajorOrder() {
  const slots = distributeSlots(2, 2, { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 });
  const ids = slots.map(s => s.id);
  assert.strictEqual(new Set(ids).size, 4, 'ids devem ser unicos');
  assert.strictEqual(slots[0].xPct, 0);
  assert.strictEqual(slots[0].yPct, 0);
  assert.strictEqual(slots[1].xPct, 50, 'segundo slot fica na proxima coluna, mesma linha');
  assert.strictEqual(slots[1].yPct, 0);
  assert.strictEqual(slots[2].xPct, 0, 'terceiro slot volta pra primeira coluna, proxima linha');
  assert.strictEqual(slots[2].yPct, 50);
}

function singleCellMatchesTheWholeArea() {
  const area = { xPct: 10, yPct: 10, widthPct: 80, heightPct: 80 };
  const slots = distributeSlots(1, 1, area);
  assert.strictEqual(slots.length, 1);
  assert.deepStrictEqual(
    { xPct: slots[0].xPct, yPct: slots[0].yPct, widthPct: slots[0].widthPct, heightPct: slots[0].heightPct },
    area
  );
}

try {
  distributesA3x5GridInsideTheArea();
  generatesUniqueIdsInRowMajorOrder();
  singleCellMatchesTheWholeArea();
  console.log('PASS: todos os testes de encarteGrid passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/encarteGrid.test.ts`
Expected: FAIL — `Cannot find module './encarteGrid'` (arquivo ainda não existe).

- [ ] **Step 3: Implementar `distributeSlots`**

Create `src/lib/encarteGrid.ts`:

```ts
import type { EncarteSlotDef } from '../store';

export interface SlotArea {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export function distributeSlots(cols: number, rows: number, area: SlotArea): EncarteSlotDef[] {
  const widthPct = area.widthPct / cols;
  const heightPct = area.heightPct / rows;
  const slots: EncarteSlotDef[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        id: `produto-${row}-${col}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tipo: 'produto',
        xPct: area.xPct + col * widthPct,
        yPct: area.yPct + row * heightPct,
        widthPct,
        heightPct,
      });
    }
  }

  return slots;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/encarteGrid.test.ts`
Expected: `PASS: todos os testes de encarteGrid passaram`

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

Em `package.json`, no script `"test"`, adicione ` && tsx src/lib/encarteGrid.test.ts` ao final da cadeia existente:

```json
    "test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts && tsx src/lib/duplicateProductMatch.test.ts && tsx src/lib/productReportConflicts.test.ts && tsx src/lib/encarteGrid.test.ts",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/encarteGrid.ts src/lib/encarteGrid.test.ts package.json
git commit -m "feat: distributeSlots para grade automatica do molde de encarte"
```

---

### Task 3: `src/lib/encartePrice.ts` — formatação de preço

**Files:**
- Create: `src/lib/encartePrice.ts`
- Test: `src/lib/encartePrice.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produz: `formatPrice(price: string): { integer: string; cents: string }` — usado por `EncarteWeekly.tsx` (Task 9). Porta exata da função hoje em `src/components/EncarteCreator.tsx:256-263`.

- [ ] **Step 1: Escrever o teste (falhando)**

Create `src/lib/encartePrice.test.ts`:

```ts
import assert from 'node:assert';
import { formatPrice } from './encartePrice';

function splitsRealAndCentsFromBRLFormat() {
  assert.deepStrictEqual(formatPrice('R$ 6,19'), { integer: '6', cents: ',19' });
}

function acceptsPriceWithoutTheRSPrefix() {
  assert.deepStrictEqual(formatPrice('9,99'), { integer: '9', cents: ',99' });
}

function padsMissingCentsWithZero() {
  assert.deepStrictEqual(formatPrice('45'), { integer: '45', cents: ',00' });
}

function fallsBackToZeroZeroOnEmptyInput() {
  assert.deepStrictEqual(formatPrice(''), { integer: '0', cents: ',00' });
}

try {
  splitsRealAndCentsFromBRLFormat();
  acceptsPriceWithoutTheRSPrefix();
  padsMissingCentsWithZero();
  fallsBackToZeroZeroOnEmptyInput();
  console.log('PASS: todos os testes de encartePrice passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/encartePrice.test.ts`
Expected: FAIL — `Cannot find module './encartePrice'`.

- [ ] **Step 3: Implementar `formatPrice`**

Create `src/lib/encartePrice.ts`:

```ts
export function formatPrice(price: string): { integer: string; cents: string } {
  const cleanPrice = (price || '').replace('R$', '').replace(',', '.').trim();
  const parts = cleanPrice.split('.');
  return {
    integer: parts[0] || '0',
    cents: parts[1] ? `,${parts[1].padEnd(2, '0')}` : ',00',
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/encartePrice.test.ts`
Expected: `PASS: todos os testes de encartePrice passaram`

- [ ] **Step 5: Adicionar ao script `test`**

Em `package.json`, adicione ` && tsx src/lib/encartePrice.test.ts` ao final da cadeia (depois de `encarteGrid.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/encartePrice.ts src/lib/encartePrice.test.ts package.json
git commit -m "feat: formatPrice extraida como funcao pura reutilizavel"
```

---

### Task 4: `src/lib/cnpjLookup.ts` — busca automática por CNPJ

**Files:**
- Create: `src/lib/cnpjLookup.ts`
- Test: `src/lib/cnpjLookup.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produz: `interface CnpjData { nome: string; endereco: string; telefone: string }`, `parseCnpjResponse(raw: any): CnpjData`, `fetchCnpjData(cnpj: string): Promise<CnpjData | null>` — usado por `StoreProfileManager.tsx` (Task 6).

- [ ] **Step 1: Escrever o teste (falhando)**

Create `src/lib/cnpjLookup.test.ts`:

```ts
import assert from 'node:assert';
import { parseCnpjResponse } from './cnpjLookup';

// Campos e formato conferidos contra a BrasilAPI real
// (GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}) em 2026-07-28.
function extractsNameAddressAndPhoneFromABrasilApiResponse() {
  const raw = {
    nome_fantasia: 'Farmacia Exemplo',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '123',
    bairro: 'CENTRO',
    municipio: 'TERESINA',
    uf: 'PI',
    ddd_telefone_1: '8699990000',
  };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.nome, 'Farmacia Exemplo');
  assert.strictEqual(data.endereco, 'RUA DAS FLORES, 123 - CENTRO - TERESINA - PI');
  assert.strictEqual(data.telefone, '(86) 9999-0000');
}

function fallsBackToRazaoSocialWhenNomeFantasiaIsEmpty() {
  const raw = {
    nome_fantasia: '',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    logradouro: '', numero: '', bairro: '', municipio: '', uf: '',
    ddd_telefone_1: '',
  };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.nome, 'FARMACIA EXEMPLO LTDA');
}

function handlesMissingFieldsWithoutThrowing() {
  const data = parseCnpjResponse({});
  assert.strictEqual(data.nome, '');
  assert.strictEqual(data.endereco, '');
  assert.strictEqual(data.telefone, '');
}

function formatsANineDigitCellphoneNumber() {
  const raw = { nome_fantasia: 'X', logradouro: '', numero: '', bairro: '', municipio: '', uf: '', ddd_telefone_1: '86999990000' };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.telefone, '(86) 99999-0000');
}

try {
  extractsNameAddressAndPhoneFromABrasilApiResponse();
  fallsBackToRazaoSocialWhenNomeFantasiaIsEmpty();
  handlesMissingFieldsWithoutThrowing();
  formatsANineDigitCellphoneNumber();
  console.log('PASS: todos os testes de cnpjLookup passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/cnpjLookup.test.ts`
Expected: FAIL — `Cannot find module './cnpjLookup'`.

- [ ] **Step 3: Implementar `parseCnpjResponse` e `fetchCnpjData`**

Create `src/lib/cnpjLookup.ts`:

```ts
export interface CnpjData {
  nome: string;
  endereco: string;
  telefone: string;
}

function formatTelefone(raw: string | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return '';
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function parseCnpjResponse(raw: any): CnpjData {
  const nome = (raw?.nome_fantasia || '').trim() || (raw?.razao_social || '').trim();

  const ruaComNumero = [
    [raw?.descricao_tipo_de_logradouro, raw?.logradouro].filter(Boolean).join(' ').trim(),
    raw?.numero,
  ].filter(Boolean).join(', ');
  const endereco = [ruaComNumero, raw?.bairro, [raw?.municipio, raw?.uf].filter(Boolean).join(' - ')]
    .filter(Boolean)
    .join(' - ');

  const telefone = formatTelefone(raw?.ddd_telefone_1);

  return { nome, endereco, telefone };
}

export async function fetchCnpjData(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!res.ok) return null;

  const raw = await res.json();
  return parseCnpjResponse(raw);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/cnpjLookup.test.ts`
Expected: `PASS: todos os testes de cnpjLookup passaram`

- [ ] **Step 5: Adicionar ao script `test`**

Em `package.json`, adicione ` && tsx src/lib/cnpjLookup.test.ts` ao final da cadeia.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cnpjLookup.ts src/lib/cnpjLookup.test.ts package.json
git commit -m "feat: busca automatica de dados de loja por CNPJ via BrasilAPI"
```

---

### Task 5: `DraggableBox.tsx` — caixa arrastável/redimensionável

**Files:**
- Create: `src/components/encarte/DraggableBox.tsx`

**Interfaces:**
- Produz: `interface BoxRect { xPct: number; yPct: number; widthPct: number; heightPct: number }`, `export default function DraggableBox(props: { rect: BoxRect; containerRef: React.RefObject<HTMLElement>; onChange: (rect: BoxRect) => void; onRemove?: () => void; label?: string; color?: string })` — usado por `MoldeEditor.tsx` (Task 7).
- Consome: nada de outros tasks (componente autocontido).

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/DraggableBox.tsx`:

```tsx
import React, { useCallback, useRef } from 'react';
import { X } from 'lucide-react';

export interface BoxRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

interface DraggableBoxProps {
  rect: BoxRect;
  containerRef: React.RefObject<HTMLElement>;
  onChange: (rect: BoxRect) => void;
  onRemove?: () => void;
  label?: string;
  color?: string;
}

const MIN_PCT = 3;

export default function DraggableBox({ rect, containerRef, onChange, onRemove, label, color = '#10b981' }: DraggableBoxProps) {
  const dragState = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; startRect: BoxRect } | null>(null);

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const state = dragState.current;
    const container = containerRef.current;
    if (!state || !container) return;
    const bounds = container.getBoundingClientRect();
    const dxPct = ((e.clientX - state.startX) / bounds.width) * 100;
    const dyPct = ((e.clientY - state.startY) / bounds.height) * 100;

    if (state.mode === 'move') {
      const xPct = clamp(state.startRect.xPct + dxPct, 0, 100 - state.startRect.widthPct);
      const yPct = clamp(state.startRect.yPct + dyPct, 0, 100 - state.startRect.heightPct);
      onChange({ ...state.startRect, xPct, yPct });
    } else {
      const widthPct = clamp(state.startRect.widthPct + dxPct, MIN_PCT, 100 - state.startRect.xPct);
      const heightPct = clamp(state.startRect.heightPct + dyPct, MIN_PCT, 100 - state.startRect.yPct);
      onChange({ ...state.startRect, widthPct, heightPct });
    }
  }, [containerRef, onChange]);

  const handlePointerUp = useCallback(() => {
    dragState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      onPointerDown={startDrag('move')}
      className="absolute border-2 border-dashed cursor-move flex items-center justify-center select-none"
      style={{
        left: `${rect.xPct}%`,
        top: `${rect.yPct}%`,
        width: `${rect.widthPct}%`,
        height: `${rect.heightPct}%`,
        borderColor: color,
        backgroundColor: `${color}22`,
      }}
    >
      {label && (
        <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">
          {label}
        </span>
      )}
      {onRemove && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      <div
        onPointerDown={startDrag('resize')}
        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-full cursor-se-resize"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `DraggableBox.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/DraggableBox.tsx
git commit -m "feat: DraggableBox, caixa arrastavel/redimensionavel para o editor de molde"
```

---

### Task 6: `StoreProfileManager.tsx` — CRUD de Perfil de Loja

**Files:**
- Create: `src/components/encarte/StoreProfileManager.tsx`

**Interfaces:**
- Produz: `export default function StoreProfileManager(): JSX.Element` — montado por `EncarteBuilder.tsx` (Task 10).
- Consome: `useStore().storeProfiles/fetchStoreProfiles/saveStoreProfiles` (Task 1), `uploadBackgroundImage` de `src/lib/gallery.ts:13-26` (já existe), `fetchCnpjData` de `src/lib/cnpjLookup.ts` (Task 4), `getProxyUrl` de `src/lib/utils.ts:73`.

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/StoreProfileManager.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useStore, StoreProfile } from '../../store';
import { uploadBackgroundImage } from '../../lib/gallery';
import { fetchCnpjData } from '../../lib/cnpjLookup';
import { getProxyUrl } from '../../lib/utils';
import { Plus, Trash2, Loader2, Search, Store } from 'lucide-react';
import { toast } from 'sonner';

const emptyProfile = (): StoreProfile => ({
  id: Math.random().toString(36).slice(2, 10),
  cnpj: '',
  nome: '',
  logoUrl: '',
  endereco: '',
  telefone: '',
  instagram: '',
});

export default function StoreProfileManager() {
  const { storeProfiles, fetchStoreProfiles, saveStoreProfiles } = useStore();
  const [editing, setEditing] = useState<StoreProfile | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => { fetchStoreProfiles(); }, []);

  const handleCnpjLookup = async () => {
    if (!editing?.cnpj) return;
    setIsLookingUp(true);
    try {
      const data = await fetchCnpjData(editing.cnpj);
      if (!data) {
        toast.error('CNPJ não encontrado.');
        return;
      }
      setEditing((prev) => prev ? {
        ...prev,
        nome: prev.nome || data.nome,
        endereco: prev.endereco || data.endereco,
      } : prev);
      toast.success('Dados encontrados!');
    } catch {
      toast.error('Não foi possível consultar o CNPJ agora.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    setIsUploadingLogo(true);
    try {
      const { url } = await uploadBackgroundImage(file, 'encarte-logos');
      setEditing((prev) => prev ? { ...prev, logoUrl: url } : prev);
    } catch {
      toast.error('Falha ao enviar a logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!editing || !editing.nome.trim()) {
      toast.error('Informe o nome da loja.');
      return;
    }
    const exists = storeProfiles.some((p) => p.id === editing.id);
    const updated = exists
      ? storeProfiles.map((p) => (p.id === editing.id ? editing : p))
      : [...storeProfiles, editing];
    await saveStoreProfiles(updated);
    setEditing(null);
    toast.success('Loja salva!');
  };

  const handleDelete = async (id: string) => {
    await saveStoreProfiles(storeProfiles.filter((p) => p.id !== id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest">Lojas cadastradas</h2>
        <button
          onClick={() => setEditing(emptyProfile())}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
        >
          <Plus className="w-4 h-4" /> Nova loja
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {storeProfiles.map((profile) => (
          <div key={profile.id} className="p-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile.logoUrl ? (
                <img src={getProxyUrl(profile.logoUrl, { thumbnail: true })} className="w-full h-full object-contain p-1" />
              ) : (
                <Store className="w-5 h-5 text-zinc-400" />
              )}
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs font-black uppercase truncate">{profile.nome}</p>
              <p className="text-[10px] text-zinc-500 truncate">{profile.endereco}</p>
            </div>
            <button onClick={() => setEditing(profile)} className="text-[10px] font-black uppercase text-emerald-600">Editar</button>
            <button onClick={() => handleDelete(profile.id)} className="text-zinc-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {storeProfiles.length === 0 && (
          <p className="col-span-2 text-center text-xs text-zinc-400 py-8">Nenhuma loja cadastrada ainda.</p>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest">Perfil de loja</h3>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="CNPJ (opcional)"
                value={editing.cnpj}
                onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })}
                className="flex-grow px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
              />
              <button
                onClick={handleCnpjLookup}
                disabled={isLookingUp || !editing.cnpj}
                className="px-3 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl disabled:opacity-40"
              >
                {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            <input
              type="text"
              placeholder="Nome da loja"
              value={editing.nome}
              onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                {editing.logoUrl ? (
                  <img src={getProxyUrl(editing.logoUrl, { thumbnail: true })} className="w-full h-full object-contain p-1" />
                ) : (
                  <Store className="w-5 h-5 text-zinc-400" />
                )}
              </div>
              <label className="flex-grow cursor-pointer">
                <span className="text-[10px] font-black uppercase text-emerald-600">
                  {isUploadingLogo ? 'Enviando...' : 'Enviar logo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
              </label>
            </div>

            <input
              type="text"
              placeholder="Endereço"
              value={editing.endereco}
              onChange={(e) => setEditing({ ...editing, endereco: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />
            <input
              type="text"
              placeholder="Telefone / WhatsApp"
              value={editing.telefone}
              onChange={(e) => setEditing({ ...editing, telefone: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />
            <input
              type="text"
              placeholder="Instagram"
              value={editing.instagram}
              onChange={(e) => setEditing({ ...editing, instagram: e.target.value })}
              className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `StoreProfileManager.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/StoreProfileManager.tsx
git commit -m "feat: cadastro de Perfil de Loja com busca automatica por CNPJ"
```

---

### Task 7: `MoldeEditor.tsx` — criar/editar Molde

**Files:**
- Create: `src/components/encarte/MoldeEditor.tsx`

**Interfaces:**
- Produz: `export default function MoldeEditor(props: { molde: EncarteMolde | null; onClose: () => void }): JSX.Element` — montado por `MoldeList.tsx` (Task 8).
- Consome: `useStore().encarteMoldes/saveEncarteMoldes` (Task 1), `distributeSlots` (Task 2), `uploadBackgroundImage` (`src/lib/gallery.ts`), `DraggableBox`/`BoxRect` (Task 5), `getProxyUrl` (`src/lib/utils.ts`).

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/MoldeEditor.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useStore, EncarteMolde, EncarteSlotDef } from '../../store';
import { uploadBackgroundImage } from '../../lib/gallery';
import { distributeSlots } from '../../lib/encarteGrid';
import { getProxyUrl } from '../../lib/utils';
import DraggableBox, { BoxRect } from './DraggableBox';
import { Plus, Upload, Grid3x3, PenLine, Save } from 'lucide-react';
import { toast } from 'sonner';

const emptyMolde = (): EncarteMolde => ({
  id: Math.random().toString(36).slice(2, 10),
  nome: '',
  frontBgUrl: '',
  frontSlots: [],
});

const DEFAULT_AREA: BoxRect = { xPct: 5, yPct: 18, widthPct: 90, heightPct: 68 };

const SLOT_COLORS: Record<EncarteSlotDef['tipo'], string> = {
  produto: '#10b981',
  data: '#f59e0b',
  logo: '#3b82f6',
  contato: '#a855f7',
};

export default function MoldeEditor({ molde, onClose }: { molde: EncarteMolde | null; onClose: () => void }) {
  const { encarteMoldes, saveEncarteMoldes } = useStore();
  const [draft, setDraft] = useState<EncarteMolde>(molde ? { ...molde } : emptyMolde());
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(5);
  const [area, setArea] = useState<BoxRect>(DEFAULT_AREA);
  const [manualMode, setManualMode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const bgUrl = side === 'frente' ? draft.frontBgUrl : draft.backBgUrl;
  const slots = side === 'frente' ? draft.frontSlots : (draft.backSlots || []);
  const productSlots = slots.filter((s) => s.tipo === 'produto');
  const specialSlots = slots.filter((s) => s.tipo !== 'produto');

  const setBgUrl = (url: string) => {
    setDraft((d) => (side === 'frente' ? { ...d, frontBgUrl: url } : { ...d, backBgUrl: url }));
  };

  const setSlots = (updater: (current: EncarteSlotDef[]) => EncarteSlotDef[]) => {
    setDraft((d) => {
      if (side === 'frente') return { ...d, frontSlots: updater(d.frontSlots) };
      return { ...d, backSlots: updater(d.backSlots || []) };
    });
  };

  // Grade automática: recalcula os slots de produto sempre que cols/rows/area
  // mudam, a menos que o usuário tenha ativado o modo manual pra esse lado.
  useEffect(() => {
    if (manualMode) return;
    setSlots((current) => {
      const special = current.filter((s) => s.tipo !== 'produto');
      return [...distributeSlots(cols, rows, area), ...special];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, rows, area, manualMode, side]);

  const handleBgUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await uploadBackgroundImage(file, 'encarte-moldes');
      setBgUrl(url);
    } catch {
      toast.error('Falha ao enviar a arte de fundo.');
    } finally {
      setIsUploading(false);
    }
  };

  const updateSlot = (id: string, rect: BoxRect) => {
    setSlots((current) => current.map((s) => (s.id === id ? { ...s, ...rect } : s)));
  };

  const addSpecialSlot = (tipo: 'data' | 'logo' | 'contato') => {
    const newSlot: EncarteSlotDef = {
      id: `${tipo}-${Date.now()}`,
      tipo,
      xPct: 10, yPct: 5, widthPct: 25, heightPct: 8,
    };
    setSlots((current) => [...current, newSlot]);
  };

  const removeSlot = (id: string) => {
    setSlots((current) => current.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    if (!draft.nome.trim()) {
      toast.error('Dê um nome ao molde.');
      return;
    }
    if (!draft.frontBgUrl) {
      toast.error('Envie a arte de fundo da frente antes de salvar.');
      return;
    }
    const exists = encarteMoldes.some((m) => m.id === draft.id);
    const updated = exists
      ? encarteMoldes.map((m) => (m.id === draft.id ? draft : m))
      : [...encarteMoldes, draft];
    await saveEncarteMoldes(updated);
    toast.success('Molde salvo!');
    onClose();
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="Nome do molde (ex: Fecha Mês)"
          value={draft.nome}
          onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
          className="text-lg font-black uppercase tracking-tight bg-transparent outline-none border-b-2 border-transparent focus:border-emerald-500"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase">
            <Save className="w-4 h-4" /> Salvar molde
          </button>
        </div>
      </div>

      <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
        <button
          onClick={() => setSide('frente')}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${side === 'frente' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
        >
          Frente
        </button>
        <button
          onClick={() => setSide('verso')}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${side === 'verso' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
        >
          Verso {draft.backBgUrl ? '' : '(opcional)'}
        </button>
      </div>

      {!bgUrl ? (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl py-16 cursor-pointer hover:border-emerald-500/50 transition-colors">
          <Upload className="w-8 h-8 text-zinc-400" />
          <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
            {isUploading ? 'Enviando...' : `Enviar arte de fundo (${side})`}
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleBgUpload(e.target.files[0])} />
        </label>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl">
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-zinc-400" />
              <label className="text-[10px] font-black uppercase text-zinc-500">Colunas</label>
              <input type="number" min={1} max={6} value={cols} onChange={(e) => setCols(Number(e.target.value) || 1)}
                className="w-14 px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm text-center outline-none" disabled={manualMode} />
              <label className="text-[10px] font-black uppercase text-zinc-500">Linhas</label>
              <input type="number" min={1} max={10} value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)}
                className="w-14 px-2 py-1 bg-white dark:bg-zinc-800 rounded-lg text-sm text-center outline-none" disabled={manualMode} />
            </div>

            <button
              onClick={() => setManualMode((m) => !m)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                manualMode ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-500 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" /> Desenhar manualmente
            </button>

            <div className="flex gap-2 ml-auto">
              <button onClick={() => addSpecialSlot('data')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.data }}>
                + Data
              </button>
              <button onClick={() => addSpecialSlot('logo')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.logo }}>
                + Logo
              </button>
              <button onClick={() => addSpecialSlot('contato')} className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-white" style={{ backgroundColor: SLOT_COLORS.contato }}>
                + Contato
              </button>
            </div>
          </div>

          <div ref={containerRef} className="relative w-full mx-auto bg-white shadow-lg" style={{ maxWidth: 600 }}>
            <img src={getProxyUrl(bgUrl)} className="w-full h-auto block select-none pointer-events-none" draggable={false} />

            {!manualMode && (
              <DraggableBox rect={area} containerRef={containerRef} onChange={setArea} label="Área dos produtos" color={SLOT_COLORS.produto} />
            )}

            {manualMode && productSlots.map((slot, idx) => (
              <DraggableBox
                key={slot.id}
                rect={slot}
                containerRef={containerRef}
                onChange={(rect) => updateSlot(slot.id, rect)}
                label={`${idx + 1}`}
                color={SLOT_COLORS.produto}
              />
            ))}

            {specialSlots.map((slot) => (
              <DraggableBox
                key={slot.id}
                rect={slot}
                containerRef={containerRef}
                onChange={(rect) => updateSlot(slot.id, rect)}
                onRemove={() => removeSlot(slot.id)}
                label={slot.tipo}
                color={SLOT_COLORS[slot.tipo]}
              />
            ))}
          </div>

          <p className="text-[10px] text-zinc-400 text-center">
            {productSlots.length} posições de produto {manualMode ? '(ajuste arrastando cada uma)' : `(grade automática ${cols}×${rows})`}
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `MoldeEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/MoldeEditor.tsx
git commit -m "feat: editor de Molde com grade automatica e modo manual de desenho"
```

---

### Task 8: `MoldeList.tsx` — listar/criar/editar/excluir Moldes

**Files:**
- Create: `src/components/encarte/MoldeList.tsx`

**Interfaces:**
- Produz: `export default function MoldeList(): JSX.Element` — montado por `EncarteBuilder.tsx` (Task 10).
- Consome: `useStore().encarteMoldes/fetchEncarteMoldes/saveEncarteMoldes` (Task 1), `MoldeEditor` (Task 7), `getProxyUrl` (`src/lib/utils.ts`).

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/MoldeList.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useStore, EncarteMolde } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { Plus, Trash2, LayoutTemplate } from 'lucide-react';
import MoldeEditor from './MoldeEditor';

export default function MoldeList() {
  const { encarteMoldes, fetchEncarteMoldes, saveEncarteMoldes } = useStore();
  const [editingMolde, setEditingMolde] = useState<EncarteMolde | 'new' | null>(null);

  useEffect(() => { fetchEncarteMoldes(); }, []);

  const handleDelete = async (id: string) => {
    await saveEncarteMoldes(encarteMoldes.filter((m) => m.id !== id));
  };

  if (editingMolde) {
    return <MoldeEditor molde={editingMolde === 'new' ? null : editingMolde} onClose={() => setEditingMolde(null)} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest">Moldes salvos</h2>
        <button onClick={() => setEditingMolde('new')} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
          <Plus className="w-4 h-4" /> Novo molde
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {encarteMoldes.map((molde) => (
          <div key={molde.id} className="group relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-[3/4] bg-zinc-100 dark:bg-zinc-800">
            {molde.frontBgUrl ? (
              <img src={getProxyUrl(molde.frontBgUrl, { thumbnail: true })} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <LayoutTemplate className="w-8 h-8 text-zinc-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <p className="text-xs font-black uppercase text-white text-center px-2">{molde.nome}</p>
              <div className="flex gap-2">
                <button onClick={() => setEditingMolde(molde)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase">Editar</button>
                <button onClick={() => handleDelete(molde.id)} className="p-1.5 bg-red-600 text-white rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {encarteMoldes.length === 0 && (
          <p className="col-span-3 text-center text-xs text-zinc-400 py-8">Nenhum molde salvo ainda.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `MoldeList.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/MoldeList.tsx
git commit -m "feat: lista de Moldes salvos com criar/editar/excluir"
```

---

### Task 9: `EncarteWeekly.tsx` — montar o encarte da semana

**Files:**
- Create: `src/components/encarte/EncarteWeekly.tsx`

**Interfaces:**
- Produz: `export default function EncarteWeekly(): JSX.Element` — montado por `EncarteBuilder.tsx` (Task 10).
- Consome: `useStore().encarteMoldes/storeProfiles/encartesSemanais/fetchEncarteMoldes/fetchStoreProfiles/fetchEncartesSemanais/saveEncartesSemanais` (Task 1), `formatPrice` (Task 3), `ProductSelector` (`src/components/ProductSelector.tsx`, prop `onSelect`), `getProxyUrl` (`src/lib/utils.ts`), `html2canvas`, `jsPDF` (já dependências).

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/EncarteWeekly.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useStore, SelectedProduct, EncarteSemanal } from '../../store';
import { getProxyUrl } from '../../lib/utils';
import { formatPrice } from '../../lib/encartePrice';
import ProductSelector from '../ProductSelector';
import { Plus, FileDown, Image as ImageIcon2, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const emptySemanal = (moldeId: string, storeProfileId: string): EncarteSemanal => ({
  id: Math.random().toString(36).slice(2, 10),
  moldeId,
  storeProfileId,
  validade: '',
  produtos: {},
});

export default function EncarteWeekly() {
  const {
    encarteMoldes, fetchEncarteMoldes,
    storeProfiles, fetchStoreProfiles,
    encartesSemanais, fetchEncartesSemanais, saveEncartesSemanais,
  } = useStore();

  const [moldeId, setMoldeId] = useState('');
  const [storeProfileId, setStoreProfileId] = useState('');
  const [semanal, setSemanal] = useState<EncarteSemanal | null>(null);
  const [side, setSide] = useState<'frente' | 'verso'>('frente');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEncarteMoldes();
    fetchStoreProfiles();
    fetchEncartesSemanais();
  }, []);

  const molde = encarteMoldes.find((m) => m.id === moldeId) || null;
  const storeProfile = storeProfiles.find((p) => p.id === storeProfileId) || null;

  useEffect(() => {
    if (!moldeId || !storeProfileId) { setSemanal(null); return; }
    const existing = encartesSemanais.find((s) => s.moldeId === moldeId && s.storeProfileId === storeProfileId);
    setSemanal(existing || emptySemanal(moldeId, storeProfileId));
  }, [moldeId, storeProfileId]);

  const persistSemanal = async (updated: EncarteSemanal) => {
    setSemanal(updated);
    const others = encartesSemanais.filter((s) => s.id !== updated.id);
    await saveEncartesSemanais([...others, updated]);
  };

  const handleSelectProduct = (product: any) => {
    if (!semanal || !activeSlotId) return;
    const produtos = {
      ...semanal.produtos,
      [activeSlotId]: {
        ...product,
        id: Math.random().toString(36).slice(2, 10),
        subtitle: product.description || '',
        displayType: 'price' as const,
      },
    };
    persistSemanal({ ...semanal, produtos });
    setActiveSlotId(null);
  };

  const updateSlotProduct = (slotId: string, updates: Partial<SelectedProduct>) => {
    if (!semanal) return;
    const current = semanal.produtos[slotId];
    if (!current) return;
    persistSemanal({ ...semanal, produtos: { ...semanal.produtos, [slotId]: { ...current, ...updates } } });
  };

  const removeSlotProduct = (slotId: string) => {
    if (!semanal) return;
    persistSemanal({ ...semanal, produtos: { ...semanal.produtos, [slotId]: null } });
  };

  const waitFrame = () => new Promise((resolve) => setTimeout(resolve, 200));

  const handleExportPNG = async () => {
    if (!previewRef.current) return;
    setIsExporting(true);
    const toastId = toast.loading('Gerando imagem...');
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const link = document.createElement('a');
      link.download = `encarte-${(molde?.nome || 'modelo').replace(/\s+/g, '-')}-${side}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Imagem exportada!', { id: toastId });
    } catch {
      toast.error('Erro ao exportar. Verifique se a arte de fundo está acessível.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (!previewRef.current || !molde) return;
    setIsExporting(true);
    const toastId = toast.loading('Gerando PDF...');
    const originalSide = side;
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');

      const captureSide = async (targetSide: 'frente' | 'verso') => {
        setSide(targetSide);
        await waitFrame();
        const canvas = await html2canvas(previewRef.current!, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        return canvas.toDataURL('image/jpeg', 0.95);
      };

      const frenteImg = await captureSide('frente');
      pdf.addImage(frenteImg, 'JPEG', 0, 0, 210, 297);

      if (molde.backBgUrl) {
        pdf.addPage();
        const versoImg = await captureSide('verso');
        pdf.addImage(versoImg, 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`encarte-${molde.nome.replace(/\s+/g, '-')}-${Date.now()}.pdf`);
      toast.success('PDF gerado!', { id: toastId });
    } catch {
      toast.error('Erro ao gerar PDF.', { id: toastId });
    } finally {
      setSide(originalSide);
      setIsExporting(false);
    }
  };

  if (!molde || !storeProfile) {
    return (
      <div className="p-6 space-y-6 max-w-lg mx-auto">
        <h2 className="text-sm font-black uppercase tracking-widest">Montar encarte da semana</h2>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500">Molde</label>
          <select value={moldeId} onChange={(e) => setMoldeId(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none">
            <option value="">Selecione...</option>
            {encarteMoldes.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500">Loja</label>
          <select value={storeProfileId} onChange={(e) => setStoreProfileId(e.target.value)} className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none">
            <option value="">Selecione...</option>
            {storeProfiles.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>
    );
  }

  const activeSlots = side === 'frente' ? molde.frontSlots : (molde.backSlots || []);
  const activeBgUrl = side === 'frente' ? molde.frontBgUrl : molde.backBgUrl;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">{molde.nome} — {storeProfile.nome}</h2>
          <button onClick={() => { setMoldeId(''); setStoreProfileId(''); }} className="text-[10px] text-emerald-600 font-black uppercase">Trocar molde/loja</button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Validade (ex: 30 e 31 de Julho)"
            value={semanal?.validade || ''}
            onChange={(e) => semanal && persistSemanal({ ...semanal, validade: e.target.value })}
            className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm outline-none w-56"
          />
          <button onClick={handleExportPNG} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50">
            <ImageIcon2 className="w-4 h-4" /> PNG
          </button>
          <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase disabled:opacity-50">
            <FileDown className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {molde.backBgUrl && (
        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
          <button onClick={() => setSide('frente')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'frente' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Frente</button>
          <button onClick={() => setSide('verso')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${side === 'verso' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}>Verso</button>
        </div>
      )}

      <div ref={previewRef} className="relative w-full mx-auto bg-white shadow-lg" style={{ maxWidth: 600 }}>
        {activeBgUrl && <img src={getProxyUrl(activeBgUrl)} className="w-full h-auto block select-none pointer-events-none" draggable={false} crossOrigin="anonymous" />}

        {activeSlots.filter((s) => s.tipo === 'logo').map((slot) => (
          <div key={slot.id} className="absolute flex items-center justify-center" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            {storeProfile.logoUrl && <img src={getProxyUrl(storeProfile.logoUrl)} className="max-w-full max-h-full object-contain" crossOrigin="anonymous" />}
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'contato').map((slot) => (
          <div key={slot.id} className="absolute flex flex-col items-center justify-center text-center text-[8px] font-bold leading-tight" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            <span>{storeProfile.telefone}</span>
            <span>{storeProfile.instagram}</span>
            <span>{storeProfile.endereco}</span>
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'data').map((slot) => (
          <div key={slot.id} className="absolute flex items-center justify-center text-[9px] font-black uppercase" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
            {semanal?.validade}
          </div>
        ))}

        {activeSlots.filter((s) => s.tipo === 'produto').map((slot) => {
          const product = semanal?.produtos[slot.id];
          return (
            <div key={slot.id} className="absolute p-0.5" style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
              {product ? (
                <div className="group relative w-full h-full flex flex-col items-center justify-center gap-0.5 text-center">
                  <button onClick={() => removeSlotProduct(slot.id)} className="no-print absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                  {product.image && <img src={getProxyUrl(product.image)} className="max-h-[45%] object-contain" crossOrigin="anonymous" />}
                  <p className="text-[7px] font-black uppercase leading-tight">{product.name}</p>
                  {product.displayType === 'discount' ? (
                    <p className="text-lg font-black text-red-600">{product.discountValue}%</p>
                  ) : (
                    <p className="text-lg font-black text-red-600">
                      {formatPrice(product.price).integer}
                      <span className="text-xs">{formatPrice(product.price).cents}</span>
                    </p>
                  )}
                  <input
                    type="text"
                    value={product.displayType === 'discount' ? (product.discountValue || '') : product.price}
                    onChange={(e) => updateSlotProduct(slot.id, product.displayType === 'discount' ? { discountValue: e.target.value } : { price: e.target.value })}
                    className="no-print w-16 text-[9px] text-center bg-white/80 border border-zinc-300 rounded px-1"
                  />
                </div>
              ) : (
                <button onClick={() => setActiveSlotId(slot.id)} className="no-print w-full h-full border-2 border-dashed border-zinc-300 rounded-lg flex items-center justify-center text-zinc-400 hover:border-emerald-500 hover:text-emerald-500 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeSlotId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setActiveSlotId(null)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black uppercase tracking-widest mb-4">Escolher produto</h3>
            <ProductSelector onSelect={handleSelectProduct} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `EncarteWeekly.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/EncarteWeekly.tsx
git commit -m "feat: montagem do encarte semanal com produtos automaticos e export PNG/PDF"
```

---

### Task 10: `EncarteBuilder.tsx` — tela raiz (substitui o Encarte antigo)

**Files:**
- Create: `src/components/encarte/EncarteBuilder.tsx`

**Interfaces:**
- Produz: `export default function EncarteBuilder(): JSX.Element` — usado por `App.tsx` (Task 11) no lugar de `<EncarteCreator />`.
- Consome: `StoreProfileManager` (Task 6), `MoldeList` (Task 8), `EncarteWeekly` (Task 9), `useStore().setView` (já existe).

- [ ] **Step 1: Implementar o componente**

Create `src/components/encarte/EncarteBuilder.tsx`:

```tsx
import React, { useState } from 'react';
import { useStore } from '../../store';
import { ArrowLeft, Store, LayoutTemplate, ShoppingBag } from 'lucide-react';
import StoreProfileManager from './StoreProfileManager';
import MoldeList from './MoldeList';
import EncarteWeekly from './EncarteWeekly';

type Tab = 'lojas' | 'moldes' | 'semanal';

export default function EncarteBuilder() {
  const { setView } = useStore();
  const [tab, setTab] = useState<Tab>('semanal');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('editor')} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black tracking-tighter uppercase">Encarte Online</h1>
        </div>

        <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
          <button
            onClick={() => setTab('semanal')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'semanal' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" /> Montar encarte
          </button>
          <button
            onClick={() => setTab('moldes')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'moldes' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <LayoutTemplate className="w-3.5 h-3.5" /> Moldes
          </button>
          <button
            onClick={() => setTab('lojas')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === 'lojas' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500'}`}
          >
            <Store className="w-3.5 h-3.5" /> Lojas
          </button>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto">
        {tab === 'semanal' && <EncarteWeekly />}
        {tab === 'moldes' && <MoldeList />}
        {tab === 'lojas' && <StoreProfileManager />}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros em `EncarteBuilder.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/encarte/EncarteBuilder.tsx
git commit -m "feat: tela raiz do Encarte Online v2 com navegacao entre Lojas/Moldes/Semanal"
```

---

### Task 11: Ligar no `App.tsx` e remover o Encarte antigo

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/store.ts`
- Delete: `src/components/EncarteCreator.tsx`

**Interfaces:**
- Consome: `EncarteBuilder` (Task 10).

- [ ] **Step 1: Trocar o import e o componente renderizado em `App.tsx`**

Em `src/App.tsx`, troque:

```tsx
import EncarteCreator from './components/EncarteCreator';
```

por:

```tsx
import EncarteBuilder from './components/encarte/EncarteBuilder';
```

E troque:

```tsx
    if (currentView === 'encarte') {
      return <EncarteCreator />;
    }
```

por:

```tsx
    if (currentView === 'encarte') {
      return <EncarteBuilder />;
    }
```

O botão "Encarte" no menu (`src/App.tsx`, procure por `onClick={() => setView('encarte')}`) **não muda** — já aponta pra `currentView === 'encarte'`, que agora renderiza `EncarteBuilder`.

- [ ] **Step 2: Deletar o componente antigo**

```bash
rm src/components/EncarteCreator.tsx
```

- [ ] **Step 3: Remover os tipos e o estado do Encarte antigo em `src/store.ts`**

Remova as 4 interfaces antigas — procure e apague os blocos completos:

```ts
export interface EncarteSlot {
  name: string;
  date?: string;
  dateOffsetX?: number;
  dateOffsetY?: number;
  frontBgUrl: string;
  backBgUrl: string;
  frontProducts: (SelectedProduct | null)[];
  backProducts: (SelectedProduct | null)[];
  productCount: number;
  format?: 'post' | 'story' | 'encarte';
  bubbleShape?: 'rounded' | 'square' | 'circle' | 'pill' | 'burst' | 'badge' | 'diamond' | 'hexagon' | 'star' | 'oval';
  extraProducts?: (SelectedProduct | null)[];
}

export interface EncarteModel {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  bgClass: string;
  borderClass: string;
  fontFamily?: string;
  imageUrl?: string;
}

export interface Theme {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
}

export interface ThemeCategory {
  id: string;
  name: string;
  themes: Theme[];
}

export type EncarteTab = 'themes' | 'layouts' | 'products' | 'info' | 'labels' | 'colors' | 'fonts' | 'logo';
```

Remova os campos correspondentes em `interface AppState` (procure cada linha e apague):

```ts
  encartes: EncarteSlot[];
  setEncartes: (encartes: EncarteSlot[]) => void;
  selectedEncarteModel: EncarteModel | null;
  setSelectedEncarteModel: (model: EncarteModel) => void;
  activeEncarteTab: EncarteTab;
  setActiveEncarteTab: (tab: EncarteTab) => void;
  encarteThemes: ThemeCategory[];
  setEncarteThemes: (themes: ThemeCategory[]) => void;
  encarteLogos: string[];
  setEncarteLogos: (logos: string[]) => void;
  encarteLayouts: string[];
  setEncarteLayouts: (layouts: string[]) => void;
  activeEncarteTheme: Theme | null;
  setActiveEncarteTheme: (theme: Theme | null) => void;
  activeEncarteLogo: string | null;
  setActiveEncarteLogo: (logo: string | null) => void;
  activeEncarteLayout: string | null;
  setActiveEncarteLayout: (layout: string | null) => void;
```

Remova a implementação correspondente no corpo da store (procure e apague, incluindo a linha `encartes: Array(10).fill(null).map(...)` até o fim do bloco `setActiveEncarteLayout`):

```ts
      encartes: Array(10).fill(null).map((_, i) => ({ name: `Modelo ${i + 1}`, frontBgUrl: '', backBgUrl: '', frontProducts: Array(12).fill(null), backProducts: Array(12).fill(null), productCount: 12, extraProducts: [null, null] })),
      setEncartes: (encartes) => { set({ encartes }); get().saveUsersAndFlagsDebounced(); },
      selectedEncarteModel: null,
      setSelectedEncarteModel: (model) => { set({ selectedEncarteModel: model }); get().saveUsersAndFlagsDebounced(); },
      activeEncarteTab: 'themes',
      setActiveEncarteTab: (tab) => set({ activeEncarteTab: tab }),
      encarteThemes: [],
      setEncarteThemes: (themes) => { set({ encarteThemes: themes }); get().saveUsersAndFlagsDebounced(); },
      encarteLogos: [],
      setEncarteLogos: (logos) => { set({ encarteLogos: logos }); get().saveUsersAndFlagsDebounced(); },
      encarteLayouts: [],
      setEncarteLayouts: (layouts) => { set({ encarteLayouts: layouts }); get().saveUsersAndFlagsDebounced(); },
      activeEncarteTheme: null,
      setActiveEncarteTheme: (theme) => set({ activeEncarteTheme: theme }),
      activeEncarteLogo: null,
      setActiveEncarteLogo: (logo) => set({ activeEncarteLogo: logo }),
      activeEncarteLayout: null,
      setActiveEncarteLayout: (layout) => set({ activeEncarteLayout: layout }),
```

Remova as 5 linhas correspondentes dentro de `saveUsersAndFlags` (função por volta da antiga linha 1401, procure o objeto passado pra `apiPost('/settings/users_and_flags', ...)`):

```ts
              encartes: state.encartes,
              selectedEncarteModel: state.selectedEncarteModel,
              encarteThemes: state.encarteThemes,
              encarteLogos: state.encarteLogos,
              encarteLayouts: state.encarteLayouts,
```

E as linhas equivalentes dentro de `loadUsersAndFlags` (mesma função, mais abaixo, onde o `value` recebido do servidor é espalhado de volta no estado — procure por `settings.encartes ||`):

```ts
            encartes: settings.encartes || currentState.encartes,
            selectedEncarteModel: settings.selectedEncarteModel || currentState.selectedEncarteModel,
            encarteThemes: settings.encarteThemes || [],
            encarteLogos: settings.encarteLogos || [],
            encarteLayouts: settings.encarteLayouts || [],
```

Também remova a linha `activeEncarteTab: state.activeEncarteTab,` (dentro de `saveUsersAndFlags`) e `activeEncarteTab: settings.activeEncarteTab || currentState.activeEncarteTab,` (dentro de `loadUsersAndFlags`) — são as únicas duas ocorrências restantes fora dos blocos já removidos.

- [ ] **Step 2: Confirmar que não sobrou nenhuma referência**

Run: `grep -rn "EncarteCreator\|EncarteSlot\b\|EncarteModel\b\|ThemeCategory\|EncarteTab\b" src/`
Expected: nenhum resultado (todas as referências foram removidas junto com o arquivo antigo).

- [ ] **Step 3: Checar tipos do projeto inteiro**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Rodar a suite de testes de lógica pura**

Run: `npm run test`
Expected: todas as linhas `PASS: ...` (incluindo as 3 novas de `encarteGrid`, `encartePrice`, `cnpjLookup`), sem `FAIL`.

- [ ] **Step 5: Teste manual local (antes de qualquer deploy)**

Run: `npm run dev`, abrir o app localmente, logar como admin e seguir os 7 cenários já descritos na seção "Teste" da spec (`docs/superpowers/specs/2026-07-28-encarte-moldes-design.md`):
1. Cadastrar 2 Perfis de Loja com CNPJ, logo, endereço, telefone, Instagram.
2. Criar o Molde "Fecha Mês" (3×5) e conferir que os 15 slots ficam dentro da área marcada.
3. Criar um segundo Molde "Dia do Bebê" (3×4).
4. Montar um encarte semanal com "Fecha Mês" + "Ultra Popular", preencher os 15 produtos, digitar validade, exportar PNG.
5. Trocar a loja do mesmo molde pra "Bigfort" e confirmar que logo/endereço/telefone trocam sozinhos.
6. Testar o modo "Desenhar manualmente" num slot e confirmar que a posição persiste ao reabrir o molde.
7. Exportar um encarte com frente e verso e confirmar o PDF de 2 páginas.

Só depois de todos os 7 cenários passarem manualmente é que o usuário decide se quer subir pra VPS (não fazer deploy automaticamente).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: liga o Encarte Online v2 no lugar do EncarteCreator antigo"
```

---

## Self-Review

**Cobertura da spec:**
- Perfil de Loja (CNPJ opcional, nome, logo, endereço, telefone, Instagram) → Task 1 (dados) + Task 6 (UI).
- Molde (grade automática + modo manual, slots de data/logo/contato) → Task 1 (dados) + Task 2 (grid math) + Task 5 (drag) + Task 7 (UI).
- Encarte semanal (produto automático via cadastro, preço/desconto editável, validade, export PNG/PDF frente-verso) → Task 1 (dados) + Task 3 (preço) + Task 9 (UI).
- Busca por CNPJ opcional → Task 4 + Task 6.
- Reaproveitamento de tipografia/export/ProductSelector → confirmado nos consumos de cada task (nenhuma lib nova, `ProductSelector` e `html2canvas`/`jsPDF` reaproveitados como estão).
- Substituição completa do Encarte antigo sem migração → Task 11.

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo e compilável.

**Consistência de tipos:** `EncarteSlotDef`, `EncarteMolde`, `EncarteSemanal`, `StoreProfile` definidos uma vez no Task 1 e usados com os mesmos nomes de campo (`xPct/yPct/widthPct/heightPct`, `frontSlots/backSlots`, `frontBgUrl/backBgUrl`, `moldeId/storeProfileId/produtos/validade`) em todos os tasks seguintes — conferido task a task ao escrever este plano.
