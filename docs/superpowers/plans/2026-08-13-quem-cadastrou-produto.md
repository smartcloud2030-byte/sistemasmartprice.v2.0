# Quem Cadastrou Produto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar quem (usuário/CNPJ/bandeira) criou cada produto no catálogo compartilhado, e mostrar um card "Cadastros hoje" no AdminDashboard, logo abaixo do card de cota da Cosmos.

**Architecture:** Três colunas novas em `products`, preenchidas nos dois pontos de criação (`POST /products` e `POST /products/bulk`) a partir do `currentUser` já existente no login (loja ou admin). Um endpoint novo agrega por autor filtrando por "hoje" em horário de Brasília. Um componente novo no frontend, mesmo padrão visual de `CosmosUsageStatus.tsx`, exibe essa lista.

**Tech Stack:** Express + `pg` no backend (schema idempotente via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, mesmo padrão de `ensureChatSchema`/`ensureMonitoringSchema` em `server.ts`), React + Tailwind no frontend.

## Global Constraints

- Só **criação** conta como cadastro — `PUT /products/:id` (edição) não grava/altera autoria.
- Vale pra todo produto criado, não só os que passaram pela busca por código de barras da Cosmos.
- Identidade vem do `currentUser` já existente (`src/store.ts:536` — `{ username, cnpj, bandeira }`), sem sistema de auth novo.
- Card mostra só "hoje" (horário de Brasília), reseta sozinho — sem histórico navegável por data.
- Sem alteração no `ProductManager.tsx` além de mandar os campos de autoria ao salvar — sem exibição por produto individual.
- Sem backfill de produtos já existentes (ficam com as colunas novas em `NULL`).

---

### Task 1: Schema, captura de autoria e endpoint de leitura (backend)

**Files:**
- Modify: `api.ts:14-22` (adicionar `ensureProductsSchema` perto do `pool`)
- Modify: `api.ts:250-264` (`POST /products`)
- Modify: `api.ts:267-295` (`POST /products/bulk`)
- Modify: `api.ts` (novo endpoint `GET /products/created-today`, perto das outras rotas de `/products`)
- Modify: `server.ts:11` (import de `ensureProductsSchema`)
- Modify: `server.ts:129-131` (chamar `ensureProductsSchema`)

**Interfaces:**
- Produces: `ensureProductsSchema(): Promise<void>` exportado de `api.ts`; colunas `products.created_by_username`, `products.created_by_cnpj`, `products.created_by_bandeira`; endpoint `GET /api/products/created-today` → `{ entries: { username: string; cnpj: string; bandeira: string; count: number }[] }`.
- Consumes: `pool` já existente em `api.ts`.

Não há suíte de testes de rota HTTP neste projeto (mesma situação já documentada nas specs anteriores — `api.ts`/`monitoring.ts` não têm testes automatizados). Verificação desta task é manual, via `curl`/`psql`.

- [ ] **Step 1: Adicionar `ensureProductsSchema` em `api.ts`**

Logo após a declaração de `pool` e o `export { pool };` (`api.ts:14-22`), adicionar:

```ts
// Colunas de autoria de products — idempotente, mesmo padrao de
// ensureChatSchema/ensureMonitoringSchema em server.ts. Nullable: produtos
// ja existentes ficam sem essa informacao (aceitavel, o card so olha "hoje").
export async function ensureProductsSchema() {
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_username TEXT;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_cnpj VARCHAR(14);`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_bandeira TEXT;`);
}
```

- [ ] **Step 2: Capturar autoria em `POST /products`**

Em `api.ts:250-264`, o handler atual é:

```ts
router.post('/products', apiAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, price, image, thumb_image, category, subtitle, barcode, barcode2 } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const result = await pool.query(
      `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [name, description || '', subtitle || '', price || 'R$ 0,00', image || null, thumb_image || null, category || '', barcode || null, barcode2 || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

Trocar por:

```ts
router.post('/products', apiAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, price, image, thumb_image, category, subtitle, barcode, barcode2, createdByUsername, createdByCnpj, createdByBandeira } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const result = await pool.query(
      `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_by_username, created_by_cnpj, created_by_bandeira, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
      [name, description || '', subtitle || '', price || 'R$ 0,00', image || null, thumb_image || null, category || '', barcode || null, barcode2 || null, createdByUsername || null, createdByCnpj || null, createdByBandeira || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Capturar autoria em `POST /products/bulk`**

Em `api.ts:267-295`, o handler atual é:

```ts
router.post('/products/bulk', apiAuth, async (req: Request, res: Response) => {
  try {
    const products = req.body;
    if (!Array.isArray(products)) return res.status(400).json({ error: 'Formato inválido' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = [];
      for (const p of products) {
        const result = await client.query(
          `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
          [p.name || 'Sem nome', p.description || '', p.subtitle || '', p.price || 'R$ 0,00', p.image || null, p.thumb_image || null, p.category || '', p.barcode || null, p.barcode2 || null]
        );
        inserted.push(result.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ data: inserted, count: inserted.length });
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

