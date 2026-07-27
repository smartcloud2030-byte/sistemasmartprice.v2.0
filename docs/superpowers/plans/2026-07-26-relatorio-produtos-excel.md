# Relatório de produtos em Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin exportar o catálogo de produtos pra uma planilha
Excel, editar campos (principalmente código de barras) fora do sistema, e
subir a planilha de volta pra atualizar tudo de uma vez.

**Architecture:** Export/import roda inteiramente no navegador (biblioteca
`xlsx`/SheetJS) — sem endpoint de export no backend, já que o catálogo já
está carregado em `useStore().products`. A checagem de conflito (linha da
planilha × catálogo, e linha × linha da própria planilha) é um módulo puro
reaproveitando `findDuplicateProduct` (já existe). O único código novo no
servidor é um endpoint de atualização em lote por ID
(`PUT /products/bulk`). Um novo componente (`ProductReport.tsx`) concentra a
UI, acessível via um novo item no menu "Administração".

**Tech Stack:** TypeScript, React, zustand (store), Express/pg (backend).
Nova dependência: `xlsx` (SheetJS), só usada no client.

## Global Constraints

- Export e leitura da planilha 100% no navegador — sem endpoint de export.
- Chave de atualização: coluna **ID** (oculta/técnica) — linha sem ID é
  ignorada, nunca vira cadastro novo.
- Import só mexe em 6 campos: nome, código de barras 1 e 2, preço, categoria,
  descrição. **Nunca** mexe em imagem/foto (`image`/`thumb_image`).
- Conflito (código de barras ou nome batendo, seja contra o catálogo ou
  entre linhas da própria planilha) **bloqueia o import inteiro** — nada é
  enviado ao servidor até resolver.
- `PUT /products/bulk` precisa ser registrado **antes** de
  `PUT /products/:id` no Express, senão a rota `:id` intercepta
  `/products/bulk` tratando "bulk" como um ID.
- Cabeçalhos da planilha exportada não podem ser renomeados pelo admin (o
  import lê pelos nomes exatos das colunas) — limitação conhecida, avisada
  na tela.

---

### Task 1: Módulo de conflitos (`findImportConflicts`)

**Files:**
- Create: `src/lib/productReportConflicts.ts`
- Test: `src/lib/productReportConflicts.test.ts`
- Modify: `package.json` (adiciona o novo teste ao script `"test"`)

**Interfaces:**
- Consumes: `findDuplicateProduct(candidate, products, excludeId?): Product | null` (`src/lib/duplicateProductMatch.ts`, já existe).
- Produces: `ReportRow` (interface), `ReportConflict` (union type),
  `findImportConflicts(rows: ReportRow[], products: Product[]): ReportConflict[]`,
  usados pela Task 3 (componente).

- [ ] **Step 1: Escrever o teste (vai falhar por o módulo ainda não existir)**

Criar `src/lib/productReportConflicts.test.ts`:

