# Monitoramento em tempo real — Servidor e Máquinas das lojas

## Contexto

O `SmartHelpDashboard.tsx` já tem 4 cards previstos para infraestrutura das
lojas — **Servidor**, **Máquinas**, **Impressoras**, **Provedor** — mas hoje
todos os 4 estão marcados "Em construção" (linhas 239-250 do arquivo). O
pedido do usuário é justamente preencher esse vazio: acompanhamento em tempo
real de CPU/memória/disco de 10 lojas, cada uma com ~12 máquinas + 1
servidor, mais os 2 links de internet e as impressoras de cada loja.

Dado o tamanho, o trabalho foi dividido em 3 sub-projetos independentes,
cada um com sua própria spec/plano:

1. **Servidor + Máquinas** (esta spec) — CPU/RAM/disco em tempo real, com
   histórico e alertas.
2. **Provedor** (spec futura) — integração com a API do GWN.Cloud
   (controladora Grandstream que já administra os roteadores das lojas),
   sem precisar de agente próprio.
3. **Impressoras** (spec futura) — monitoramento via SNMP.

Esta spec cobre só o item 1 — a peça central do pedido original.

## Decisões já tomadas (confirmadas com o usuário)

- **100% dentro do SmartPrice** — sem Zabbix/Grafana/Netdata por baixo. O
  motor de coleta, armazenamento e alerta é construído sob medida, seguindo
  os padrões que o projeto já usa (tabelas simples no Postgres via `pg`,
  sem ORM; endpoints REST próprios; nada de infraestrutura nova pra manter
  no ar).
- **Agente = script PowerShell + Agendador de Tarefas do Windows.** Sem
  binário compilado, sem runtime extra pra instalar — todo Windows já tem
  PowerShell. Atualizar o agente é só substituir o `.ps1`.
- **Identificação por arquivo de configuração**, não por hostname/IP —
  cada máquina tem um `smartprice-monitor.json` local definido na instalação
  (CNPJ da loja, nome da máquina, tipo).
- **Um token de monitoramento por loja** (10 tokens, não um único
  compartilhado) — cada loja tem seu próprio segredo, revogável
  individualmente sem afetar as outras 9.
- **Alertas por transição de estado** (OK→alerta, OK→offline, e o aviso de
  volta ao normal), não repetição contínua enquanto o problema persiste.
- **Dois canais de alerta**: banner no AdminDashboard (mesmo padrão do
  `TefAlertBanner` já existente) + Telegram (um bot único, centralizado,
  não um por loja). WhatsApp e e-mail ficam fora de escopo por agora — dá
  pra adicionar depois sem redesenhar nada.
- **Retenção em duas camadas**: dado bruto (amostra a cada minuto) por 48h,
  resumido em médias horárias por 90 dias depois disso. Sem retenção
  ilimitada de dado bruto.
- **Sem biblioteca de gráficos nova** — histórico é um gráfico de linha
  simples (24h/7 dias), implementado com o mínimo necessário.
- **Rollout gradual, não big-bang**: testar com poucas máquinas primeiro,
  acompanhando pelo `SystemStats.tsx` (que já existe, mostra CPU/RAM/disco
  do próprio servidor da VPS) que a carga nova não afeta o sistema em
  produção, antes de instalar nas ~130 máquinas restantes.

## Carga esperada (validação do "não vai sobrecarregar")

- 10 lojas × 13 pontos (12 máquinas + 1 servidor) = 130 agentes.
- Intervalo de 1 minuto (granularidade padrão do Agendador de Tarefas do
  Windows) → **~2,2 requisições/segundo** sustentadas, no pico teórico com
  todas as 130 máquinas ativas ao mesmo tempo.
- Cada requisição grava numa tabela própria (`machine_metrics_samples`),
  sem contenção com as tabelas `products`/`settings` que sustentam a
  precificação.
- Retenção em camadas (ver acima) evita crescimento ilimitado do banco.

## Modelo de dados

Reaproveita o campo `allowedStores` que já existe em `settings.users_and_flags`
(`src/store.ts`) — cada loja ganha um campo novo opcional:

```typescript
// Adição ao tipo allowedStores existente em src/store.ts
monitoringToken?: string; // token de monitoramento desta loja
```

Duas tabelas novas no Postgres:

```sql
CREATE TABLE monitored_machines (
  id SERIAL PRIMARY KEY,
  store_cnpj VARCHAR(14) NOT NULL,
  machine_name TEXT NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'workstation' | 'server'
  last_cpu_percent NUMERIC,
  last_mem_percent NUMERIC,
  last_disk_percent NUMERIC,
  last_seen_at TIMESTAMPTZ,
  alert_state VARCHAR(20) NOT NULL DEFAULT 'ok', -- 'ok' | 'disk_alert' | 'mem_alert' | 'offline'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_cnpj, machine_name)
);

CREATE TABLE machine_metrics_samples (
  id BIGSERIAL PRIMARY KEY,
  machine_id INT NOT NULL REFERENCES monitored_machines(id) ON DELETE CASCADE,
  cpu_percent NUMERIC,
  mem_percent NUMERIC,
  disk_percent NUMERIC,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE machine_metrics_hourly (
  id BIGSERIAL PRIMARY KEY,
  machine_id INT NOT NULL REFERENCES monitored_machines(id) ON DELETE CASCADE,
  hour_bucket TIMESTAMPTZ NOT NULL,
  avg_cpu_percent NUMERIC,
  avg_mem_percent NUMERIC,
  avg_disk_percent NUMERIC,
  UNIQUE (machine_id, hour_bucket)
);
```

`alert_state` guarda o último estado conhecido de cada máquina — é o que
permite detectar *transição* (comparar o estado novo contra esse campo) sem
precisar de uma tabela de histórico de alertas separada.

