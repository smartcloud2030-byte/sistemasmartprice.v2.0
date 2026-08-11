# Monitoramento — Excluir e renomear máquina

## Contexto

A tela de Monitoramento (`MonitoringDashboard.tsx`, spec original em
`2026-08-07-monitoramento-servidor-maquinas-design.md`) já lista as máquinas
reportadas por loja, mas não tem como remover uma máquina que saiu de uso
nem corrigir o nome de uma que foi cadastrada errado — hoje isso exigiria
mexer direto no Postgres da VPS. Esta spec adiciona as duas ações na
interface.

## Decisões já tomadas (confirmadas com o usuário)

- **Local das ações**: dentro do modal de histórico (`MachineHistoryPanel`),
  que já abre com o nome da máquina no topo — não mexe no card pequeno da
  grade (`MachineTile`), que fica só com o clique de abrir o histórico.
- **Comportamento de "reaparecer" é só avisado, não bloqueado.** Como a
  chave de upsert em `monitored_machines` é `(store_cnpj, machine_name)`
  (`src/monitoring.ts:105-118`), se o agente `.ps1` continuar rodando numa
  máquina excluída ou renomeada, ele recria o registro (excluir) ou cria um
  duplicado com o nome antigo (renomear) no próximo report — até 1 minuto
  depois. A interface avisa isso no momento da ação, mas não impede.
- Sem tela de confirmação separada — o aviso do excluir usa `window.confirm`
  (mesmo padrão já usado em `UserManagement.tsx` pra "Gerar novo" token).

## Fluxo de dados

### Excluir

1. Usuário clica "Excluir" no modal → `window.confirm` com o aviso:
   > "Isso remove [nome] do painel. Se o agente ainda estiver rodando nessa
   > máquina, ela pode reaparecer sozinha no próximo minuto — pare a tarefa
   > agendada nela antes de excluir, se quiser remover de vez."
2. Confirmado → `DELETE /api/monitoring/machines/:id`.
3. Backend apaga a linha de `monitored_machines` (cascade já apaga as
   amostras em `machine_metrics_samples`/`machine_metrics_hourly` via
   `ON DELETE CASCADE`, sem query extra).
4. Frontend fecha o modal e recarrega o overview.

### Renomear

1. Usuário clica "Renomear" no modal → campo de texto substitui o título,
   pré-preenchido com o nome atual.
2. Ao salvar → `PATCH /api/monitoring/machines/:id` com `{ machineName }`.
3. Backend valida nome não-vazio (trim) e unicidade dentro da mesma loja
   (`UNIQUE (store_cnpj, machine_name)`); em conflito, responde 409 com
   mensagem clara.
4. Sucesso → toast de aviso:
   > "Nome atualizado. Lembre de editar o `machineName` no
   > `smartprice-monitor.json` dessa máquina — senão ela volta a aparecer
   > com o nome antigo no próximo report."
5. Frontend atualiza o título do modal e recarrega o overview.

## Endpoints novos (`src/monitoring.ts`)

| Rota | Corpo | Auth | Resposta |
|---|---|---|---|
| `DELETE /api/monitoring/machines/:id` | — | `x-api-token` (mesmo `apiAuth` dos demais endpoints de leitura) | `{ success: true }` ou 404 se `id` não existe |
| `PATCH /api/monitoring/machines/:id` | `{ machineName: string }` | `x-api-token` | `{ success: true }` ou 409 se o nome já existe na loja |

Ambos seguem o padrão já usado em `router.get('/overview', apiAuth, ...)` —
mesmo pool, mesmo router, sem middleware novo.

## Interface (`MonitoringDashboard.tsx`)

- `MachineHistoryPanel`: cabeçalho ganha dois botões pequenos ao lado do
  nome (ícones `Pencil` e `Trash2`, mesma biblioteca `lucide-react` já
  usada no arquivo) — texto: título vira campo editável, lixeira dispara o
  `window.confirm` descrito acima.
- Depois de excluir ou renomear com sucesso, `onClose()` é chamado (excluir)
  ou o `machine` local é atualizado com o novo nome (renomear), e
  `fetchOverview()` do componente pai roda de novo pra refletir a mudança
  na grade por trás do modal.
- Erros de rede/validação (ex.: nome duplicado) aparecem como texto
  vermelho abaixo do campo, mesmo padrão visual já usado no
  `overviewError`/erro de histórico do arquivo.

## Fora de escopo

- Bloquear a ação quando o agente ainda está ativo (não dá pra saber pelo
  servidor se o `schtasks` está rodando ou não — só se ele reportou
  recentemente).
- Editar `role` (server/workstation) ou `storeCnpj` — não pedido, e trocar
  de loja teria implicações de UNIQUE constraint que fogem do escopo desta
  spec.
- Alterar o agente `.ps1` para sincronizar automaticamente o nome — o
  arquivo de config é local a cada máquina, fora do alcance do backend.