```ts
import assert from 'node:assert';
import { findImportConflicts } from './productReportConflicts';

const catalog = [
  { id: 1, name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  { id: 2, name: 'Neosaldina Muscular', description: '', price: 'R$ 20,00', image: null, category: 'medicamento', barcode: '7891142033306', barcode2: null },
] as any;

function noConflictWhenRowMatchesOnlyItself() {
  const rows = [{ id: 1, name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0, 'linha editando o proprio produto sem mudar nome/codigo nao deveria conflitar');
}

function catalogConflictWhenBarcodeMatchesAnotherProduct() {
  const rows = [{ id: 1, name: 'Coca-Cola 350ml', barcode: '7891142033306', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' }];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].reason, 'catalog');
  assert.strictEqual((conflicts[0] as any).matchedProduct.id, 2);
}

function batchConflictWhenTwoRowsShareBarcode() {
  const rows = [
    { id: 1, name: 'Coca-Cola 350ml', barcode: '9999999999999', barcode2: null, price: 'R$ 5,00', category: 'conveniencia', description: '' },
    { id: 2, name: 'Neosaldina Muscular', barcode: '9999999999999', barcode2: null, price: 'R$ 20,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 2, 'as duas linhas que colidem entre si deveriam ser reportadas');
  assert.ok(conflicts.every(c => c.reason === 'batch'));
}

function noConflictsForCleanImport() {
  const rows = [
    { id: 1, name: 'Coca-Cola 350ml', barcode: '7894900011517', barcode2: null, price: 'R$ 6,00', category: 'conveniencia', description: 'nova descricao' },
    { id: 2, name: 'Neosaldina Muscular', barcode: '7891142033306', barcode2: '7891142033307', price: 'R$ 22,00', category: 'medicamento', description: '' },
  ];
  const conflicts = findImportConflicts(rows, catalog);
  assert.strictEqual(conflicts.length, 0);
}

try {
  noConflictWhenRowMatchesOnlyItself();
  catalogConflictWhenBarcodeMatchesAnotherProduct();
  batchConflictWhenTwoRowsShareBarcode();
  noConflictsForCleanImport();
  console.log('PASS: todos os testes de productReportConflicts passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/productReportConflicts.test.ts`
Expected: erro do tipo `Cannot find module './productReportConflicts'`.

- [ ] **Step 3: Implementar `findImportConflicts`**

Criar `src/lib/productReportConflicts.ts` — a lógica abaixo já foi validada
empiricamente (rodada com os mesmos 4 cenários do teste, todos passando)
antes de entrar neste plano:

```ts
import type { Product } from '../store';
import { findDuplicateProduct } from './duplicateProductMatch';

export interface ReportRow {
  id: string | number;
  name: string;
  barcode: string | null;
  barcode2: string | null;
  price: string;
  category: string;
  description: string;
}

export type ReportConflict =
  | { row: ReportRow; reason: 'catalog'; matchedProduct: Product }
  | { row: ReportRow; reason: 'batch'; matchedRow: ReportRow };

function rowToProductLike(row: ReportRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: null,
    category: row.category,
    barcode: row.barcode,
    barcode2: row.barcode2,
  };
}

// Acha conflitos numa lista de linhas importadas de planilha: cada linha
// contra o catalogo atual (excluindo o proprio produto, pelo id da linha) e
// cada linha contra as OUTRAS linhas da mesma planilha (pega o caso de a
// propria edicao criar uma colisao nova entre duas linhas).
export function findImportConflicts(rows: ReportRow[], products: Product[]): ReportConflict[] {
  const conflicts: ReportConflict[] = [];

  for (const row of rows) {
    const catalogMatch = findDuplicateProduct(
      { name: row.name, barcode: row.barcode, barcode2: row.barcode2 },
      products,
      row.id
    );
    if (catalogMatch) {
      conflicts.push({ row, reason: 'catalog', matchedProduct: catalogMatch });
      continue;
    }

    const otherRows = rows.filter(r => r !== row);
    const batchMatch = findDuplicateProduct(
      { name: row.name, barcode: row.barcode, barcode2: row.barcode2 },
      otherRows.map(rowToProductLike)
    );
    if (batchMatch) {
      const matchedRow = otherRows.find(r => r.id === batchMatch.id)!;
      conflicts.push({ row, reason: 'batch', matchedRow });
    }
  }

  return conflicts;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/productReportConflicts.test.ts`
Expected: `PASS: todos os testes de productReportConflicts passaram`, exit code 0.

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

O valor atual de `"test"` em `package.json` termina em
`... tsx src/lib/duplicateProductMatch.test.ts`. Adicionar
` && tsx src/lib/productReportConflicts.test.ts` no final dessa string.

- [ ] **Step 6: Rodar a suíte completa e checar tipos**

