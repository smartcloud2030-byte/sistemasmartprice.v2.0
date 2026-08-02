# Pastas de Plaquinhas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o usuário salvar uma plaquinha (produto + modelo + ajustes) numa pasta nomeada por promoção (ex: "Dia da Beleza"), sincronizada no servidor por loja, pra reaproveitar toda semana só trocando o preço — sem depender da Fila de Impressão pra isso.

**Architecture:** Reaproveita o mesmo snapshot `QueuedPlaquinhaState` já usado pela Fila de Impressão. Persistência via o endpoint genérico já existente `GET/POST /api/settings/:id` (sem tabela nem rota nova), com uma chave `saved_plaquinhas` cujo valor é `{ [cnpjNormalizado]: SavedPlaquinha[] }` — mesmo padrão já usado por `activity_status`. Pasta é só um campo de texto (`folder`) em cada item, não uma entidade própria.

**Tech Stack:** React + TypeScript, Zustand (store global em `src/store.ts`), Tailwind, lucide-react (ícones), sonner (toasts). Testes de lógica pura via `tsx` + `node:assert` (padrão já usado em `src/lib/*.test.ts`); verificação de fluxo via app rodando localmente (`npm run dev`) + Postgres local (Docker), sem framework de teste de componente React no projeto.

## Global Constraints

- Não criar tabela nova no banco nem endpoint novo — reaproveitar `GET/POST /api/settings/:id` (`api.ts:339-366`).
- Miniatura embutida como base64 no próprio JSON (mesma técnica de `printQueue[].imageData`), não upload pro MinIO.
- Pasta é um campo de texto (`folder: string`), sem entidade/id próprio.
- `editingQueueIndex` (Fila) e `editingSavedPlaquinhaId` (Pastas) são mutuamente exclusivos — nunca os dois preenchidos ao mesmo tempo.
- Cada loja só vê as próprias pastas (isolado por cnpj normalizado, `replace(/[^\d]/g, '')`).
- Seguir a paleta/tipografia já usada em `PrintQueue.tsx` (zinc/blue, `font-black uppercase tracking-tighter`) pra manter a tela nova consistente visualmente.

---

## Antes de começar

Confirme que o ambiente local está de pé (Docker + Postgres + servidor dev),
do jeito que já foi usado nesta mesma sessão pra testar a Fila de Impressão:

```bash
docker run -d --name smartprice_pg_test -e POSTGRES_DB=smartprice -e POSTGRES_USER=smartprice -e POSTGRES_PASSWORD=local123 -p 5433:5432 postgres:16-alpine
# aguardar "pg_isready", depois:
cat init.sql | docker exec -i smartprice_pg_test psql -U smartprice -d smartprice
cat migration.sql | docker exec -i smartprice_pg_test psql -U smartprice -d smartprice
npm run dev
```

Login de admin padrão pra testes: usuário `jh`, senha `1993` (`api.ts:43-46`).
Pra testar como loja, crie uma loja de teste no painel "Gerenciar Usuários"
com "Selecionar Todos" nos modelos permitidos (senão a tela do editor mostra
"Acesso Restrito" em vez do canvas).

---

### Task 1: Tipo `SavedPlaquinha` + helper puro de agrupamento por pasta

**Files:**
- Modify: `src/store.ts:271` (depois do fechamento de `QueuedPlaquinhaState`, antes de `interface AppState {`)
- Create: `src/lib/savedPlaquinhaFolders.ts`
- Test: `src/lib/savedPlaquinhaFolders.test.ts`
- Modify: `package.json:8` (script `test`)

**Interfaces:**
- Produces: `SavedPlaquinha` (tipo, em `src/store.ts`), `groupByFolder(items: SavedPlaquinha[]): FolderGroup[]` e `FolderGroup { folder: string; items: SavedPlaquinha[] }` (em `src/lib/savedPlaquinhaFolders.ts`)

- [ ] **Step 1: Adicionar o tipo `SavedPlaquinha` em `src/store.ts`**

Abra `src/store.ts` e encontre este trecho (fim do tipo `QueuedPlaquinhaState`):

```ts
  isSingleProduct: boolean;
  showSingleProductControl: boolean;
  showOptionalTextControl: boolean;
}

interface AppState {
```

Substitua por:

```ts
  isSingleProduct: boolean;
  showSingleProductControl: boolean;
  showOptionalTextControl: boolean;
}

// Plaquinha salva numa pasta (biblioteca de promocoes reutilizaveis,
// sincronizada por loja no servidor — ver secao "Pastas de Plaquinhas").
// `folder` e so um campo de texto: nao existe entidade/tabela de pasta
// separada, "criar pasta" e so digitar um nome novo ao salvar.
export interface SavedPlaquinha {
  id: string;
  folder: string;
  name: string;
  imageData: string;
  isLandscape: boolean;
  editorState: QueuedPlaquinhaState;
  createdAt: string;
  updatedAt: string;
}

interface AppState {
```

- [ ] **Step 2: Escrever o teste do helper de agrupamento (falhando)**

Crie `src/lib/savedPlaquinhaFolders.test.ts`:

```ts
import assert from 'node:assert';
import { groupByFolder } from './savedPlaquinhaFolders';
import type { SavedPlaquinha } from '../store';

function makeItem(overrides: Partial<SavedPlaquinha>): SavedPlaquinha {
  return {
    id: overrides.id || 'id-1',
    folder: overrides.folder ?? 'Pasta A',
    name: overrides.name ?? 'Produto',
    imageData: 'data:image/png;base64,',
    isLandscape: false,
    editorState: {} as any,
    createdAt: overrides.createdAt || '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-01-01T00:00:00.000Z',
  };
}

function returnsEmptyArrayForEmptyInput() {
  assert.deepStrictEqual(groupByFolder([]), []);
}

function groupsItemsWithTheSameFolderTogether() {
  const items = [
    makeItem({ id: '1', folder: 'Dia da Beleza' }),
    makeItem({ id: '2', folder: 'Dia da Beleza' }),
    makeItem({ id: '3', folder: 'Fralda' }),
  ];
  const result = groupByFolder(items);
  assert.strictEqual(result.length, 2);
  const beleza = result.find((g) => g.folder === 'Dia da Beleza');
  assert.strictEqual(beleza?.items.length, 2);
}

function sortsFoldersAlphabetically() {
  const items = [
    makeItem({ id: '1', folder: 'Zeta' }),
    makeItem({ id: '2', folder: 'Alfa' }),
  ];
  const result = groupByFolder(items);
  assert.deepStrictEqual(result.map((g) => g.folder), ['Alfa', 'Zeta']);
}

function sortsItemsWithinFolderByMostRecentlyUpdatedFirst() {
  const items = [
    makeItem({ id: '1', folder: 'Pasta A', updatedAt: '2026-01-01T00:00:00.000Z' }),
    makeItem({ id: '2', folder: 'Pasta A', updatedAt: '2026-01-03T00:00:00.000Z' }),
  ];
  const result = groupByFolder(items);
  assert.deepStrictEqual(result[0].items.map((i) => i.id), ['2', '1']);
}

function trimsWhitespaceFromFolderNameBeforeGrouping() {
  const items = [
    makeItem({ id: '1', folder: 'Pasta A' }),
    makeItem({ id: '2', folder: 'Pasta A  ' }),
  ];
  const result = groupByFolder(items);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].items.length, 2);
}

try {
  returnsEmptyArrayForEmptyInput();
  groupsItemsWithTheSameFolderTogether();
  sortsFoldersAlphabetically();
  sortsItemsWithinFolderByMostRecentlyUpdatedFirst();
  trimsWhitespaceFromFolderNameBeforeGrouping();
  console.log('PASS: todos os testes de savedPlaquinhaFolders passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 3: Rodar o teste e confirmar que falha (módulo não existe ainda)**

Run: `npx tsx src/lib/savedPlaquinhaFolders.test.ts`
Expected: erro `Cannot find module './savedPlaquinhaFolders'`

- [ ] **Step 4: Implementar `groupByFolder`**

Crie `src/lib/savedPlaquinhaFolders.ts`:

```ts
import type { SavedPlaquinha } from '../store';

export interface FolderGroup {
  folder: string;
  items: SavedPlaquinha[];
}

