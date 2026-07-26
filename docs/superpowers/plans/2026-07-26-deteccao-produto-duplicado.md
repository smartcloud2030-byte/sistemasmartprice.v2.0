# Detecção de produto duplicado no cadastro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao cadastrar um produto (individual ou em massa) que já existe na base
(mesmo código de barras ou mesmo nome normalizado), avisar o admin antes de
criar uma duplicata — no cadastro individual, oferecendo editar o produto
existente; no cadastro em massa, bloqueando o envio e listando as linhas
duplicadas.

**Architecture:** Um módulo puro e independente (`src/lib/duplicateProductMatch.ts`)
faz o match, testável isoladamente via `npx tsx` (o projeto não tem framework
de teste). `ProductManager.tsx` (React) consome esse módulo em dois pontos
independentes: `handleSubmit` (cadastro individual) e o handler de envio do
"Cadastrar em massa". A checagem é 100% client-side contra `useStore().products`
(já carrega o catálogo inteiro) — nenhum endpoint novo no backend.

**Tech Stack:** TypeScript, React, `useStore` (zustand), `npx tsx` + `node:assert`
para os testes standalone (mesmo padrão já usado no projeto).

## Global Constraints

- Sem endpoint novo no backend — tudo client-side contra `products` da store.
- Match por código de barras (`barcode` OU `barcode2`, comparação exata, não
  vazio) OU nome normalizado (`trim()` + minúsculas + espaços colapsados),
  igualdade exata — sem fuzzy match.
- Ao editar um produto existente, a checagem exclui o próprio produto da
  comparação (`excludeId`).
- Cadastro individual: se achar duplicata, aborta o submit, mostra modal com
  **foto** + nome + categoria do produto batido, com opções Cancelar / Editar
  produto existente (`openModal(produtoExistente)`).
- Cadastro em massa: se achar qualquer duplicata entre as linhas preenchidas,
  bloqueia o envio inteiro (nenhum produto é criado) e lista as linhas
  duplicadas com **foto** do produto existente batido.
- Não mexe no "Cadastrar em massa" via JSON (`isBulkModalOpen`/
  `handleBulkSubmit`) — não é acionado por nenhum botão na UI atual.
- Não detecta duplicata entre linhas da própria grade do cadastro em massa —
  só contra produtos já existentes na base.

---

### Task 1: Módulo de match (`findDuplicateProduct`)

**Files:**
- Create: `src/lib/duplicateProductMatch.ts`
- Test: `src/lib/duplicateProductMatch.test.ts`
- Modify: `package.json:8` (adiciona o novo teste ao script `"test"`)

**Interfaces:**
- Produces: `normalizeProductName(name: string): string` e
  `findDuplicateProduct(candidate: { name: string; barcode?: string | null; barcode2?: string | null }, products: Product[], excludeId?: string | number): Product | null`,
  usados pelas Tasks 2 e 3.

- [ ] **Step 1: Escrever o teste (vai falhar por o módulo ainda não existir)**

Criar `src/lib/duplicateProductMatch.test.ts`:

```ts
import assert from 'node:assert';
import { findDuplicateProduct } from './duplicateProductMatch';

const existing = [
  { id: 1, name: 'Coca-Cola 350ml', description: '', price: 'R$ 5,00', image: null, category: 'conveniencia', barcode: '7894900011517', barcode2: null },
  { id: 2, name: 'Neosaldina Muscular', description: '', price: 'R$ 20,00', image: null, category: 'medicamento', barcode: '7891142033306', barcode2: '7891142033307' },
] as any;

function matchesByBarcode() {
  const result = findDuplicateProduct({ name: 'Refrigerante qualquer', barcode: '7894900011517' }, existing);
  assert.strictEqual(result?.id, 1, 'deveria achar o produto pelo codigo de barras principal');
}

function matchesByBarcode2() {
  const result = findDuplicateProduct({ name: 'Outro nome', barcode: '', barcode2: '7891142033307' }, existing);
  assert.strictEqual(result?.id, 2, 'deveria achar batendo o barcode novo com o barcode2 do produto existente');
}

function matchesByNormalizedName() {
  const result = findDuplicateProduct({ name: '  coca-cola   350ML  ', barcode: '' }, existing);
  assert.strictEqual(result?.id, 1, 'deveria achar pelo nome ignorando maiusculas/espacos extras');
}

function noMatchForNewProduct() {
  const result = findDuplicateProduct({ name: 'Produto Totalmente Novo', barcode: '0000000000000' }, existing);
  assert.strictEqual(result, null, 'produto sem batida nenhuma nao deveria retornar duplicata');
}

function excludesOwnIdWhenEditing() {
  const result = findDuplicateProduct({ name: 'Coca-Cola 350ml', barcode: '7894900011517' }, existing, 1);
  assert.strictEqual(result, null, 'ao editar o proprio produto (excludeId=1), nao deveria acusar duplicata dele mesmo');
}

function emptyBarcodesDontMatchEachOther() {
  const withEmpty = [{ id: 3, name: 'Produto sem codigo', description: '', price: 'R$ 1,00', image: null, category: 'padrao', barcode: '', barcode2: null }] as any;
  const result = findDuplicateProduct({ name: 'Outro produto sem codigo', barcode: '', barcode2: '' }, withEmpty);
  assert.strictEqual(result, null, 'codigos de barras vazios nao deveriam contar como match entre si');
}

try {
  matchesByBarcode();
  matchesByBarcode2();
  matchesByNormalizedName();
  noMatchForNewProduct();
  excludesOwnIdWhenEditing();
  emptyBarcodesDontMatchEachOther();
  console.log('PASS: todos os testes de duplicateProductMatch passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/duplicateProductMatch.test.ts`
Expected: erro do tipo `Cannot find module './duplicateProductMatch'`.

- [ ] **Step 3: Implementar `findDuplicateProduct`**

Criar `src/lib/duplicateProductMatch.ts`:

```ts
// import type nao gera import em tempo de execucao (so tipo, apagado na
// compilacao) — evita carregar src/store.ts (que usa import.meta.env/zustand)
// quando este modulo roda isolado no teste standalone via tsx.
import type { Product } from '../store';

export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

interface DuplicateCandidate {
  name: string;
  barcode?: string | null;
  barcode2?: string | null;
}

// Acha o primeiro produto ja cadastrado que bate com o candidato, por codigo
// de barras (barcode OU barcode2, comparacao exata e nao vazia) ou por nome
// (normalizado). excludeId evita acusar duplicata do proprio produto ao
// editar (o item sendo editado nao deve se auto-marcar como duplicata).
export function findDuplicateProduct(
  candidate: DuplicateCandidate,
  products: Product[],
  excludeId?: string | number
): Product | null {
  const candidateCodes = [candidate.barcode, candidate.barcode2]
    .filter((c): c is string => !!c && c.trim() !== '');
  const candidateName = normalizeProductName(candidate.name || '');

  for (const product of products) {
    if (excludeId !== undefined && product.id === excludeId) continue;

    const existingCodes = [product.barcode, product.barcode2]
      .filter((c): c is string => !!c && c.trim() !== '');
    const codeMatch = candidateCodes.some(code => existingCodes.includes(code));
    const nameMatch = candidateName !== '' && normalizeProductName(product.name || '') === candidateName;

    if (codeMatch || nameMatch) return product;
  }
  return null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/duplicateProductMatch.test.ts`
Expected: `PASS: todos os testes de duplicateProductMatch passaram`, exit code 0.

- [ ] **Step 5: Adicionar ao script `test` do `package.json`**

Em `package.json`, dentro de `"scripts"`, o valor atual de `"test"` é:
```json
    "test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts",
```
Trocar por:
```json
    "test": "tsx src/backgroundDetect.test.ts && tsx src/duplicateComposite.test.ts && tsx src/lib/duplicateProductMatch.test.ts",
```

- [ ] **Step 6: Rodar a suíte completa e checar tipos**