Run: `npm test` — as 4 linhas `PASS: ...` aparecem, exit code 0.
Run: `npm run lint` — sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/productReportConflicts.ts src/lib/productReportConflicts.test.ts package.json
git commit -m "feat: modulo de checagem de conflitos do import de planilha (findImportConflicts)"
```

---

### Task 2: Endpoint de atualização em lote (`PUT /products/bulk`)

**Files:**
- Modify: `api.ts:270-272` (insere a rota nova entre `POST /products/bulk` e `PUT /products/:id`)

**Interfaces:**
- Produces: `PUT /api/products/bulk` — recebe um array `[{ id, name,
  description, price, category, barcode, barcode2 }, ...]`, protegido por
  `apiAuth`. Resposta: `{ updatedCount: number, skippedIds: (string|number)[] }`.
  Usado pela Task 3.

- [ ] **Step 1: Adicionar a rota**

Em `api.ts`, entre o fim de `POST /products/bulk` (linha 270, `});`) e o
comentário `// Atualizar produto` / `router.put('/products/:id', ...` (linha
272-273), inserir:

```ts
// Atualizar varios produtos de uma vez, por id (usado pelo import de
// planilha) — precisa vir ANTES de PUT /products/:id, senao o Express
// tentaria casar "/products/bulk" com a rota :id.
router.put('/products/bulk', apiAuth, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Formato inválido' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let updatedCount = 0;
      const skippedIds: (string | number)[] = [];
      for (const p of updates) {
        if (p.id === undefined || p.id === null) continue;
        const result = await client.query(
          `UPDATE products SET name=$1, description=$2, price=$3, category=$4, barcode=$5, barcode2=$6
           WHERE id=$7`,
          [p.name || '', p.description || '', p.price || 'R$ 0,00', p.category || '', p.barcode || null, p.barcode2 || null, p.id]
        );
        if (result.rowCount && result.rowCount > 0) updatedCount++;
        else skippedIds.push(p.id);
      }
      await client.query('COMMIT');
      res.json({ updatedCount, skippedIds });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

```

Note que o `UPDATE` não inclui `image` nem `thumb_image` no `SET` — a foto
do produto nunca é tocada por este endpoint, por design.

- [ ] **Step 2: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 3: Testar manualmente contra o servidor local**

Com o servidor local rodando (Docker com `postgres`/`minio`/`app`, tabelas
`products`/`settings` já criadas) e pelo menos um produto cadastrado:

```bash
# pega o id de um produto existente
curl -s http://localhost:3000/api/products | node -e "process.stdin.on('data', d => console.log(JSON.parse(d)[0]))"

# atualiza esse produto (troque 1 pelo id real)
curl -s -X PUT http://localhost:3000/api/products/bulk \
  -H "Content-Type: application/json" \
  -H "x-api-token: smartprice-api-2026" \
  -d '[{"id": 1, "name": "Teste Bulk Update", "description": "desc", "price": "R$ 9,99", "category": "padrao", "barcode": "1112223334445", "barcode2": null}]'
```

Expected: resposta `{"updatedCount":1,"skippedIds":[]}`. Conferir via
`GET /api/products` que o produto foi atualizado (nome, código de barras) e
que `image`/`thumb_image` continuam iguais a antes.

Testar também um ID inexistente:
```bash
curl -s -X PUT http://localhost:3000/api/products/bulk \
  -H "Content-Type: application/json" \
  -H "x-api-token: smartprice-api-2026" \
  -d '[{"id": 999999, "name": "Nao existe", "description": "", "price": "R$ 0,00", "category": "", "barcode": null, "barcode2": null}]'
```
Expected: `{"updatedCount":0,"skippedIds":[999999]}`, sem erro 500.

- [ ] **Step 4: Commit**

```bash
git add api.ts
git commit -m "feat: endpoint PUT /products/bulk pra atualizacao em lote por id"
```

---

### Task 3: Componente `ProductReport` (export + import + conflitos)