// Agrupa plaquinhas salvas pelo campo `folder` (trima de novo por seguranca,
// mesmo ja vindo trimado ao salvar), pastas em ordem alfabetica e, dentro de
// cada pasta, itens do mais recente pro mais antigo.
export function groupByFolder(items: SavedPlaquinha[]): FolderGroup[] {
  const map = new Map<string, SavedPlaquinha[]>();
  for (const item of items) {
    const key = item.folder.trim();
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  const groups: FolderGroup[] = Array.from(map.entries()).map(([folder, groupItems]) => ({
    folder,
    items: [...groupItems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }));
  groups.sort((a, b) => a.folder.localeCompare(b.folder, 'pt-BR'));
  return groups;
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/savedPlaquinhaFolders.test.ts`
Expected: `PASS: todos os testes de savedPlaquinhaFolders passaram`

- [ ] **Step 6: Adicionar o teste novo ao script `test` do projeto**

Em `package.json`, troque a linha do script `test`:

```json
    "test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts && tsx src/lib/duplicateProductMatch.test.ts && tsx src/lib/productReportConflicts.test.ts && tsx src/lib/encarteGrid.test.ts && tsx src/lib/encartePrice.test.ts && tsx src/lib/cnpjLookup.test.ts",
```

por:

```json
    "test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts && tsx src/lib/duplicateProductMatch.test.ts && tsx src/lib/productReportConflicts.test.ts && tsx src/lib/encarteGrid.test.ts && tsx src/lib/encartePrice.test.ts && tsx src/lib/cnpjLookup.test.ts && tsx src/lib/savedPlaquinhaFolders.test.ts",
```

- [ ] **Step 7: Rodar `npm test` inteiro e checar tipos**

Run: `npm test`
Expected: todas as linhas `PASS: ...` até o final, sem erro.

Run: `npx tsc --noEmit -p .`
Expected: sem erros (exit code 0).

- [ ] **Step 8: Commit**

```bash
git add src/store.ts src/lib/savedPlaquinhaFolders.ts src/lib/savedPlaquinhaFolders.test.ts package.json
git commit -m "feat: tipo SavedPlaquinha e agrupamento por pasta"
```

---

### Task 2: Store — `View` novo valor + carregar pastas salvas do servidor no login

**Files:**
- Modify: `src/store.ts:148` (tipo `View`)
- Modify: `src/store.ts` (interface `AppState`, bloco de `printQueue`/`updateQueueItem`)
- Modify: `src/store.ts` (implementação, bloco de `printQueue`/`updateQueueItem`)
- Modify: `src/store.ts` (função `login`)

**Interfaces:**
- Consumes: `apiGet(path: string)` já existente em `src/store.ts:10-16` (retorna `{ value: any }` ou lança erro se `!res.ok`)
- Produces: `savedPlaquinhas: SavedPlaquinha[]`, `loadSavedPlaquinhas: () => Promise<void>` no `AppState`; `View` inclui `'folders'`

- [ ] **Step 1: Adicionar `'folders'` ao tipo `View`**

Encontre em `src/store.ts`:

```ts
export type View = 'editor' | 'queue' | 'encarte' | 'dashboard' | 'smarthelp';
```

Substitua por:

```ts
export type View = 'editor' | 'queue' | 'folders' | 'encarte' | 'dashboard' | 'smarthelp';
```

- [ ] **Step 2: Declarar os campos novos na interface `AppState`**

Encontre (mesmo bloco onde ficam `printQueue`/`editQueueItem`/`updateQueueItem`):

```ts
  editingQueueIndex: number | null;
  // Sobrescreve o item da fila que estava em edicao com o estado atual do
  // editor (nao cria item novo) e sai do modo de edicao da fila.
  updateQueueItem: (index: number, imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => void;
```

Substitua por (mantendo o bloco original e acrescentando depois):

```ts
  editingQueueIndex: number | null;
  // Sobrescreve o item da fila que estava em edicao com o estado atual do
  // editor (nao cria item novo) e sai do modo de edicao da fila.
  updateQueueItem: (index: number, imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => void;

  // Pastas de Plaquinhas — biblioteca por loja, sincronizada no servidor via
  // /api/settings/saved_plaquinhas (mesmo padrao de activity_status: um blob
  // so, indexado por cnpj dentro do JSON). Ver docs/superpowers/specs/2026-08-02-pastas-de-plaquinhas-design.md.
  savedPlaquinhas: SavedPlaquinha[];
  loadSavedPlaquinhas: () => Promise<void>;
  savePlaquinhaToFolder: (folder: string, name: string, imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => Promise<void>;
  editSavedPlaquinha: (id: string) => void;
  updateSavedPlaquinha: (imageData: string, isLandscape: boolean, editorState: QueuedPlaquinhaState) => Promise<void>;
  deleteSavedPlaquinha: (id: string) => Promise<void>;
  renameFolder: (oldName: string, newName: string) => Promise<void>;
  deleteFolder: (folder: string) => Promise<void>;
  editingSavedPlaquinhaId: string | null;
```

- [ ] **Step 3: Implementar `savedPlaquinhas`/`loadSavedPlaquinhas` (as outras actions ficam como stub temporário nesta task, implementadas de verdade nas próximas)**

Encontre, na implementação da store (`create<AppState>()(persist((set, get) => ({ ... }`), o bloco:

```ts
      editingQueueIndex: null,
      updateQueueItem: (index, imageData, isLandscape, editorState) => set((state) => {
        if (!state.printQueue[index]) return {};
        const newQueue = [...state.printQueue];
        newQueue[index] = { ...newQueue[index], imageData, isLandscape, editorState };
        return { printQueue: newQueue, editingQueueIndex: null };
      }),
```

Substitua por (mantendo o bloco original e acrescentando depois):

```ts
      editingQueueIndex: null,
      updateQueueItem: (index, imageData, isLandscape, editorState) => set((state) => {
        if (!state.printQueue[index]) return {};
        const newQueue = [...state.printQueue];
        newQueue[index] = { ...newQueue[index], imageData, isLandscape, editorState };
        return { printQueue: newQueue, editingQueueIndex: null };
      }),

      savedPlaquinhas: [],
      editingSavedPlaquinhaId: null,
      loadSavedPlaquinhas: async () => {
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        if (!cnpj) return;
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          set({ savedPlaquinhas: all[cnpj] || [] });
        } catch (err) {
          console.error('Erro ao carregar pastas salvas:', err);
        }
      },
      savePlaquinhaToFolder: async () => {
        // implementado na Task 3
      },
      editSavedPlaquinha: () => {
        // implementado na Task 4
      },
      updateSavedPlaquinha: async () => {
        // implementado na Task 4
      },
      deleteSavedPlaquinha: async () => {
        // implementado na Task 5
      },
      renameFolder: async () => {
        // implementado na Task 5
      },
      deleteFolder: async () => {
        // implementado na Task 5
      },
```

- [ ] **Step 4: Chamar `loadSavedPlaquinhas` no login**

Encontre em `src/store.ts`, dentro de `login: async (role, user) => { ... }`:

```ts
        await get().loadLayout();
        await get().fetchProducts();
      },
```

Substitua por:

```ts
        await get().loadLayout();
        await get().fetchProducts();
        await get().loadSavedPlaquinhas();
      },
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 6: Verificar manualmente que carrega sem quebrar**

Com `npm run dev` rodando e um Postgres local com o schema aplicado (ver "Antes de começar"), logue como uma loja de teste. Abra o DevTools do navegador (F12) → aba Console → digite:

```js
window.__smartpriceDebug = true; // so pra referencia, nao precisa existir de verdade
```

Não deve haver nenhum erro vermelho no console relacionado a `saved_plaquinhas` (é normal a rede mostrar uma chamada `GET /api/settings/saved_plaquinhas` retornando `{"value":null}` na primeira vez, isso é esperado).

- [ ] **Step 7: Commit**

```bash
git add src/store.ts
git commit -m "feat: carrega pastas salvas do servidor no login"
```

---

### Task 3: Store — salvar plaquinha numa pasta

**Files:**
- Modify: `src/store.ts` (implementação de `savePlaquinhaToFolder`)

**Interfaces:**
- Consumes: `apiGet`/`apiPost` (`src/store.ts:10-26`), `crypto.randomUUID()` (já usado em `src/store.ts:596,953`)
- Produces: `savePlaquinhaToFolder(folder, name, imageData, isLandscape, editorState): Promise<void>` funcional — adiciona a `get().savedPlaquinhas` e persiste no servidor

- [ ] **Step 1: Implementar `savePlaquinhaToFolder`**

Substitua o stub criado na Task 2:

```ts
      savePlaquinhaToFolder: async () => {
        // implementado na Task 3
      },
```

Por:

```ts
      savePlaquinhaToFolder: async (folder, name, imageData, isLandscape, editorState) => {
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        if (!cnpj) return;
        const trimmedFolder = folder.trim();
        if (!trimmedFolder) return;
        const newItem: SavedPlaquinha = {
          id: crypto.randomUUID(),
          folder: trimmedFolder,
          name: name.trim() || 'Sem nome',
          imageData,
          isLandscape,
          editorState,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const updated = [...get().savedPlaquinhas, newItem];
        set({ savedPlaquinhas: updated });
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          all[cnpj] = updated;
          await apiPost('/settings/saved_plaquinhas', { value: all });
        } catch (err) {
          console.error('Erro ao salvar plaquinha na pasta:', err);
        }
      },
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Verificar manualmente via console do navegador**

Com o app rodando e logado como loja de teste, no DevTools → Console:

```js
const store = document.querySelector('#root')._reactRootContainer; // nao usar isso
```

Em vez disso, use o fato de que o hook está acessível globalmente só depois da Task 6 (quando o botão existir). Por enquanto, valide via `curl` direto no endpoint, simulando o que o front vai mandar (troque `SEU_CNPJ_SEM_MASCARA` pelo cnpj normalizado da loja de teste que você criou):

```bash
curl -s -H "x-api-token: smartprice-api-2026" -X POST http://localhost:3000/api/settings/saved_plaquinhas \
  -H "Content-Type: application/json" \
  -d '{"value":{"SEU_CNPJ_SEM_MASCARA":[{"id":"teste-1","folder":"Dia da Beleza","name":"Teste","imageData":"data:image/png;base64,","isLandscape":false,"editorState":{},"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z"}]}}'

curl -s -H "x-api-token: smartprice-api-2026" http://localhost:3000/api/settings/saved_plaquinhas
```

Expected: o segundo `curl` retorna o JSON com o item `"folder":"Dia da Beleza"` salvo — confirma que o endpoint genérico aceita e devolve esse formato (a função em si será exercitada de ponta a ponta na Task 6, quando o botão existir).

- [ ] **Step 4: Commit**

```bash
git add src/store.ts
git commit -m "feat: salvar plaquinha em pasta"
```

---

### Task 4: Store — editar e atualizar plaquinha salva (exclusão mútua com a Fila)

**Files:**
- Modify: `src/store.ts` (implementação de `editSavedPlaquinha`, `updateSavedPlaquinha`, `editQueueItem`)

**Interfaces:**
- Consumes: `SavedPlaquinha.editorState` (Task 1), `get().savedPlaquinhas` (Task 2)
- Produces: `editSavedPlaquinha(id): void` e `updateSavedPlaquinha(imageData, isLandscape, editorState): Promise<void>` funcionais; `editQueueItem` e `editSavedPlaquinha` passam a zerar o índice/id um do outro

- [ ] **Step 1: Implementar `editSavedPlaquinha` e `updateSavedPlaquinha`**

Substitua os stubs criados na Task 2:

```ts
      editSavedPlaquinha: () => {
        // implementado na Task 4
      },
      updateSavedPlaquinha: async () => {
        // implementado na Task 4
      },
```

Por:

```ts
      editSavedPlaquinha: (id) => {
        const item = get().savedPlaquinhas.find((p) => p.id === id);
        if (!item) return;
        set({ ...item.editorState, currentView: 'editor', editingSavedPlaquinhaId: id, editingQueueIndex: null });
      },
      updateSavedPlaquinha: async (imageData, isLandscape, editorState) => {
        const id = get().editingSavedPlaquinhaId;
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        if (!id || !cnpj) return;
        const updated = get().savedPlaquinhas.map((p) =>
          p.id === id ? { ...p, imageData, isLandscape, editorState, updatedAt: new Date().toISOString() } : p
        );
        set({ savedPlaquinhas: updated, editingSavedPlaquinhaId: null });
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          all[cnpj] = updated;
          await apiPost('/settings/saved_plaquinhas', { value: all });
        } catch (err) {
          console.error('Erro ao atualizar plaquinha salva:', err);
        }
      },
```

- [ ] **Step 2: `editQueueItem` também zera `editingSavedPlaquinhaId` (exclusão mútua)**

Encontre:

```ts
      editQueueItem: (index) => {
        const item = get().printQueue[index];
        if (!item?.editorState) return;
        set({ ...item.editorState, currentView: 'editor', editingQueueIndex: index });
      },
```

Substitua por:

```ts
      editQueueItem: (index) => {
        const item = get().printQueue[index];
        if (!item?.editorState) return;
        set({ ...item.editorState, currentView: 'editor', editingQueueIndex: index, editingSavedPlaquinhaId: null });
      },
```

- [ ] **Step 3: Zerar `editingSavedPlaquinhaId` no login e no logout, igual já é feito com `editingQueueIndex`**

Encontre em `login`:

```ts
          editingQueueIndex: null,
          ...switchUpdate,
        } as any);
```

Substitua por:

```ts
          editingQueueIndex: null,
          editingSavedPlaquinhaId: null,
          ...switchUpdate,
        } as any);
```

Encontre em `logout`:

```ts
        set({ isAuthenticated: false, userRole: null, currentUser: null, lastLoginTimestamp: null, editingQueueIndex: null });
```

Substitua por:

```ts
        set({ isAuthenticated: false, userRole: null, currentUser: null, lastLoginTimestamp: null, editingQueueIndex: null, editingSavedPlaquinhaId: null });
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/store.ts
git commit -m "feat: editar/atualizar plaquinha salva, exclusao mutua com a fila"
```

(A verificação end-to-end deste fluxo — clicar Editar, mudar preço, ver o
botão de destaque, salvar — acontece na Task 10, depois de existir UI pra
clicar. Não dá pra testar isso manualmente antes da tela existir.)

---

### Task 5: Store — excluir plaquinha, renomear pasta, excluir pasta

**Files:**
- Modify: `src/store.ts` (implementação de `deleteSavedPlaquinha`, `renameFolder`, `deleteFolder`)

**Interfaces:**
- Consumes: `get().savedPlaquinhas`, `get().editingSavedPlaquinhaId` (Task 2, Task 4)
- Produces: `deleteSavedPlaquinha(id): Promise<void>`, `renameFolder(oldName, newName): Promise<void>`, `deleteFolder(folder): Promise<void>` funcionais

- [ ] **Step 1: Implementar as três actions**

Substitua os stubs criados na Task 2:

```ts
      deleteSavedPlaquinha: async () => {
        // implementado na Task 5
      },
      renameFolder: async () => {
        // implementado na Task 5
      },
      deleteFolder: async () => {
        // implementado na Task 5
      },
```

Por:

```ts
      deleteSavedPlaquinha: async (id) => {
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        if (!cnpj) return;
        const updated = get().savedPlaquinhas.filter((p) => p.id !== id);
        const editingSavedPlaquinhaId = get().editingSavedPlaquinhaId === id ? null : get().editingSavedPlaquinhaId;
        set({ savedPlaquinhas: updated, editingSavedPlaquinhaId });
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          all[cnpj] = updated;
          await apiPost('/settings/saved_plaquinhas', { value: all });
        } catch (err) {
          console.error('Erro ao excluir plaquinha salva:', err);
        }
      },
      renameFolder: async (oldName, newName) => {
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        const trimmedNew = newName.trim();
        if (!cnpj || !trimmedNew) return;
        const updated = get().savedPlaquinhas.map((p) =>
          p.folder === oldName ? { ...p, folder: trimmedNew, updatedAt: new Date().toISOString() } : p
        );
        set({ savedPlaquinhas: updated });
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          all[cnpj] = updated;
          await apiPost('/settings/saved_plaquinhas', { value: all });
        } catch (err) {
          console.error('Erro ao renomear pasta:', err);
        }
      },
      deleteFolder: async (folder) => {
        const cnpj = get().currentUser?.cnpj?.replace(/[^\d]/g, '');
        if (!cnpj) return;
        const currentEditingId = get().editingSavedPlaquinhaId;
        const editingItem = currentEditingId ? get().savedPlaquinhas.find((p) => p.id === currentEditingId) : null;
        const updated = get().savedPlaquinhas.filter((p) => p.folder !== folder);
        const editingSavedPlaquinhaId = editingItem?.folder === folder ? null : currentEditingId;
        set({ savedPlaquinhas: updated, editingSavedPlaquinhaId });
        try {
          const res = await apiGet('/settings/saved_plaquinhas');
          const all = res?.value || {};
          all[cnpj] = updated;
          await apiPost('/settings/saved_plaquinhas', { value: all });
        } catch (err) {
          console.error('Erro ao excluir pasta:', err);
        }
      },
