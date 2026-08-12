# Cosmos Bluesoft — indicador de cota diária de consultas

## Contexto

A busca automática de produto por código de barras (`api.ts:154-193`, spec
original não documentada) usa a API da Cosmos Bluesoft, no plano grátis:
**25 consultas por dia**, renovando à meia-noite. Hoje não existe nenhum
jeito de saber quantas já foram usadas — só descobre quando a Cosmos começa
a rejeitar. Esta spec adiciona contagem e dois pontos de exibição.

## Decisões já tomadas (confirmadas com o usuário)

- **Cota**: 25 consultas/dia, reset à meia-noite (horário de Brasília,
  `America/Sao_Paulo` — não UTC, pra não zerar 3h mais cedo/tarde que o
  esperado).
- **O que conta como consulta**: cada chamada que o backend efetivamente
  manda pra Cosmos (`GET https://api.cosmos.bluesoft.com.br/gtins/...`),
  contada depois de receber qualquer resposta dela (200, 404, ou erro
  HTTP) — não quando a chamada falha antes de sair do nosso servidor
  (timeout/abort de rede), já que nesse caso não dá pra saber se a Cosmos
  chegou a processar. Buscas que nem chegam a chamar o backend (bloqueadas
  antes por duplicidade local, em `ProductManager.tsx:121-122`) não contam,
  porque de fato não consultam a Cosmos.
- **Onde aparece**: nos dois lugares — indicador compacto no cadastro de
  produto (`ProductManager.tsx`, perto do campo/botão de busca por código
  de barras) e um card completo no `AdminDashboard.tsx`, mesmo padrão
  visual de `BackupStatus.tsx` (ícone + label + detalhe), mas com uma barra
  de progresso visual (pedido explícito do usuário).
- **Cota esgotada (25/25) não trava a busca** — só fica vermelho/avisando.
  O botão continua clicável; se a Cosmos rejeitar, o erro que já existe
  hoje ("Falha ao buscar produto") aparece normalmente. Evita bloquear por
  engano se a contagem local divergir da cota real da Cosmos.

## Armazenamento e contagem

Reaproveita a tabela `settings` genérica já existente (mesmo padrão de
`backup_status`/`monitoring_thresholds`) — sem tabela nova. Uma linha só:

```
id: 'cosmos_usage_daily'
value: { date: 'YYYY-MM-DD', count: number }
```

O incremento é uma única query UPSERT atômica (evita race condition sem
precisar de transação/lock explícito), rodada dentro do handler de
`GET /api/barcode-lookup/:gtin` em `api.ts`, logo após receber a resposta
da Cosmos:

```sql
INSERT INTO settings (id, value, updated_at)
VALUES ('cosmos_usage_daily', jsonb_build_object('date', $1::text, 'count', 1), NOW())
ON CONFLICT (id) DO UPDATE SET
  value = CASE
    WHEN settings.value->>'date' = $1 THEN jsonb_set(settings.value, '{count}', to_jsonb(((settings.value->>'count')::int) + 1))
    ELSE jsonb_build_object('date', $1::text, 'count', 1)
  END,
  updated_at = NOW()
```

Onde `$1` é a data de hoje em `America/Sao_Paulo` (`YYYY-MM-DD`), calculada
no servidor. Se a data mudou desde a última consulta, o `CASE` já reseta
pra `count: 1` sozinho — não precisa de job/cron separado pra zerar.

## Leitura

Sem endpoint novo: o `GET /api/settings/cosmos_usage_daily` genérico
(`api.ts:339-347`, já sem auth, mesmo usado por `BackupStatus.tsx`) serve
os dois pontos de exibição. O limite (25) é uma constante no frontend, não
precisa ir pro banco — não foi pedido configurável.

## Interface

### Indicador compacto (`ProductManager.tsx`)

Badge pequeno ao lado do botão de busca por código de barras (linha ~532),
texto tipo `"12/25 hoje"`, cor:
- Verde/neutro até 70% da cota (0-17).
- Âmbar de 71-99% (18-24).
- Vermelho em 25/25.

Atualiza ao montar o componente e de novo depois de cada `lookupBarcode`
bem-sucedido (refetch simples do `/api/settings/cosmos_usage_daily`, sem
necessidade de socket/push).

### Card completo (`AdminDashboard.tsx`)

Novo componente `CosmosUsageStatus.tsx`, renderizado ao lado de
`SystemStats`/`BackupStatus` (mesmo bloco, `AdminDashboard.tsx:225-228`).
Mesma estrutura visual do `BackupStatus.tsx` (ícone à esquerda, label +
detalhe à direita) acrescida de uma barra de progresso horizontal abaixo
do texto — largura proporcional a `count/25`, mesma paleta de cor do
indicador compacto (verde/âmbar/vermelho). Atualiza a cada 5 minutos
(`setInterval`), mesmo intervalo já usado em `BackupStatus.tsx`.

## Fora de escopo

- Bloquear a busca quando a cota esgota (decisão do usuário).
- Configurar o limite (25) pela interface — é constante de código.
- Alerta via Telegram/e-mail quando a cota está perto de acabar — não
  pedido; pode entrar depois seguindo o mesmo padrão do
  `TELEGRAM_BOT_TOKEN` já usado em `src/monitoring.ts`, se um dia for
  necessário.
- Contabilizar chamadas ao `/api/barcode-image/:gtin` (proxy de foto) —
  esse endpoint chama a CDN da Cosmos (`cdn-cosmos.bluesoft.com.br`), não
  a API de consulta que tem a cota de 25/dia.