**Files:**
- Create: `src/components/ProductReport.tsx`
- Modify: `package.json` (adiciona dependência `xlsx`)

**Interfaces:**
- Consumes: `findImportConflicts` (Task 1), `PUT /api/products/bulk` (Task 2),
  `useStore().products/fetchProducts/fetchProductCount` (já existem).
- Produces: componente `ProductReport` (default export, sem props), usado
  pela Task 4 dentro do modal em `App.tsx`.

- [ ] **Step 1: Adicionar a dependência `xlsx`**

```bash
npm install xlsx
```

- [ ] **Step 2: Criar o componente**

Criar `src/components/ProductReport.tsx`:

```tsx
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../store';
import { Download, Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { findImportConflicts, ReportRow, ReportConflict } from '../lib/productReportConflicts';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

const COLUMNS = ['ID', 'Nome do Produto', 'Código de Barras 1', 'Código de Barras 2', 'Preço', 'Categoria', 'Descrição'];

function parseId(raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

function cellToString(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

export default function ProductReport() {
  const { products, fetchProducts, fetchProductCount } = useStore();
  const [pendingRows, setPendingRows] = useState<ReportRow[] | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [conflicts, setConflicts] = useState<ReportConflict[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = () => {
    const rows = products.map(p => ({
      'ID': p.id,
      'Nome do Produto': p.name,
      'Código de Barras 1': p.barcode || '',
      'Código de Barras 2': p.barcode2 || '',
      'Preço': p.price,
      'Categoria': p.category,
      'Descrição': p.description,
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `produtos-smartprice-${today}.xlsx`);
  };

  const resetImportState = () => {
    setPendingRows(null);
    setIgnoredCount(0);
    setConflicts([]);
  };

  const handleFileSelected = async (file: File) => {
    resetImportState();
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      const rows: ReportRow[] = [];
      let ignored = 0;
      for (const r of raw) {
        const id = parseId(r['ID']);
        if (id === null) { ignored++; continue; }
        rows.push({
          id,
          name: cellToString(r['Nome do Produto']),
          barcode: cellToString(r['Código de Barras 1']) || null,
          barcode2: cellToString(r['Código de Barras 2']) || null,
          price: cellToString(r['Preço']),
          category: cellToString(r['Categoria']),
          description: cellToString(r['Descrição']),
        });
      }

      setIgnoredCount(ignored);
      const foundConflicts = findImportConflicts(rows, products);
      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
      } else {
        setPendingRows(rows);
      }
    } catch {
      toast.error('Não foi possível ler essa planilha. Confirme que é o arquivo .xlsx baixado por aqui.');
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingRows) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-api-token': API_SECRET },
        body: JSON.stringify(pendingRows),
      });
      if (!res.ok) throw new Error(`PUT /products/bulk falhou: ${res.status}`);
      const data = await res.json();
      toast.success(`${data.updatedCount} produto(s) atualizado(s)${data.skippedIds?.length ? `, ${data.skippedIds.length} ignorado(s) (não encontrado(s))` : ''}.`);
      resetImportState();
      await fetchProducts();
      await fetchProductCount();
    } catch (e: any) {
      toast.error('Erro ao atualizar produtos: ' + (e.message || 'tente novamente'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-black dark:text-white">1. Baixar planilha</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Baixe o catálogo atual em Excel, edite os campos que quiser (não mexa na coluna ID) e suba de volta.
        </p>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          <Download className="w-4 h-4" /> Baixar planilha (Excel)
        </button>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-black dark:text-white">2. Subir planilha atualizada</p>
        <label className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg cursor-pointer text-sm font-medium text-blue-600 w-fit">
          <Upload className="w-4 h-4" /> Selecionar planilha (.xlsx)
          <input type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }} />
        </label>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <p className="font-bold uppercase text-sm">Conflitos encontrados — nada foi atualizado</p>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {conflicts.map((c, i) => (
              <div key={i} className="text-xs bg-white dark:bg-zinc-900 rounded-lg p-2">
                <p className="font-semibold text-black dark:text-white">Linha do produto ID {c.row.id} ({c.row.name || 'sem nome'})</p>
                <p className="text-zinc-500 dark:text-zinc-400">
                  {c.reason === 'catalog'
                    ? `bate com o produto já cadastrado "${c.matchedProduct.name}" (ID ${c.matchedProduct.id})`
                    : `bate com outra linha da mesma planilha: ID ${c.matchedRow.id} (${c.matchedRow.name || 'sem nome'})`}
                </p>
              </div>
            ))}
          </div>
          <button onClick={resetImportState} className="text-xs font-bold uppercase text-amber-600 hover:text-amber-700">Fechar</button>
        </div>
      )}

      {pendingRows && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 rounded-xl p-4 space-y-3">
          <p className="text-sm text-black dark:text-white">
            <strong>{pendingRows.length}</strong> produto(s) serão atualizados
            {ignoredCount > 0 ? `, ${ignoredCount} linha(s) sem ID foram ignoradas` : ''}.
          </p>
          <div className="flex gap-3">
            <button onClick={resetImportState} className="px-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-medium text-black dark:text-white">Cancelar</button>
            <button onClick={handleConfirmImport} disabled={isImporting} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {isImporting ? 'Atualizando...' : 'Atualizar produtos'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos. (`xlsx` já vem com seus próprios tipos TypeScript,
não precisa de `@types/xlsx` separado.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductReport.tsx package.json package-lock.json
git commit -m "feat: componente ProductReport (exportar/importar planilha de produtos)"
```