Run: `npm test`
Expected: as 3 linhas `PASS: ...` aparecem, exit code 0.

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 7: Commit**

```bash
git add src/lib/duplicateProductMatch.ts src/lib/duplicateProductMatch.test.ts package.json
git commit -m "feat: modulo de deteccao de produto duplicado (findDuplicateProduct)"
```

---

### Task 2: Cadastro individual — aviso + editar produto existente

**Files:**
- Modify: `src/components/ProductManager.tsx:2` (import)
- Modify: `src/components/ProductManager.tsx:72` (novo state, junto de `duplicateOption`)
- Modify: `src/components/ProductManager.tsx:258-265` (`handleSubmit`)
- Modify: `src/components/ProductManager.tsx:837` (novo modal, logo após o bloco `showBulkConfirm`)

**Interfaces:**
- Consumes: `findDuplicateProduct(candidate, products, excludeId?): Product | null` (Task 1).
- Produces: nenhuma interface nova consumida por outro código desta feature.

- [ ] **Step 1: Importar `findDuplicateProduct`**

Em `src/components/ProductManager.tsx`, linha 2, o import atual é:
```ts
import { useStore, Product } from '../store';
```
Adicionar logo abaixo (não mexer nessa linha):
```ts
import { findDuplicateProduct } from '../lib/duplicateProductMatch';
```

- [ ] **Step 2: Novo state `duplicateMatch`**

Na linha 72 (junto de `duplicateOption`):
```ts
  const [duplicateOption, setDuplicateOption] = useState(false);
```
vira:
```ts
  const [duplicateOption, setDuplicateOption] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
```

- [ ] **Step 3: Checar duplicata no início do `handleSubmit`**

O início de `handleSubmit` (linhas 258-265) hoje é:
```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) { toast.error('Informe a identificação do produto.'); return; }
    if (!formData.description?.trim()) { toast.error('Informe a descrição do produto.'); return; }
    if (!formData.price?.trim()) { toast.error('Informe o preço do produto.'); return; }
    if (!formData.category) { toast.error('Selecione uma categoria.'); return; }

    let finalImage = formData.image;
```
Substituir por:
```ts
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) { toast.error('Informe a identificação do produto.'); return; }
    if (!formData.description?.trim()) { toast.error('Informe a descrição do produto.'); return; }
    if (!formData.price?.trim()) { toast.error('Informe o preço do produto.'); return; }
    if (!formData.category) { toast.error('Selecione uma categoria.'); return; }

    const match = findDuplicateProduct({ name: formData.name, barcode: formData.barcode, barcode2: formData.barcode2 }, products, editingProduct?.id);
    if (match) { setDuplicateMatch(match); return; }

    let finalImage = formData.image;
```

(A checagem roda tanto em cadastro novo quanto em edição — `editingProduct?.id` é passado como `excludeId`, então ao salvar uma edição sem mudar nome/código o próprio produto nunca bate contra si mesmo, mas se o admin mudar o nome/código pra algo que já pertence a OUTRO produto, o aviso aparece normalmente. `products` já está disponível no escopo do componente via `const { products, fetchProducts } = useStore();`, linha 65.)

- [ ] **Step 4: Modal de confirmação**

Em `src/components/ProductManager.tsx`, logo após o bloco `{showBulkConfirm && ( ... )}` (que termina na linha 837 com `)}`) e antes do `</div>` de fechamento do componente (linha 838), inserir:

```tsx
      {/* Confirmar produto duplicado */}
      {duplicateMatch && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl p-8">
            <div className="flex items-center gap-4 mb-6 text-amber-500">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase">Produto já cadastrado</h3>
            </div>
            <div className="flex items-center gap-4 mb-6 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
              <div className="w-16 h-16 shrink-0 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center">
                {duplicateMatch.image ? (
                  <img src={(duplicateMatch.thumb_image || duplicateMatch.image).startsWith('blob:') ? (duplicateMatch.thumb_image || duplicateMatch.image) : getProxyUrl(duplicateMatch.thumb_image || duplicateMatch.image)} alt={duplicateMatch.name} className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                ) : <Package className="w-6 h-6 text-zinc-300 dark:text-zinc-600" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-black dark:text-white truncate">{duplicateMatch.name}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{duplicateMatch.category}</p>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-8">Deseja editá-lo em vez de cadastrar um novo?</p>
            <div className="flex gap-3">
              <button onClick={() => setDuplicateMatch(null)} className="flex-1 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Cancelar</button>
              <button onClick={() => { const match = duplicateMatch; setDuplicateMatch(null); if (match) openModal(match); }} className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs">Editar produto existente</button>
            </div>
          </div>
        </div>
      )}
```

(`getProxyUrl`, `Package` e `AlertTriangle` já estão importados no topo do arquivo — nenhum import novo necessário além do Step 1. `openModal` já existe, linha 371.)

- [ ] **Step 5: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Testar manualmente no navegador**

Run: `npm run dev` (com Docker/MinIO/Postgres locais no ar, como nas features anteriores — ou testar direto contra um ambiente com banco populado).

1. Abrir "Novo produto", preencher um nome IGUAL (variando maiúsculas/espaços) ao de um produto já existente → ao clicar "Cadastrar produto", aparece o modal com a foto do produto batido.
2. Clicar "Cancelar" → modal fecha, formulário continua aberto e preenchido, nada foi salvo.
3. Clicar "Editar produto existente" → formulário é preenchido com os dados do produto existente, título vira "Editar produto", próximo submit atualiza (não cria um novo).
4. Editar um produto já existente (via botão "Editar" da listagem) sem mudar nome/código, salvar → NÃO deve aparecer o aviso.
5. Editar um produto existente e trocar o nome/código pra um que já pertence a OUTRO produto → deve aparecer o aviso normalmente.
6. Cadastrar um produto realmente novo → segue normal, sem aviso.

Expected: os 6 cenários se comportam como descrito, sem erro no console.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: aviso de produto duplicado no cadastro individual"
```

---

### Task 3: Cadastro em massa — bloqueio + lista de duplicatas

**Files:**
- Modify: `src/components/ProductManager.tsx:72` (novo state, junto dos states da Task 2)
- Modify: `src/components/ProductManager.tsx:766-770` (handler de envio do "Cadastrar em massa")
- Modify: `src/components/ProductManager.tsx` (novo modal, logo após o modal da Task 2)

**Interfaces:**
- Consumes: `findDuplicateProduct(candidate, products, excludeId?): Product | null` (Task 1).

- [ ] **Step 1: Novo state `bulkDuplicates`**

Junto do state adicionado na Task 2 (linha 72-73):
```ts
  const [duplicateOption, setDuplicateOption] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
```
vira:
```ts
  const [duplicateOption, setDuplicateOption] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<Product | null>(null);
  const [bulkDuplicates, setBulkDuplicates] = useState<{ rowName: string; match: Product }[]>([]);