Trocar o `INSERT` de dentro do `for` por (o resto do handler — `BEGIN`/`COMMIT`/`ROLLBACK`/try-catch-finally — fica igual):

```ts
        const result = await client.query(
          `INSERT INTO products (name, description, subtitle, price, image, thumb_image, category, barcode, barcode2, created_by_username, created_by_cnpj, created_by_bandeira, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
          [p.name || 'Sem nome', p.description || '', p.subtitle || '', p.price || 'R$ 0,00', p.image || null, p.thumb_image || null, p.category || '', p.barcode || null, p.barcode2 || null, p.createdByUsername || null, p.createdByCnpj || null, p.createdByBandeira || null]
        );
```

- [ ] **Step 4: Endpoint de leitura**

Adicionar em `api.ts`, logo após o handler de `POST /products/bulk` (depois do `});` que fecha a Step 3, antes do comentário `// Atualizar varios produtos de uma vez...`):

```ts
// Autoria de cadastro — agregado por pessoa, só "hoje" em horário de
// Brasília. Mesma lógica de fuso do getBrazilDateString em
// src/lib/cosmosUsage.ts, adaptada pra SQL (date_trunc na timezone).
router.get('/products/created-today', apiAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT created_by_username AS username, created_by_cnpj AS cnpj, created_by_bandeira AS bandeira, COUNT(*)::int AS count
      FROM products
      WHERE created_by_username IS NOT NULL
        AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
      GROUP BY created_by_username, created_by_cnpj, created_by_bandeira
      ORDER BY count DESC
    `);
    res.json({ entries: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Ligar o schema novo no `server.ts`**

Em `server.ts:11`, trocar:

```ts
import apiRouter, { pool, setSocketServer } from './api';
```

por:

```ts
import apiRouter, { pool, setSocketServer, ensureProductsSchema } from './api';
```

Em `server.ts:129-131`, logo após a linha do `ensureMonitoringSchema`, adicionar:

```ts
  await ensureProductsSchema().catch(err => console.error('Erro ao preparar schema de autoria de produtos:', err));
```

(O trecho fica com as 4 chamadas `ensureXSchema` em sequência, mesmo padrão das 3 já existentes.)

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 7: Verificação manual end-to-end**

Precisa do Postgres local rodando e das variáveis de ambiente do `.env`. Se não houver Postgres disponível neste ambiente, reporte como limitação (status DONE_WITH_CONCERNS) em vez de pular silenciosamente — não bloqueia a conclusão da task.

```bash
npm run dev
# em outro terminal, com o servidor no ar:
curl -X POST -H "x-api-token: $API_SECRET" -H "Content-Type: application/json" \
  -d '{"name":"Produto Teste","description":"desc","price":"R$ 10,00","category":"padrao","createdByUsername":"joao","createdByCnpj":"12345678000199","createdByBandeira":"Loja Teste"}' \
  http://localhost:3000/api/products
curl -H "x-api-token: $API_SECRET" http://localhost:3000/api/products/created-today
```

Expected: a segunda chamada retorna `{"entries":[{"username":"joao","cnpj":"12345678000199","bandeira":"Loja Teste","count":1}]}`.

- [ ] **Step 8: Commit**

```bash
git add api.ts server.ts
git commit -m "feat: registra e expoe quem cadastrou cada produto"
```

---

### Task 2: Enviar autoria ao salvar produto (`ProductManager.tsx`)

**Files:**
- Modify: `src/components/ProductManager.tsx:77` (destructure de `useStore`)
- Modify: `src/components/ProductManager.tsx:318` (`dataToSave` em `saveProduct`)
- Modify: `src/components/ProductManager.tsx:363` (payload de `executeBulkInsert`)

**Interfaces:**
- Consumes: `currentUser: { username: string; cnpj: string; bandeira: string } | null` de `useStore()` (já existe em `src/store.ts:536`, só não estava sendo lido neste arquivo).

- [ ] **Step 1: Ler `currentUser` do store**

Em `src/components/ProductManager.tsx:77`, trocar:

```ts
  const { products, fetchProducts } = useStore();
```

por:

```ts
  const { products, fetchProducts, currentUser } = useStore();
```

- [ ] **Step 2: Incluir autoria só na criação (não na edição)**

Em `src/components/ProductManager.tsx:318`, o `saveProduct` monta:

```ts
    const dataToSave = { ...formData, image: finalImage?.startsWith('blob:') ? null : finalImage, thumb_image: finalThumb?.startsWith('blob:') ? null : finalThumb };
```

Trocar por (adiciona os 3 campos de autoria só quando `editingProduct` não existe — ou seja, é uma criação nova; em edição o backend ignora esses campos mesmo, mas evita mandar dado sem sentido):

```ts
    const dataToSave = {
      ...formData,
      image: finalImage?.startsWith('blob:') ? null : finalImage,
      thumb_image: finalThumb?.startsWith('blob:') ? null : finalThumb,
      ...(editingProduct?.id ? {} : {
        createdByUsername: currentUser?.username || null,
        createdByCnpj: currentUser?.cnpj || null,
        createdByBandeira: currentUser?.bandeira || null,
      }),
    };
```

- [ ] **Step 3: Incluir autoria no import em massa**

Em `src/components/ProductManager.tsx:363`, `executeBulkInsert` hoje manda:

```ts
      await apiCall('POST', '/products/bulk', data.map(p => ({ name: p.name || 'Sem nome', description: p.description || '', price: p.price || 'R$ 0,00', image: p.image || null, category: p.category || '' })));
```

Trocar por:

```ts
      await apiCall('POST', '/products/bulk', data.map(p => ({
        name: p.name || 'Sem nome',
        description: p.description || '',
        price: p.price || 'R$ 0,00',
        image: p.image || null,
        category: p.category || '',
        createdByUsername: currentUser?.username || null,
        createdByCnpj: currentUser?.cnpj || null,
        createdByBandeira: currentUser?.bandeira || null,
      })));
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual**

```bash
npm run dev
```

Cadastrar um produto novo logado como loja ou admin, confirmar (via `curl .../api/products/created-today` ou olhando a linha inserida no banco) que os 3 campos de autoria vieram preenchidos com o usuário logado. Editar um produto existente e confirmar que isso não altera as colunas de autoria dele. Se não houver Postgres disponível neste ambiente pra rodar de ponta a ponta, reporte como limitação (status DONE_WITH_CONCERNS).

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductManager.tsx
git commit -m "feat: envia autoria do usuario logado ao cadastrar produto"
```

---

### Task 3: Card "Cadastros hoje" no AdminDashboard

**Files:**
- Create: `src/components/ProductsCreatedTodayStatus.tsx`
- Modify: `src/components/AdminDashboard.tsx:12` (import)
- Modify: `src/components/AdminDashboard.tsx:236-239` (render)

**Interfaces:**
- Consumes: endpoint `GET /api/products/created-today` (Task 1) → `{ entries: { username, cnpj, bandeira, count }[] }`; `cn` de `../lib/utils` (já usado no arquivo de referência `CosmosUsageStatus.tsx`).

- [ ] **Step 1: Criar o componente**

Criar `src/components/ProductsCreatedTodayStatus.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

interface CreatedTodayEntry {
  username: string;
  cnpj: string;
  bandeira: string;
  count: number;
}

const ProductsCreatedTodayStatus: React.FC = () => {
  const [entries, setEntries] = useState<CreatedTodayEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const res = await fetch('/api/products/created-today', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setEntries(json?.entries || []);
      } catch (e) {
        console.error('Erro ao carregar cadastros de hoje:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchEntries();
    const interval = setInterval(fetchEntries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-zinc-400" />
        <p className="text-xs font-black uppercase tracking-widest text-zinc-400">Cadastros de produto hoje</p>
      </div>
      {isLoading ? (
        <p className="text-sm text-zinc-400">Carregando...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-400">Nenhum cadastro hoje ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={`${e.username}-${e.cnpj}`} className={cn('flex items-center justify-between text-sm')}>
              <span className="text-black dark:text-white font-medium">{e.username} <span className="text-zinc-400 font-normal">({e.bandeira})</span></span>
              <span className="text-zinc-400 font-bold">{e.count} produto{e.count === 1 ? '' : 's'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductsCreatedTodayStatus;
```

- [ ] **Step 2: Importar no AdminDashboard**

Em `src/components/AdminDashboard.tsx:12`, logo após `import CosmosUsageStatus from './CosmosUsageStatus';`, adicionar:

```ts
import ProductsCreatedTodayStatus from './ProductsCreatedTodayStatus';
```

- [ ] **Step 3: Renderizar abaixo do card da Cosmos**

Em `src/components/AdminDashboard.tsx:236-239`, o bloco atual é:

```tsx
        {/* Cota diaria da Cosmos (busca por codigo de barras) */}
        <motion.div {...entrance(0.37, shouldReduceMotion)}>
          <CosmosUsageStatus />
        </motion.div>
```

Trocar por:

```tsx
        {/* Cota diaria da Cosmos (busca por codigo de barras) */}
        <motion.div {...entrance(0.37, shouldReduceMotion)}>
          <CosmosUsageStatus />
        </motion.div>

        {/* Quem cadastrou produto hoje */}
        <motion.div {...entrance(0.4, shouldReduceMotion)}>
          <ProductsCreatedTodayStatus />
        </motion.div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Verificação manual**

```bash
npm run dev
```

Abrir o AdminDashboard logado como admin, confirmar que o card "Cadastros de produto hoje" aparece logo abaixo do card da Cosmos, com a mesma lista de nomes/lojas vista na Task 1/2 (ou "Nenhum cadastro hoje ainda." se nada foi cadastrado). Se não houver Postgres disponível neste ambiente, reporte como limitação (status DONE_WITH_CONCERNS).

- [ ] **Step 6: Commit**

```bash
git add src/components/ProductsCreatedTodayStatus.tsx src/components/AdminDashboard.tsx
git commit -m "feat: adiciona card de cadastros de produto do dia no AdminDashboard"
```