---

### Task 4: Ligar no menu "Administração"

**Files:**
- Modify: `src/store.ts` (novo state `isProductReportModalOpen`)
- Modify: `src/App.tsx` (import do ícone, import do componente, item no dropdown, novo bloco de modal)

**Interfaces:**
- Consumes: componente `ProductReport` (Task 3).
- Produces: `isProductReportModalOpen: boolean` / `setProductReportModalOpen(open: boolean)` na store, seguindo exatamente o mesmo padrão de `isAnnouncementModalOpen`/`setAnnouncementModalOpen`.

- [ ] **Step 1: Novo state na store**

Em `src/store.ts`, na interface (perto de `isAnnouncementModalOpen`,
linha 457-458):
```ts
  isAnnouncementModalOpen: boolean;
  setAnnouncementModalOpen: (open: boolean) => void;
```
vira:
```ts
  isAnnouncementModalOpen: boolean;
  setAnnouncementModalOpen: (open: boolean) => void;
  isProductReportModalOpen: boolean;
  setProductReportModalOpen: (open: boolean) => void;
```

Na implementação (perto de `isAnnouncementModalOpen: false,`, linha 1079-1080):
```ts
      isAnnouncementModalOpen: false,
      setAnnouncementModalOpen: (open) => set({ isAnnouncementModalOpen: open }),
```
vira:
```ts
      isAnnouncementModalOpen: false,
      setAnnouncementModalOpen: (open) => set({ isAnnouncementModalOpen: open }),
      isProductReportModalOpen: false,
      setProductReportModalOpen: (open) => set({ isProductReportModalOpen: open }),
```

- [ ] **Step 2: Imports em `App.tsx`**

O bloco de ícones lucide-react (linhas 22-29) termina em:
```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound
} from 'lucide-react';
```
vira:
```ts
  ChevronDown, ChevronLeft, Info, LayoutDashboard, Star, KeyRound, FileSpreadsheet
} from 'lucide-react';
```

Logo abaixo do import de `ProductManager` (linha 4):
```ts
import ProductManager from './components/ProductManager';
```
adicionar, em qualquer lugar do bloco de imports de componentes admin (ex:
logo depois):
```ts
import ProductReport from './components/ProductReport';
```