```

- [ ] **Step 2: Checar duplicatas antes do envio em massa**

No handler de envio do "Cadastrar em massa" (dentro do `onClick` do botão "Cadastrar N Produtos"), o trecho atual é:
```ts
                const valid = rows.filter(p => p.name.trim());
                if (!valid.length) { toast.error('Preencha ao menos um produto.'); return; }
                setIsLoading(true);
                try {
                  await apiCall('POST', '/products/bulk', valid.map(p => ({ name: p.name, description: p.description, price: p.price || 'R$ 0,00', image: p.image || null, thumb_image: p.thumb_image || null, category: p.category, barcode: p.barcode || null, barcode2: p.barcode2 || null })));
```
Substituir por:
```ts
                const valid = rows.filter(p => p.name.trim());
                if (!valid.length) { toast.error('Preencha ao menos um produto.'); return; }

                const duplicates: { rowName: string; match: Product }[] = [];
                for (const row of valid) {
                  const match = findDuplicateProduct({ name: row.name, barcode: row.barcode, barcode2: row.barcode2 }, products);
                  if (match) duplicates.push({ rowName: row.name, match });
                }
                if (duplicates.length > 0) { setBulkDuplicates(duplicates); return; }

                setIsLoading(true);
                try {
                  await apiCall('POST', '/products/bulk', valid.map(p => ({ name: p.name, description: p.description, price: p.price || 'R$ 0,00', image: p.image || null, thumb_image: p.thumb_image || null, category: p.category, barcode: p.barcode || null, barcode2: p.barcode2 || null })));
```

(Se achar qualquer duplicata, `return` interrompe antes de `setIsLoading(true)` e antes do `apiCall` — nenhum produto é criado, nem os que não eram duplicata.)

- [ ] **Step 3: Modal de lista de duplicatas**

Logo após o modal criado na Task 2 (`{duplicateMatch && ( ... )}`), inserir:

```tsx
      {/* Duplicatas no cadastro em massa */}
      {bulkDuplicates.length > 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[85vh] flex flex-col">
            <div className="flex items-center gap-4 mb-6 text-amber-500 shrink-0">
              <AlertTriangle className="w-8 h-8" />
              <h3 className="text-xl font-black uppercase">Produtos já cadastrados</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-4 shrink-0">
              {bulkDuplicates.length} {bulkDuplicates.length === 1 ? 'linha bate' : 'linhas batem'} com produtos já existentes. Ajuste ou remova essas linhas antes de cadastrar.
            </p>
            <div className="space-y-2 overflow-y-auto mb-6">
              {bulkDuplicates.map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
                  <div className="w-12 h-12 shrink-0 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden flex items-center justify-center">
                    {d.match.image ? (
                      <img src={(d.match.thumb_image || d.match.image).startsWith('blob:') ? (d.match.thumb_image || d.match.image) : getProxyUrl(d.match.thumb_image || d.match.image)} alt={d.match.name} className="w-full h-full object-cover" crossOrigin="anonymous" referrerPolicy="no-referrer" />
                    ) : <Package className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />}
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-black dark:text-white truncate">{d.rowName}</p>
                    <p className="text-zinc-500 dark:text-zinc-400 truncate">já existe como "{d.match.name}"</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setBulkDuplicates([])} className="shrink-0 px-6 py-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl font-black uppercase text-xs text-black dark:text-white">Fechar</button>
          </div>
        </div>
      )}
```

(`isMultiRegisterModalOpen` usa `z-[100]`; este modal usa `z-[110]` pra ficar sempre acima dele.)

- [ ] **Step 4: Checar tipos**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 5: Testar manualmente no navegador**

1. Abrir "Cadastrar em massa", preencher uma ou mais linhas com nome/código de barras batendo em produtos já existentes, mais uma linha de produto realmente novo → clicar "Cadastrar N Produtos" → aparece a lista de duplicatas (com foto), nenhum produto é criado (conferir contagem antes/depois).
2. Fechar o aviso, corrigir/remover as linhas duplicadas, tentar de novo com só produtos novos → cadastra normalmente.

Expected: os 2 cenários se comportam como descrito, sem erro no console.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: bloqueio e lista de duplicatas no cadastro em massa"
```

---

### Task 4: Verificação final

**Files:** nenhum arquivo novo — só verificação manual.

- [ ] **Step 1: Rodar a suíte completa de testes**

```bash
npm test
```
Expected: as 3 linhas `PASS: ...` aparecem (backgroundDetect, duplicateComposite, duplicateProductMatch), exit code 0.

- [ ] **Step 2: Rodar o lint do projeto inteiro**

```bash
npm run lint
```
Expected: sem erros.

- [ ] **Step 3: Repetir o roteiro de teste do spec**

Repetir os 6 cenários da seção "Teste" do spec
(`docs/superpowers/specs/2026-07-26-deteccao-produto-duplicado-design.md`) no
navegador, de ponta a ponta.

- [ ] **Step 4: Não fazer deploy ainda**

Não subir pra VPS nesta task — combinar com o usuário antes, seguindo a
preferência já registrada de só dar push/deploy quando pedido explicitamente.
