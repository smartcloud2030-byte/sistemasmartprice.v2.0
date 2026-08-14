# Cosmos — quem faz mais consultas de código de barras

## Contexto

O card `CosmosUsageStatus.tsx` no `AdminDashboard` (spec
`2026-08-11-cosmos-cota-diaria-design.md`) mostra só um contador agregado
do dia (`settings.cosmos_usage_daily = { date, count }`) — dá pra saber
quantas das 25 consultas diárias já foram usadas, mas não quem fez cada
uma. O registro acontece em `registerCosmosUsage()` (`api.ts:166-179`), um
upsert que só incrementa `count`, sem guardar identidade nenhuma. Do lado
do front, `ProductManager.tsx:152` chama `GET /api/barcode-lookup/:gtin`
só com o header `x-api-token` — o usuário logado nunca é enviado. O pedido
é acrescentar "quem mais consultou hoje" ao mesmo card.

## Decisões já tomadas (confirmadas com o usuário)

- **Identidade**: mesmo `currentUser` do login já usado no spec de
  auditoria de cadastro de produto (`2026-08-13-quem-cadastrou-produto-design.md`)
  — `{ username, cnpj, bandeira }`, de `src/store.ts:536`. Sem
  autenticação nova.
- **O que conta como consulta**: a mesma regra já usada pro contador
  global (`2026-08-11-cosmos-cota-diaria-design.md`) — cada chamada que o
  backend efetivamente manda pra Cosmos e recebe resposta (200, 404 ou
  erro HTTP dela). Timeout/abort de rede e buscas bloqueadas antes por
  duplicidade local (`ProductManager.tsx:121-122`) não contam, porque não
  chegam a consumir a cota.
- **Armazenamento**: estende o mesmo registro `settings.cosmos_usage_daily`
  já existente, em vez de criar tabela nova — o volume é baixo (máximo 25
  consultas/dia) e o padrão já usado nesse card é reaproveitar `settings`.
- **Janela de tempo**: só hoje (horário de Brasília), mesmo corte e mesmo
  reset automático do contador global — sem histórico navegável.
- **Onde aparece**: dentro do próprio `CosmosUsageStatus.tsx`, uma
  listinha "quem mais consultou hoje" abaixo da barra de progresso que já
  existe — sem componente novo.

## Modelo de dados

`settings.cosmos_usage_daily.value` ganha uma chave nova `byUser`, mapa
indexado por `cnpj:username` (evita colidir operadores com o mesmo nome em
lojas diferentes):

```json
{
  "date": "2026-08-13",
  "count": 7,
  "byUser": {
    "12345678000190:maria": { "username": "maria", "cnpj": "12345678000190", "bandeira": "Ultra Popular", "count": 5 },
    "Administrativo:admin": { "username": "admin", "cnpj": "Administrativo", "bandeira": "Master", "count": 2 }
  }
}
```

Quando a data muda, o `CASE` que já reseta `count` pra 1 passa a resetar
`byUser` também (substitui o objeto inteiro, mesmo comportamento do
reset diário atual).

## Alterações necessárias

### Backend (`api.ts`)

- `GET /barcode-lookup/:gtin` passa a ler `username`, `cnpj`, `bandeira`
  de query string (`req.query`) — parâmetros opcionais; se ausentes (ex.:
  chamada antiga/externa), a consulta ainda conta pro `count` global, só
  não entra em `byUser`.
- `registerCosmosUsage()` ganha um parâmetro opcional `user?: { username,
  cnpj, bandeira }` e faz upsert também na chave `byUser[cnpj:username]`,
  incrementando o `count` daquele usuário — mesmo princípio de upsert
  atômico numa query só, sem lock explícito.

### Frontend (`ProductManager.tsx`)

- A chamada em `ProductManager.tsx:152` passa a mandar `currentUser` (já
  disponível via `useStore()`, mesmo padrão do spec de quem-cadastrou) como
  query string: `/api/barcode-lookup/${code}?username=...&cnpj=...&bandeira=...`
  (URL-encoded).

### `CosmosUsageStatus.tsx`

- Além do `count`/barra de progresso já existentes, lê `data.byUser`,
  ordena por `count` decrescente e renderiza uma lista abaixo da barra:
  `{username} ({bandeira}) — {count} consulta(s)`. Estado vazio (sem
  `byUser` ou objeto vazio): não mostra a lista, só o contador de sempre
  (mantém compatível com o formato antigo do dia anterior ao deploy).

## Fora de escopo

- Histórico por data — só "hoje", mesmo corte do contador principal.
- Bloquear consulta por usuário quando ele consome muito da cota sozinho.
- Mudar o que conta como consulta (regra já definida no spec de
  2026-08-11, reaproveitada aqui sem alteração).
- Aplicar o mesmo rastreio em `/api/barcode-image/:gtin` (proxy de foto)
  — esse endpoint não consome a cota de 25/dia, mesma exclusão do spec
  original.