- [ ] **Step 3: Desestruturar o novo state**

Perto de `isProductModalOpen, setProductModalOpen,` (linha 42):
```ts
    isProductModalOpen, setProductModalOpen, 
```
vira:
```ts
    isProductModalOpen, setProductModalOpen, 
    isProductReportModalOpen, setProductReportModalOpen,
```

- [ ] **Step 4: Item no dropdown "Administração"**

Logo após o item "Gerenciador de Produtos" (linha 741):
```tsx
                  <DropdownItem icon={<Database className="w-4 h-4" />} label="Gerenciador de Produtos" onClick={() => setProductModalOpen(true)} />
```
adicionar na linha seguinte:
```tsx
                  <DropdownItem icon={<FileSpreadsheet className="w-4 h-4" />} label="Relatório de Produtos" onClick={() => setProductReportModalOpen(true)} />
```

- [ ] **Step 5: Bloco de modal**

Logo após o fechamento do "Product Management Modal" (depois da linha 1117,
`)}` que fecha `{isProductModalOpen && (...)}`, antes do comentário
`{/* User Management Modal */}`), inserir um bloco novo seguindo exatamente
o mesmo layout do modal de produto (linhas 1092-1117), trocando o conteúdo:

```tsx
      {/* Product Report Modal */}
      {isProductReportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 no-print">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg text-white">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">Relatório de Produtos</h3>
                  <p className="text-xs text-black dark:text-white opacity-60">Exportar e atualizar produtos em lote via Excel</p>
                </div>
              </div>
              <button
                onClick={() => setProductReportModalOpen(false)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              <ProductReport />
            </div>
          </div>
        </div>
      )}
```

(`X` já está importado no bloco de ícones existente, linha 25 —
`Search, Database, X, ListPlus, LayoutGrid,` — nenhum import novo além do
`FileSpreadsheet` do Step 2.)

- [ ] **Step 6: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 7: Testar manualmente no navegador**

1. Login como admin → "Administração" → "Relatório de Produtos" → modal
   abre com título e os dois blocos (baixar / subir).
2. Clicar "Baixar planilha (Excel)" → arquivo `.xlsx` baixa, abre no
   Excel/LibreOffice/Google Sheets, colunas certas, dados batendo com o
   catálogo.
3. Editar uma linha (trocar código de barras, manter o ID), subir de volta
   → aparece o resumo "1 produto(s) serão atualizados" → confirmar → toast
   de sucesso → produto atualizado na listagem (conferir na tela de
   "Gerenciador de Produtos"), foto do produto inalterada.
4. Editar duas linhas pro mesmo código de barras, subir → bloqueia,
   mostra as duas linhas em conflito, nada é salvo (conferir contagem de
   produtos antes/depois).
5. Apagar o ID de uma linha, subir → linha ignorada, resumo indica isso,
   resto processa normal.

Expected: os 5 cenários se comportam como descrito, sem erro no console.

- [ ] **Step 8: Commit**

```bash
git add src/store.ts src/App.tsx
git commit -m "feat: liga o Relatorio de Produtos no menu Administracao"
```

---

### Task 5: Verificação final

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte completa de testes**

```bash
npm test
```
Expected: as 4 linhas `PASS: ...` aparecem, exit code 0.

- [ ] **Step 2: Rodar o lint do projeto inteiro**

```bash
npm run lint
```
Expected: sem erros.

- [ ] **Step 3: Repetir o roteiro de teste do spec**

Repetir os 6 cenários da seção "Teste" do spec
(`docs/superpowers/specs/2026-07-26-relatorio-produtos-excel-design.md`) no
navegador, de ponta a ponta, contra um ambiente com Docker completo
(app+postgres+minio) e pelo menos 2-3 produtos cadastrados de antemão pra
gerar uma planilha realista.

- [ ] **Step 4: Não fazer deploy ainda**

Combinar com o usuário antes de subir pra VPS.
