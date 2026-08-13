# Auditoria — quem cadastrou cada produto

## Contexto

O catálogo de produtos (`products`) é compartilhado entre todas as lojas com
acesso liberado ao cadastro (`hasProductManagementAccess`, em
`src/store.ts`) mais o admin — não há hoje nenhum registro de qual loja ou
pessoa cadastrou cada produto. O pedido do usuário é ter esse controle,
mostrado como uma lista logo abaixo do card de cota da Cosmos no
AdminDashboard (`CosmosUsageStatus.tsx`, spec
`2026-08-11-cosmos-cota-diaria-design.md`).

## Decisões já tomadas (confirmadas com o usuário)

- **Escopo do evento**: só **criação** conta como "cadastro" — editar um
  produto existente (`PUT /products/:id`) não altera quem aparece como
  autor original.
- **Abrangência**: vale pra todo produto criado, não só os que passaram
  pela busca por código de barras da Cosmos.
- **Identidade**: usa o `currentUser` que já existe no login
  (`src/store.ts:536` — `{ username, cnpj, bandeira }`), tanto de loja
  quanto de admin (que loga com `cnpj: 'Administrativo'`,
  `bandeira: 'Master'`, ver `Login.tsx:67-71`). Sem sistema de autenticação
  novo — é o mesmo identificador que já aparece em `lastUsername` nas
  lojas.
- **Janela de tempo**: só hoje (horário de Brasília), mesmo corte do card
  da Cosmos logo acima — reseta sozinho a cada dia, sem histórico
  navegável.
- **Sem alteração no `ProductManager.tsx`** (lista/detalhe de produtos) —
  o pedido é só o card agregado no AdminDashboard.

## Modelo de dados

Três colunas novas em `products` (nullable — produtos já existentes ficam
sem essa informação, o que é aceitável já que o card só olha "hoje"):

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_username TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_cnpj VARCHAR(14);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_bandeira TEXT;
```

Preenchidas em `POST /products` (`api.ts:250`) e `POST /products/bulk`
(`api.ts:267`) — os dois pontos onde uma linha nova entra em `products`.
`PUT /products/:id` (edição) permanece sem tocar essas colunas.

## Endpoint novo

| Rota | Quem chama | Auth |
|---|---|---|
| `GET /api/products/created-today` | Card novo no AdminDashboard | `x-api-token` (mesmo `apiAuth` já usado nas outras rotas de leitura administrativa) |

Agrega por `(created_by_username, created_by_cnpj, created_by_bandeira)`,
filtrando por "hoje" em `America/Sao_Paulo` (mesma lógica de fuso do
`getBrazilDateString` em `src/lib/cosmosUsage.ts`, adaptada pra SQL):

```sql
SELECT created_by_username, created_by_cnpj, created_by_bandeira, COUNT(*) AS count
FROM products
WHERE created_by_username IS NOT NULL
  AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
GROUP BY created_by_username, created_by_cnpj, created_by_bandeira
ORDER BY count DESC
```

Resposta: `{ entries: [{ username, cnpj, bandeira, count }, ...] }`.

## Frontend

- `ProductManager.tsx`: ao montar `dataToSave` em `saveProduct()`
  (linha 318) e o payload de `executeBulkInsert` (linha 363), inclui
  `createdByUsername`, `createdByCnpj`, `createdByBandeira` a partir de
  `currentUser` (novo campo desestruturado de `useStore()`, linha 77).
  Só preenchido na criação — no ramo de edição (`editingProduct?.id`
  truthy) o payload não precisa desses campos, já que o backend os ignora
  em `PUT`.
- Novo componente `src/components/ProductsCreatedTodayStatus.tsx`, mesmo
  padrão visual de `CosmosUsageStatus.tsx`/`BackupStatus.tsx` (ícone +
  título + lista), listando uma linha por autor:
  `{username} ({bandeira}) — {count} produto(s)`. Estado vazio: "Nenhum
  cadastro hoje ainda." Atualiza a cada 5 minutos, mesmo intervalo dos
  outros cards de status.
- `AdminDashboard.tsx`: importa e renderiza logo abaixo do bloco do
  `CosmosUsageStatus` (`AdminDashboard.tsx:236-239` após a mudança da
  spec anterior), mesmo padrão de `motion.div` com `entrance(...)`.

## Fora de escopo

- Editar produto não gera/atualiza autoria.
- Sem tela de histórico por data — só "hoje".
- Sem exibição por produto individual (lista/detalhe do `ProductManager`).
- Sem backfill de produtos já existentes — ficam com as colunas novas em
  `NULL`.