```

- [ ] **Step 2: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/store.ts
git commit -m "feat: excluir plaquinha salva, renomear e excluir pasta"
```

(Verificação manual completa na Task 10, junto com o resto do fluxo — estas
actions só ficam clicáveis depois da Task 7.)

---

### Task 6: Botão "Salvar em Pasta" no editor + modal

**Files:**
- Create: `src/components/SaveToFolderModal.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `savePlaquinhaToFolder` (Task 3), `savedPlaquinhas` (Task 2), `buildQueueEditorState` (já existe em `src/App.tsx:452`, reaproveitado sem mudança)
- Produces: modal `SaveToFolderModal` reutilizável (props `isOpen`, `onClose`, `defaultName`, `onConfirm`)

- [ ] **Step 1: Criar o modal**

Crie `src/components/SaveToFolderModal.tsx`:

```tsx
import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { useStore } from '../store';
import { toast } from 'sonner';

interface SaveToFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultName: string;
  onConfirm: (folder: string, name: string) => Promise<void>;
}

const SaveToFolderModal: React.FC<SaveToFolderModalProps> = ({ isOpen, onClose, defaultName, onConfirm }) => {
  const { savedPlaquinhas } = useStore();
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState('');
  const [isNewFolder, setIsNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const existingFolders = Array.from(new Set(savedPlaquinhas.map((p) => p.folder))).sort();

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const finalFolder = isNewFolder ? newFolderName.trim() : folder;
    if (!finalFolder) {
      toast.error('Escolha ou digite o nome de uma pasta.');
      return;
    }
    if (!name.trim()) {
      toast.error('Dê um nome pra essa plaquinha.');
      return;
    }
    setIsSaving(true);
    try {
      await onConfirm(finalFolder, name.trim());
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <FolderPlus className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-black dark:text-white">Salvar em Pasta</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Nome da plaquinha</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60 ml-1">Pasta</label>
            {!isNewFolder ? (
              <>
                <select
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                >
                  <option value="">Selecione uma pasta...</option>
                  {existingFolders.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setIsNewFolder(true)}
                  className="text-xs font-bold text-blue-600 hover:underline mt-1"
                >
                  + Criar nova pasta
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Dia da Beleza"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-black dark:text-white"
                />
                {existingFolders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsNewFolder(false)}
                    className="text-xs font-bold text-blue-600 hover:underline mt-1"
                  >
                    Usar pasta já existente
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-bold text-sm text-black dark:text-white opacity-70 hover:opacity-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSaving}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-tighter hover:bg-blue-700 disabled:opacity-50 transition-all"
          >
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveToFolderModal;
```

- [ ] **Step 2: Importar o modal e o ícone `FolderPlus` em `src/App.tsx`**

Encontre:

```ts
import PaymentCheckoutModal from './components/PaymentCheckoutModal';
```

Substitua por (acrescenta a linha de import do modal novo):

```ts
import PaymentCheckoutModal from './components/PaymentCheckoutModal';
import SaveToFolderModal from './components/SaveToFolderModal';
```

Encontre:

```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet, Save
} from 'lucide-react';
```

Substitua por:

```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet, Save, FolderPlus
} from 'lucide-react';
```

- [ ] **Step 3: Destructure `savePlaquinhaToFolder` do store e criar estado local do modal**

Encontre:

```ts
    currentView, setView, addToQueue, printQueue, isPrinting,
    editingQueueIndex, updateQueueItem,
```

Substitua por:

```ts
    currentView, setView, addToQueue, printQueue, isPrinting,
    editingQueueIndex, updateQueueItem,
    savePlaquinhaToFolder,
```

Encontre:

```ts
  const [activeTab, setActiveTab] = useState<'select' | 'adjustments'>('select');
```

Substitua por (acrescenta o estado do modal depois):

```ts
  const [activeTab, setActiveTab] = useState<'select' | 'adjustments'>('select');
  const [isSaveToFolderOpen, setIsSaveToFolderOpen] = useState(false);
```

- [ ] **Step 4: Handler de confirmação do modal**

Encontre (logo depois de `handleSaveQueueEdit`, que termina em `};`):

```ts
  const renderContent = () => {
```

Substitua por (acrescenta o handler novo antes):

```ts
  const handleConfirmSaveToFolder = async (folder: string, name: string) => {
    const canvasData = (window as any).getCanvasData?.();
    if (!canvasData) {
      toast.error('Erro ao capturar imagem.');
      return;
    }
    const activeLayout = layouts[activeLayoutIndex];
    const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
    const isLandscape = !isQuartSuplemMaxi && (orientation === 'landscape' || activeLayoutIndex === 10);
    await savePlaquinhaToFolder(folder, name, canvasData, isLandscape, buildQueueEditorState(useStore.getState()));
    toast.success('Plaquinha salva na pasta!');
  };

  const renderContent = () => {
```

- [ ] **Step 5: Botão "Salvar em Pasta" no cabeçalho, do lado de "Adicionar à Fila"**

Encontre:

```tsx
              {/* Add to Queue */}
              <button
                type="button"
                onClick={handleAddToQueue}
                className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Adicionar à Fila — salva sem sair da tela atual"
              >
                <ListPlus className="w-4 h-4" />
              </button>
```

Substitua por (mantém o bloco original e acrescenta o botão novo depois):

```tsx
              {/* Add to Queue */}
              <button
                type="button"
                onClick={handleAddToQueue}
                className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Adicionar à Fila — salva sem sair da tela atual"
              >
                <ListPlus className="w-4 h-4" />
              </button>

              {/* Save to Folder */}
              <button
                type="button"
                onClick={() => setIsSaveToFolderOpen(true)}
                className="h-10 w-10 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Salvar em Pasta — guarda essa plaquinha pra reaproveitar depois"
              >
                <FolderPlus className="w-4 h-4" />
              </button>
```

- [ ] **Step 6: Renderizar o modal**

Encontre (perto de onde os outros modais globais são renderizados):

```tsx
      {/* User Management Modal */}
      {isUserModalOpen && (
```

Substitua por (acrescenta antes):

```tsx
      <SaveToFolderModal
        isOpen={isSaveToFolderOpen}
        onClose={() => setIsSaveToFolderOpen(false)}
        defaultName={textElements1.name.text}
        onConfirm={handleConfirmSaveToFolder}
      />

      {/* User Management Modal */}
      {isUserModalOpen && (
```

- [ ] **Step 7: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 8: Verificar manualmente no navegador**

Com `npm run dev` rodando: logue como loja de teste → clique no ícone de pasta novo (do lado de "Adicionar à Fila") → deve abrir o modal → digite um nome → clique "+ Criar nova pasta" → digite "Dia da Beleza" → Salvar. Deve aparecer o toast "Plaquinha salva na pasta!" e nenhum erro no console. Confirme via:

```bash
curl -s -H "x-api-token: smartprice-api-2026" http://localhost:3000/api/settings/saved_plaquinhas
```

Expected: o JSON retornado contém o cnpj da loja de teste com um array tendo o item recém-salvo, `"folder":"Dia da Beleza"`.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/components/SaveToFolderModal.tsx
git commit -m "feat: botao e modal Salvar em Pasta no editor"
```

---

### Task 7: Tela "Minhas Pastas"

**Files:**
- Create: `src/components/SavedFolders.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `groupByFolder` (Task 1), `savedPlaquinhas`/`editSavedPlaquinha`/`deleteSavedPlaquinha`/`renameFolder`/`deleteFolder`/`addToQueue` (Tasks 2-5, `addToQueue` já existe em `src/store.ts`)
- Produces: componente `SavedFolders`, view `'folders'` renderizável, botão "Minhas Pastas" no cabeçalho

- [ ] **Step 1: Criar a tela**

Crie `src/components/SavedFolders.tsx`:

```tsx
import React, { useState } from 'react';
import { useStore } from '../store';
import { ArrowLeft, Folder, FolderOpen, Pencil, Trash2, ListPlus, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { groupByFolder } from '../lib/savedPlaquinhaFolders';

const SavedFolders = () => {
  const { savedPlaquinhas, setView, editSavedPlaquinha, deleteSavedPlaquinha, renameFolder, deleteFolder, addToQueue } = useStore();
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const folders = groupByFolder(savedPlaquinhas);

  const handleAddToQueue = (item: (typeof savedPlaquinhas)[number]) => {
    addToQueue(item.imageData, item.isLandscape, item.editorState);
    toast.success('Adicionado à fila de impressão!');
  };

  const handleDeletePlaquinha = (id: string) => {
    if (!window.confirm('Excluir essa plaquinha salva?')) return;
    deleteSavedPlaquinha(id);
  };

  const handleDeleteFolder = (folder: string) => {
    if (!window.confirm(`Excluir a pasta "${folder}" e todas as plaquinhas dentro dela?`)) return;
    deleteFolder(folder);
    setOpenFolder(null);
  };

  const handleConfirmRename = (oldName: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== oldName) {
      renameFolder(oldName, trimmed);
      if (openFolder === oldName) setOpenFolder(trimmed);
    }
    setRenamingFolder(null);
  };

  if (openFolder !== null) {
    const items = folders.find((f) => f.folder === openFolder)?.items || [];
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center flex-wrap justify-between gap-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setOpenFolder(null)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">{openFolder}</h1>
                <p className="text-black dark:text-white opacity-60 text-sm font-medium uppercase tracking-widest">
                  {items.length} {items.length === 1 ? 'plaquinha salva' : 'plaquinhas salvas'}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDeleteFolder(openFolder)}
              className="whitespace-nowrap px-4 py-2 text-black dark:text-white opacity-60 hover:text-red-500 font-bold text-sm uppercase tracking-tighter flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Pasta
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <div key={item.id} className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden border-2 border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:-translate-y-1 transition-all">
                <img src={item.imageData} alt={item.name} className="w-full h-auto" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                  <button
                    onClick={() => editSavedPlaquinha(item.id)}
                    className="p-3 bg-amber-500 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Editar esta plaquinha"
                  >
                    <Pencil className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleAddToQueue(item)}
                    className="p-3 bg-blue-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Adicionar à fila de impressão"
                  >
                    <ListPlus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeletePlaquinha(item.id)}
                    className="p-3 bg-red-600 text-white rounded-full hover:scale-110 active:scale-90 transition-all shadow-lg"
                    title="Excluir"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-black dark:text-white truncate">{item.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('editor')}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-black dark:text-white"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">MINHAS <span className="text-blue-600">PASTAS</span></h1>
            <p className="text-black dark:text-white opacity-60 text-sm font-medium uppercase tracking-widest">
              {folders.length} {folders.length === 1 ? 'pasta' : 'pastas'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {folders.map(({ folder, items }) => (
            <div
              key={folder}
              className="group relative bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border-2 border-zinc-200 dark:border-zinc-800 hover:shadow-2xl hover:-translate-y-1 transition-all p-6 cursor-pointer"
              onClick={() => setOpenFolder(folder)}
            >
              <Folder className="w-10 h-10 text-blue-600 mb-3" />
              {renamingFolder === folder ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => handleConfirmRename(folder)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmRename(folder)}
                  className="w-full px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-black dark:text-white font-bold"
                />
              ) : (
                <h3 className="font-black text-black dark:text-white truncate">{folder}</h3>
              )}
              <p className="text-xs text-black dark:text-white opacity-60 mt-1">
                {items.length} {items.length === 1 ? 'plaquinha' : 'plaquinhas'}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFolder(folder);
                  setRenameValue(folder);
                }}
                className="absolute top-3 right-3 p-1.5 bg-white dark:bg-zinc-800 rounded-md shadow border border-zinc-200 dark:border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Renomear pasta"
              >
                <PencilLine className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            </div>
          ))}

          {folders.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-black dark:text-white opacity-40 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
              <FolderOpen className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold uppercase tracking-widest text-sm text-black dark:text-white opacity-60">Nenhuma pasta salva ainda</p>
              <button
                onClick={() => setView('editor')}
                className="mt-4 text-blue-600 font-bold hover:underline opacity-100"
              >
                Voltar ao editor pra salvar sua primeira plaquinha
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedFolders;
```

- [ ] **Step 2: Importar em `src/App.tsx` e adicionar o ícone `FolderOpen`**

Encontre:

```ts
import SaveToFolderModal from './components/SaveToFolderModal';
```

Substitua por:

```ts
import SaveToFolderModal from './components/SaveToFolderModal';
import SavedFolders from './components/SavedFolders';
```

Encontre:

```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet, Save, FolderPlus
} from 'lucide-react';
```

Substitua por:

```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet, Save, FolderPlus, FolderOpen
} from 'lucide-react';
```

- [ ] **Step 3: Renderizar a view nova**

Encontre:

```ts
    if (currentView === 'queue') {
      return <PrintQueue />;
    }
```

Substitua por:

```ts
    if (currentView === 'queue') {
      return <PrintQueue />;
    }

    if (currentView === 'folders') {
      return <SavedFolders />;
    }
```

- [ ] **Step 4: Botão "Minhas Pastas" no cabeçalho, do lado de "Fila Inteligente"**

Encontre:

```tsx
              {/* Queue */}
              <button
                onClick={() => setView('queue')}
                className="relative h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
              >
                <LayoutGrid className="w-4 h-4" />
                Fila Inteligente
                {printQueue.length > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {printQueue.length}
                  </span>
                )}
              </button>
```

Substitua por (mantém o bloco original e acrescenta o botão novo depois):

```tsx
              {/* Queue */}
              <button
                onClick={() => setView('queue')}
                className="relative h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
              >
                <LayoutGrid className="w-4 h-4" />
                Fila Inteligente
                {printQueue.length > 0 && (
                  <span className="bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {printQueue.length}
                  </span>
                )}
              </button>

              {/* Pastas */}
              <button
                onClick={() => setView('folders')}
                className="relative h-10 flex items-center gap-1.5 px-3.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-sm font-semibold"
              >
                <FolderOpen className="w-4 h-4" />
                Minhas Pastas
              </button>
```

- [ ] **Step 5: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 6: Verificar manualmente**

Com a plaquinha salva na Task 6 (pasta "Dia da Beleza") ainda no banco: clique em "Minhas Pastas" → deve aparecer o card da pasta com "1 plaquinha" → clique nela → deve mostrar o card com a miniatura, e os 3 botões ao passar o mouse (Editar, Adicionar à Fila, Excluir). Clique "Adicionar à Fila" → vá em "Fila Inteligente" → confirme que o item apareceu lá.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/SavedFolders.tsx
git commit -m "feat: tela Minhas Pastas"
```

---

### Task 8: Botão de destaque "Salvar na Pasta" no editor

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `editingSavedPlaquinhaId`, `updateSavedPlaquinha` (Task 4), `buildQueueEditorState` (já existe)

- [ ] **Step 1: Destructure `editingSavedPlaquinhaId` e `updateSavedPlaquinha` do store**

Encontre:

```ts
    editingQueueIndex, updateQueueItem,
    savePlaquinhaToFolder,
```

Substitua por:

```ts
    editingQueueIndex, updateQueueItem,
    savePlaquinhaToFolder, editingSavedPlaquinhaId, updateSavedPlaquinha,
```

- [ ] **Step 2: Handler `handleSaveSavedPlaquinhaEdit`**

Encontre (logo depois do fim de `handleSaveQueueEdit`, que termina assim):

```ts
        updateQueueItem(editingQueueIndex, canvasData, isLandscape, buildQueueEditorState(useStore.getState()));
        toast.success('Plaquinha atualizada na fila!', { id: toastId });
      } catch (error) {
        console.error('Erro ao salvar na fila:', error);
        toast.error('Erro ao salvar na fila.', { id: toastId });
      }
    }, 100);
  };
```

Substitua por (mantém o bloco original e acrescenta o handler novo depois):

```ts
        updateQueueItem(editingQueueIndex, canvasData, isLandscape, buildQueueEditorState(useStore.getState()));
        toast.success('Plaquinha atualizada na fila!', { id: toastId });
      } catch (error) {
        console.error('Erro ao salvar na fila:', error);
        toast.error('Erro ao salvar na fila.', { id: toastId });
      }
    }, 100);
  };

  const handleSaveSavedPlaquinhaEdit = () => {
    if (editingSavedPlaquinhaId === null) return;
    setSelectedId(null);
    const toastId = toast.loading('Salvando na pasta...');

    setTimeout(() => {
      try {
        const canvasData = (window as any).getCanvasData?.();
        if (!canvasData) {
          toast.error('Erro ao capturar imagem.', { id: toastId });
          return;
        }
        const activeLayout = layouts[activeLayoutIndex];
        const isQuartSuplemMaxi = activeLayout?.name === 'Quart Suplem Maxi';
        const isLandscape = !isQuartSuplemMaxi && (orientation === 'landscape' || activeLayoutIndex === 10);

        updateSavedPlaquinha(canvasData, isLandscape, buildQueueEditorState(useStore.getState()));
        toast.success('Plaquinha atualizada na pasta!', { id: toastId });
      } catch (error) {
        console.error('Erro ao salvar na pasta:', error);
        toast.error('Erro ao salvar na pasta.', { id: toastId });
      }
    }, 100);
  };
```

- [ ] **Step 3: Botão de destaque, do lado do "Salvar na Fila"**

Encontre:

```tsx
              {editingQueueIndex !== null && (
                <button
                  type="button"
                  onClick={handleSaveQueueEdit}
                  className="h-10 flex items-center gap-1.5 px-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/40 hover:bg-blue-700 transition-all text-sm font-black uppercase tracking-tighter animate-pulse ring-2 ring-blue-400"
                  title="Salvar alterações nesta plaquinha da fila"
                >
                  <Save className="w-4 h-4" />
                  Salvar na Fila
                </button>
              )}
```

Substitua por (mantém o bloco original e acrescenta o botão novo depois):

```tsx
              {editingQueueIndex !== null && (
                <button
                  type="button"
                  onClick={handleSaveQueueEdit}
                  className="h-10 flex items-center gap-1.5 px-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/40 hover:bg-blue-700 transition-all text-sm font-black uppercase tracking-tighter animate-pulse ring-2 ring-blue-400"
                  title="Salvar alterações nesta plaquinha da fila"
                >
                  <Save className="w-4 h-4" />
                  Salvar na Fila
                </button>
              )}

              {editingSavedPlaquinhaId !== null && (
                <button
                  type="button"
                  onClick={handleSaveSavedPlaquinhaEdit}
                  className="h-10 flex items-center gap-1.5 px-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/40 hover:bg-blue-700 transition-all text-sm font-black uppercase tracking-tighter animate-pulse ring-2 ring-blue-400"
                  title="Salvar alterações nesta plaquinha da pasta"
                >
                  <Save className="w-4 h-4" />
                  Salvar na Pasta
                </button>
              )}
```

- [ ] **Step 4: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Verificar manualmente o fluxo completo de edição**

Vá em "Minhas Pastas" → abra "Dia da Beleza" → clique em "Editar" na plaquinha → confirme que volta pro editor e aparece o botão azul piscando "Salvar na Pasta" (e **não** aparece "Salvar na Fila" ao mesmo tempo). Mude o preço → clique "Salvar na Pasta" → confirme o toast de sucesso e que o botão some. Volte em "Minhas Pastas" → confirme que a miniatura/preço atualizou e que **não** duplicou o item (continua só 1 na pasta).

Depois, o teste cruzado: vá na "Fila Inteligente", clique "Editar" num item da fila → confirme que aparece "Salvar na Fila" e **não** "Salvar na Pasta".

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: botao de destaque Salvar na Pasta"
```

---

### Task 9: Remover a dica temporária da Fila de Impressão

**Files:**
- Modify: `src/components/PrintQueue.tsx`

- [ ] **Step 1: Remover o estado e a função de dispensar a dica**

Encontre:

```tsx
import React, { useState } from 'react';
import { useStore } from '../store';
import { Printer, FileDown, Trash2, ArrowLeft, LayoutGrid, CheckSquare, Square, Pencil, Lightbulb, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const QUEUE_TIP_DISMISSED_KEY = 'smartprice_queue_tip_dismissed';

const PrintQueue = () => {
  const { printQueue, removeFromQueue, clearQueue, setView, setPrinting, isPrinting, toggleQueueSelection, setAllQueueSelected, editQueueItem } = useStore();
  const [tipDismissed, setTipDismissed] = useState(() => localStorage.getItem(QUEUE_TIP_DISMISSED_KEY) === '1');
  const dismissTip = () => {
    localStorage.setItem(QUEUE_TIP_DISMISSED_KEY, '1');
    setTipDismissed(true);
  };
```

Substitua por:

```tsx
import React from 'react';
import { useStore } from '../store';
import { Printer, FileDown, Trash2, ArrowLeft, LayoutGrid, CheckSquare, Square, Pencil } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

const PrintQueue = () => {
  const { printQueue, removeFromQueue, clearQueue, setView, setPrinting, isPrinting, toggleQueueSelection, setAllQueueSelected, editQueueItem } = useStore();
```

- [ ] **Step 2: Remover o banner do JSX**

Encontre:

```tsx
        {/* Dica: a fila como "prateleira" de promocoes reutilizaveis — nao
            precisa recriar a plaquinha toda semana, so editar o preco. */}
        {!tipDismissed && (
          <div className="no-print flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40 rounded-2xl p-4">
            <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-grow text-sm text-black dark:text-white">
              <p className="font-bold">Dica: use a fila como sua prateleira de promoções da semana</p>
              <p className="opacity-70 mt-1">
                Promoção repetiu? Não precisa montar a plaquinha de novo — passe o mouse nela aqui embaixo, clique em <strong>Editar</strong>, troque só o preço e depois em <strong>Salvar na Fila</strong>. Use o checkbox de cada plaquinha pra marcar só as da semana atual antes de imprimir.
              </p>
              <p className="opacity-70 mt-1">
                Atenção: essa fila fica salva só neste navegador/computador — evite limpar o histórico ou trocar de máquina pra não perder o que já foi montado.
              </p>
            </div>
            <button
              onClick={dismissTip}
              className="flex-shrink-0 p-1 text-blue-600 opacity-60 hover:opacity-100 transition-opacity"
              title="Não mostrar de novo"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Queue Grid */}
```

Substitua por:

```tsx
        {/* Queue Grid */}
```

- [ ] **Step 3: Checar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 4: Verificar manualmente**

Abra a Fila de Impressão. O banner azul não deve mais aparecer, mesmo em `localStorage.removeItem('smartprice_queue_tip_dismissed')` seguido de reload.

- [ ] **Step 5: Commit**

```bash
git add src/components/PrintQueue.tsx
git commit -m "fix: remove dica temporaria da fila, substituida pelas Pastas"
```

---

### Task 10: Verificação end-to-end completa

Sem mudança de código — só validação manual do fluxo inteiro antes de considerar a feature pronta. Use o app rodando localmente (`npm run dev` + Postgres local), logado como uma loja de teste com "Selecionar Todos" nos modelos permitidos.

- [ ] **Step 1: Rodar a suíte de testes e checagem de tipos**

Run: `npm test`
Expected: todas as linhas `PASS: ...`, nenhum `FAIL`.

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 2: Fluxo completo — criar, ver, editar, imprimir, excluir**

1. No editor, monte uma plaquinha (produto + preço).
2. Clique "Salvar em Pasta" → crie a pasta "Segunda-feira" → salve.
3. Vá em "Minhas Pastas" → confirme que "Segunda-feira" aparece com 1 plaquinha.
4. Abra a pasta → confirme a miniatura correta.
5. Clique "Editar" → mude o preço → confirme que aparece **só** o botão "Salvar na Pasta" (não "Salvar na Fila") → clique nele.
6. Volte em "Minhas Pastas" → "Segunda-feira" → confirme que o preço atualizou e continua só 1 item (não duplicou).
7. Clique "Adicionar à Fila" no card → vá em "Fila Inteligente" → confirme que apareceu lá, pronta pra imprimir.
8. Volte em "Minhas Pastas" → renomeie "Segunda-feira" pra "Segunda" (ícone de lápis no card da pasta) → confirme que o nome mudou.
9. Exclua a plaquinha salva (ícone de lixeira no card) → confirme que a pasta ficou com 0 itens.
10. Exclua a pasta "Segunda" → confirme que ela sumiu da lista.

- [ ] **Step 3: Confirmar isolamento por loja**

Crie uma segunda loja de teste (outro CNPJ) → logue nela → confirme que "Minhas Pastas" aparece vazia (não mostra as pastas da primeira loja).

- [ ] **Step 4: Confirmar sincronização entre "computadores"**

Com a primeira loja logada em duas abas do navegador diferentes (ou uma aba normal + uma anônima), salve uma plaquinha numa pasta na aba 1 → na aba 2, dê F5 (ou faça login de novo) → confirme que a pasta aparece lá também (prova que está sincronizando pelo servidor, não só localStorage).

- [ ] **Step 5: Limpar o ambiente de teste local**

```bash
docker rm -f smartprice_pg_test
```

Encerre o `npm run dev` (Ctrl+C ou matar o processo na porta 3000).

- [ ] **Step 6: Reportar ao usuário**

Resumo do que foi verificado, qualquer coisa que não passou, e perguntar se quer que suba (commit já feito task a task; falta só o `git push` pro deploy automático — produção e standby).