## Rotina de manutenção (sem dependência nova)

Dois `setInterval` dentro do novo router (`src/monitoring.ts`, seguindo o
mesmo padrão de `src/payments.ts`/`src/notaFiscal.ts` — pool próprio,
router próprio, montado em `server.ts`):

- **Verificação de alerta** (a cada 2 minutos): para cada máquina, calcula
  o estado atual (offline se `last_seen_at` mais antigo que
  `offlineMinutes`; alerta se `last_disk_percent`/`last_mem_percent` acima
  do limite configurado — mesma lógica de "heartbeat obsoleto" que
  `isStoreOnline`/`ONLINE_STALE_MS` já usam em `src/lib/utils.ts` para as
  sessões de loja). Se o estado mudou desde o `alert_state` salvo, dispara
  o banner (via Socket.io) e a mensagem no Telegram, e atualiza
  `alert_state`.
- **Rollup e limpeza** (a cada 1 hora): agrega em `machine_metrics_hourly`
  as amostras de `machine_metrics_samples` com mais de 48h, depois apaga
  essas amostras brutas. Também apaga linhas de `machine_metrics_hourly`
  com mais de 90 dias.

## Endpoints novos (`src/monitoring.ts`)

| Rota | Quem chama | Auth |
|---|---|---|
| `POST /api/monitoring/report` | Agente PowerShell de cada máquina | Header `x-monitoring-token`, resolvido contra `allowedStores[].monitoringToken` |
| `GET /api/monitoring/overview` | Card resumo no SmartHelp | Mesmo padrão de autenticação administrativa já usado em `/api/system/stats` hoje |
| `GET /api/monitoring/stores/:cnpj` | Tela de detalhe por loja | Idem |
| `GET /api/monitoring/machines/:id/history?range=24h\|7d` | Gráfico de histórico | Idem |

`POST /api/monitoring/report` recebe `{ machineName, role, cpuPercent,
memPercent, diskPercent }`, resolve a loja pelo token, faz upsert em
`monitored_machines` (chave `store_cnpj + machine_name`) e insere uma linha
em `machine_metrics_samples`.

## Configuração de limites e Telegram

Limites globais (não por loja/máquina, por decisão de escopo) guardados em
`settings` — mesmo padrão de `admin_credentials`/`backup_status`:

```json
{
  "id": "monitoring_thresholds",
  "value": { "diskPercent": 90, "memPercent": 90, "offlineMinutes": 5 }
}
```

Editável numa tela simples dentro do painel admin (local exato definido no
plano de implementação).

Variáveis de ambiente novas: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Envio
via chamada direta à Bot API do Telegram
(`https://api.telegram.org/bot<token>/sendMessage`), sem SDK — mesmo estilo
de integração já usado com Asaas/NFS-e/Cosmos no projeto (`fetch` puro).

## Agente PowerShell

Arquivo `smartprice-monitor-agent.ps1` + `smartprice-monitor.json` (config
local), instalados juntos e agendados via Agendador de Tarefas do Windows
pra rodar **a cada 1 minuto**.

```json
// smartprice-monitor.json (exemplo)
{
  "storeCnpj": "12345678000199",
  "monitoringToken": "token-desta-loja",
  "machineName": "Caixa 1",
  "role": "workstation"
}
```

O script lê esse arquivo, coleta CPU (`Win32_Processor.LoadPercentage`),
memória (`Win32_OperatingSystem` — `TotalVisibleMemorySize`/
`FreePhysicalMemory`) e disco (`Win32_LogicalDisk` do drive do sistema), e
envia via `Invoke-RestMethod` para
`https://sistemasmartprice.com.br/api/monitoring/report`.

## Interface

- Os cards **Servidor** e **Máquinas** em `SmartHelpDashboard.tsx` (hoje
  "Em construção", linhas 239-250) passam a mostrar contagens ao vivo
  (ex.: "Servidores: 9/10 online", "Máquinas: 118/120 online"), coloridos
  conforme haja ou não alerta ativo, vindas de `GET
  /api/monitoring/overview`. Clicar em qualquer um dos dois leva pra uma
  tela nova.
- Nova view `monitoring` (adicionada ao tipo `View` em `src/store.ts`),
  implementada num componente novo `src/components/MonitoringDashboard.tsx`
  (pode ser dividido em subcomponentes durante o plano de implementação, se
  crescer demais): lista as 10 lojas, cada uma expansível mostrando o
  servidor (gauges de CPU/RAM/disco) e a grade de máquinas daquela loja
  (nome, indicador online/offline, mini-indicadores de CPU/RAM/disco).
- Clicar numa máquina abre o histórico (alternando 24h/7 dias) — gráfico de
  linha simples de CPU/RAM/disco ao longo do tempo.
- O componente `Gauge` hoje local a `SystemStats.tsx` é extraído para
  `src/components/ui/Gauge.tsx`, compartilhado entre a tela de stats da VPS
  e esta nova tela (evita duplicar o mesmo widget).

## Rollout

1. Implementar backend + agente.
2. Instalar em 2-3 máquinas de teste (ex.: uma loja piloto).
3. Acompanhar `SystemStats.tsx` (CPU/RAM/disco da própria VPS) por alguns
   dias confirmando que a carga nova não move o ponteiro.
4. Expandir gradualmente pras 10 lojas.

## Fora de escopo (decisão do usuário)

- Provedor/links de internet (spec separada, integração com GWN.Cloud).
- Impressoras (spec separada, SNMP).
- Limites de alerta customizados por loja ou por máquina.
- Alerta via WhatsApp ou e-mail (só Telegram por agora).
- Histórico de receita/negócio — esta spec é só infraestrutura técnica.
