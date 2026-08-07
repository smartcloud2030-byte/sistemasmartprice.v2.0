# Monitoramento em tempo real — Servidor e Máquinas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preencher os cards "Servidor" e "Máquinas" (hoje "Em construção" em `SmartHelpDashboard.tsx`) com monitoramento real de CPU/RAM/disco das ~130 máquinas das 10 lojas, com histórico, alertas por transição de estado e notificação no Telegram.

**Architecture:** Um agente PowerShell em cada máquina Windows envia métricas a cada 1 minuto para um novo router `src/monitoring.ts` (mesmo padrão de `src/payments.ts`/`src/notaFiscal.ts` — pool próprio, montado em `server.ts`). Duas tabelas Postgres guardam o estado atual (`monitored_machines`) e o histórico em duas camadas de retenção (`machine_metrics_samples` — 48h de detalhe — e `machine_metrics_hourly` — 90 dias de médias). Dois `setInterval` cuidam de alertas (a cada 2 min) e de resumir/limpar dado antigo (a cada 1h). O front-end ganha uma tela nova (`MonitoringDashboard.tsx`) e os cards do SmartHelp passam a mostrar contagens ao vivo.

**Tech Stack:** Express + `pg` (sem ORM), React + Zustand, PowerShell (agente), Socket.io (banner em tempo real), Telegram Bot API via `fetch` puro. Testes com `node:assert` via `tsx` para lógica pura; endpoints verificados manualmente via `curl` (mesmo padrão já usado no projeto para rotas que dependem de Postgres).

## Global Constraints

- Token de monitoramento é **um por loja** (não compartilhado), guardado como campo `monitoringToken` em cada entrada de `allowedStores`.
- Limites de alerta são **globais** (não por loja/máquina): `{ diskPercent: 90, memPercent: 90, offlineMinutes: 5 }`, guardados em `settings` (id `monitoring_thresholds`) via os endpoints genéricos `GET/POST /api/settings/:id` que já existem — nenhuma rota nova precisa ser criada só pra isso.
- Alertas disparam só na **transição de estado** (`ok`→algo, algo→`ok`), nunca repetição contínua.
- Retenção: amostra bruta (`machine_metrics_samples`) por 48h, resumo horário (`machine_metrics_hourly`) por 90 dias.
- Canal de alerta externo: **Telegram único e centralizado** (não por loja). `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` no `.env`.
- Sem biblioteca de gráficos nova — histórico usa um gráfico de linha simples (SVG).
- Sem mudança nos cards "Impressoras"/"Provedor" (permanecem "Em construção" — são specs futuras separadas).
- Spec de referência: `docs/superpowers/specs/2026-08-07-monitoramento-servidor-maquinas-design.md`.

---

### Task 1: `src/monitoring.ts` — schema + ingestão (`POST /api/monitoring/report`)

**Files:**
- Create: `src/monitoring.ts`
- Modify: `server.ts` (import + mount do router + `ensureMonitoringSchema`)

**Interfaces:**
- Produces (usado pelas Tasks 3 e 4): `export { pool }` (pool próprio do módulo), tabelas `monitored_machines`, `machine_metrics_samples`, `machine_metrics_hourly` no Postgres.

- [ ] **Step 1: Implementar `src/monitoring.ts`**

```typescript
// ─────────────────────────────────────────
// monitoring.ts — Monitoramento de servidor/máquinas das lojas
// Recebe métricas do agente PowerShell instalado em cada máquina.
// Pool próprio (mesmo padrão de src/payments.ts) — evita import circular
// com api.ts.
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

export async function ensureMonitoringSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitored_machines (
      id SERIAL PRIMARY KEY,
      store_cnpj VARCHAR(14) NOT NULL,
      machine_name TEXT NOT NULL,
      role VARCHAR(20) NOT NULL,
      last_cpu_percent NUMERIC,
      last_mem_percent NUMERIC,
      last_disk_percent NUMERIC,
      last_seen_at TIMESTAMPTZ,
      alert_state VARCHAR(20) NOT NULL DEFAULT 'ok',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (store_cnpj, machine_name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS machine_metrics_samples (
      id BIGSERIAL PRIMARY KEY,
      machine_id INT NOT NULL REFERENCES monitored_machines(id) ON DELETE CASCADE,
      cpu_percent NUMERIC,
      mem_percent NUMERIC,
      disk_percent NUMERIC,
      sampled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS machine_metrics_hourly (
      id BIGSERIAL PRIMARY KEY,
      machine_id INT NOT NULL REFERENCES monitored_machines(id) ON DELETE CASCADE,
      hour_bucket TIMESTAMPTZ NOT NULL,
      avg_cpu_percent NUMERIC,
      avg_mem_percent NUMERIC,
      avg_disk_percent NUMERIC,
      UNIQUE (machine_id, hour_bucket)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_metrics_samples_machine_time ON machine_metrics_samples(machine_id, sampled_at);`);
}

async function resolveStoreCnpjByToken(token: string): Promise<string | null> {
  const result = await pool.query("SELECT value FROM settings WHERE id = 'users_and_flags'");
  const allowedStores: any[] = result.rows[0]?.value?.allowedStores || [];
  const match = allowedStores.find((s) => s.monitoringToken === token);
  return match ? String(match.cnpj).replace(/\D/g, '') : null;
}

// ── Ingestão: chamado pelo agente PowerShell de cada máquina ────
router.post('/report', async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-monitoring-token'];
    if (!token || typeof token !== 'string') {
      return res.status(401).json({ error: 'Token de monitoramento ausente' });
    }

    const storeCnpj = await resolveStoreCnpjByToken(token);
    if (!storeCnpj) return res.status(401).json({ error: 'Token de monitoramento inválido' });

    const machineName = String(req.body?.machineName || '').trim();
    const role = req.body?.role === 'server' ? 'server' : 'workstation';
    const cpuPercent = Number(req.body?.cpuPercent);
    const memPercent = Number(req.body?.memPercent);
    const diskPercent = Number(req.body?.diskPercent);
    if (!machineName || [cpuPercent, memPercent, diskPercent].some((v) => Number.isNaN(v))) {
      return res.status(400).json({ error: 'Dados de métrica inválidos' });
    }

    const upsert = await pool.query(
      `INSERT INTO monitored_machines (store_cnpj, machine_name, role, last_cpu_percent, last_mem_percent, last_disk_percent, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (store_cnpj, machine_name) DO UPDATE SET
         role = $3, last_cpu_percent = $4, last_mem_percent = $5, last_disk_percent = $6, last_seen_at = NOW()
       RETURNING id`,
      [storeCnpj, machineName, role, cpuPercent, memPercent, diskPercent]
    );
    const machineId = upsert.rows[0].id;

    await pool.query(
      `INSERT INTO machine_metrics_samples (machine_id, cpu_percent, mem_percent, disk_percent) VALUES ($1, $2, $3, $4)`,
      [machineId, cpuPercent, memPercent, diskPercent]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { pool, apiAuth };
export default router;
```

- [ ] **Step 2: Montar o router em `server.ts`**

Junto dos outros imports de router (perto da linha 9-10):

```typescript
import monitoringRouter, { ensureMonitoringSchema } from './src/monitoring';
```

Junto das outras rotas (perto de `app.use('/api/notafiscal', notaFiscalRouter);`):

```typescript
  app.use('/api/monitoring', monitoringRouter);
```

Junto de `await ensureNotaFiscalSchema().catch(...)`:

```typescript
  await ensureMonitoringSchema().catch(err => console.error('Erro ao preparar schema de monitoramento:', err));
```

- [ ] **Step 3: Verificação manual**

Com `npm run dev` rodando:

```bash
# cria uma loja de teste com token, direto no Postgres, pra nao depender da Task 5 ainda
docker exec -it smartprice_postgres_local psql -U smartprice -d smartprice -c "
INSERT INTO settings (id, value, updated_at) VALUES ('users_and_flags', '{\"allowedStores\":[{\"cnpj\":\"11111111000199\",\"bandeira\":\"Teste\",\"monitoringToken\":\"token-teste-123\"}]}', NOW())
ON CONFLICT (id) DO UPDATE SET value = '{\"allowedStores\":[{\"cnpj\":\"11111111000199\",\"bandeira\":\"Teste\",\"monitoringToken\":\"token-teste-123\"}]}';
"

# token errado -> 401
curl -i -X POST http://localhost:3000/api/monitoring/report -H "Content-Type: application/json" -H "x-monitoring-token: errado" -d '{"machineName":"Caixa 1","role":"workstation","cpuPercent":10,"memPercent":20,"diskPercent":30}'

# token certo -> 200 { "success": true }
curl -i -X POST http://localhost:3000/api/monitoring/report -H "Content-Type: application/json" -H "x-monitoring-token: token-teste-123" -d '{"machineName":"Caixa 1","role":"workstation","cpuPercent":10,"memPercent":20,"diskPercent":30}'

# confirma que gravou
docker exec -it smartprice_postgres_local psql -U smartprice -d smartprice -c "SELECT * FROM monitored_machines; SELECT * FROM machine_metrics_samples;"
```

Expected: os 3 comportamentos batem (401, 200, linhas gravadas nas duas tabelas).

- [ ] **Step 4: Commit**

```bash
git add server.ts src/monitoring.ts
git commit -m "feat: schema e endpoint de ingestao do monitoramento de maquinas"
```

---

### Task 2: `src/lib/monitoringStatus.ts` — cálculo puro de status/alerta (TDD)

**Files:**
- Create: `src/lib/monitoringStatus.ts`
- Create: `src/lib/monitoringStatus.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (usado pelas Tasks 3 e 4):
  - `export interface MonitoringThresholds { diskPercent: number; memPercent: number; offlineMinutes: number; }`
  - `export type AlertState = 'ok' | 'disk_alert' | 'mem_alert' | 'offline';`
  - `export interface MachineSnapshot { lastDiskPercent: number | null; lastMemPercent: number | null; lastSeenAt: string | null; }`
  - `export function isMachineOffline(lastSeenAt: string | null, offlineMinutes: number, now?: Date): boolean`
  - `export function evaluateAlertState(machine: MachineSnapshot, thresholds: MonitoringThresholds, now?: Date): AlertState`
  - `export function alertStateLabel(state: AlertState): string`

- [ ] **Step 1: Escrever o teste que falha primeiro**

```typescript
import assert from 'node:assert';
import { isMachineOffline, evaluateAlertState, alertStateLabel } from './monitoringStatus';

const NOW = new Date('2026-08-07T12:00:00Z');
const thresholds = { diskPercent: 90, memPercent: 90, offlineMinutes: 5 };

function offlineDetectaAusenciaDeReporte() {
  assert.strictEqual(isMachineOffline(null, 5, NOW), true);
  assert.strictEqual(isMachineOffline('2026-08-07T11:59:00Z', 5, NOW), false); // 1 min atrás
  assert.strictEqual(isMachineOffline('2026-08-07T11:50:00Z', 5, NOW), true); // 10 min atrás
}

function offlineTemPrioridadeSobreLimiteDeDiscoEMemoria() {
  const machine = { lastDiskPercent: 99, lastMemPercent: 99, lastSeenAt: '2026-08-07T11:50:00Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'offline');
}

function discoAcimaDoLimiteDisparaAlertaDeDisco() {
  const machine = { lastDiskPercent: 95, lastMemPercent: 10, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'disk_alert');
}

function memoriaAcimaDoLimiteDisparaAlertaDeMemoriaQuandoDiscoOk() {
  const machine = { lastDiskPercent: 10, lastMemPercent: 95, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'mem_alert');
}

function tudoDentroDoLimiteEOk() {
  const machine = { lastDiskPercent: 10, lastMemPercent: 10, lastSeenAt: '2026-08-07T11:59:30Z' };
  assert.strictEqual(evaluateAlertState(machine, thresholds, NOW), 'ok');
}

function labelsEmPortugues() {
  assert.strictEqual(alertStateLabel('ok'), 'Normal');
  assert.strictEqual(alertStateLabel('offline'), 'Offline');
  assert.strictEqual(alertStateLabel('disk_alert'), 'Disco crítico');
  assert.strictEqual(alertStateLabel('mem_alert'), 'Memória crítica');
}

try {
  offlineDetectaAusenciaDeReporte();
  offlineTemPrioridadeSobreLimiteDeDiscoEMemoria();
  discoAcimaDoLimiteDisparaAlertaDeDisco();
  memoriaAcimaDoLimiteDisparaAlertaDeMemoriaQuandoDiscoOk();
  tudoDentroDoLimiteEOk();
  labelsEmPortugues();
  console.log('PASS: todos os testes de monitoringStatus passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx src/lib/monitoringStatus.test.ts`
Expected: `Cannot find module './monitoringStatus'`.

- [ ] **Step 3: Implementar `src/lib/monitoringStatus.ts`**

```typescript
// ─────────────────────────────────────────
// monitoringStatus.ts — Cálculo puro de status/alerta de máquinas monitoradas
// ─────────────────────────────────────────

export interface MonitoringThresholds {
  diskPercent: number;
  memPercent: number;
  offlineMinutes: number;
}

export type AlertState = 'ok' | 'disk_alert' | 'mem_alert' | 'offline';

export interface MachineSnapshot {
  lastDiskPercent: number | null;
  lastMemPercent: number | null;
  lastSeenAt: string | null;
}

export function isMachineOffline(lastSeenAt: string | null, offlineMinutes: number, now: Date = new Date()): boolean {
  if (!lastSeenAt) return true;
  const diffMs = now.getTime() - new Date(lastSeenAt).getTime();
  return diffMs > offlineMinutes * 60 * 1000;
}

export function evaluateAlertState(machine: MachineSnapshot, thresholds: MonitoringThresholds, now: Date = new Date()): AlertState {
  if (isMachineOffline(machine.lastSeenAt, thresholds.offlineMinutes, now)) return 'offline';
  if (machine.lastDiskPercent !== null && machine.lastDiskPercent >= thresholds.diskPercent) return 'disk_alert';
  if (machine.lastMemPercent !== null && machine.lastMemPercent >= thresholds.memPercent) return 'mem_alert';
  return 'ok';
}

export function alertStateLabel(state: AlertState): string {
  switch (state) {
    case 'offline': return 'Offline';
    case 'disk_alert': return 'Disco crítico';
    case 'mem_alert': return 'Memória crítica';
    default: return 'Normal';
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx src/lib/monitoringStatus.test.ts`
Expected: `PASS: todos os testes de monitoringStatus passaram`

- [ ] **Step 5: Adicionar ao script `test` do `package.json`** (append `&& tsx src/lib/monitoringStatus.test.ts`)

Run: `npm test` — Expected: todas as linhas `PASS: ...`, sem `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/monitoringStatus.ts src/lib/monitoringStatus.test.ts
git commit -m "feat: funcoes puras de status/alerta de maquinas monitoradas"
```

---

### Task 3: Endpoints de leitura (`GET /overview`, `/stores/:cnpj`, `/machines/:id/history`)

**Files:**
- Modify: `src/monitoring.ts` (adiciona `getThresholds`, as 3 rotas GET, imports de `./lib/monitoringStatus`)

**Interfaces:**
- Consumes: `evaluateAlertState`, `MonitoringThresholds` de `./lib/monitoringStatus` (Task 2); `pool`, `apiAuth` já definidos no próprio arquivo (Task 1).

- [ ] **Step 1: Adicionar o import e o helper de limites**

No topo de `src/monitoring.ts`, junto dos outros imports:

```typescript
import { evaluateAlertState, MonitoringThresholds } from './lib/monitoringStatus';
```

Antes da rota `/report`:

```typescript
async function getThresholds(): Promise<MonitoringThresholds> {
  const result = await pool.query("SELECT value FROM settings WHERE id = 'monitoring_thresholds'");
  const stored = result.rows[0]?.value;
  return {
    diskPercent: stored?.diskPercent ?? 90,
    memPercent: stored?.memPercent ?? 90,
    offlineMinutes: stored?.offlineMinutes ?? 5,
  };
}
```

- [ ] **Step 2: Adicionar as 3 rotas de leitura**

Depois da rota `/report`:

```typescript
// ── Leitura: alimenta a tela de Monitoramento e os cards do SmartHelp ────
router.get('/overview', apiAuth, async (_req: Request, res: Response) => {
  try {
    const thresholds = await getThresholds();
    const result = await pool.query('SELECT * FROM monitored_machines ORDER BY store_cnpj, role DESC, machine_name');
    const now = new Date();

    const stores: Record<string, { cnpj: string; servers: any[]; workstations: any[] }> = {};
    for (const row of result.rows) {
      const state = evaluateAlertState({ lastDiskPercent: row.last_disk_percent, lastMemPercent: row.last_mem_percent, lastSeenAt: row.last_seen_at }, thresholds, now);
      const entry = {
        id: row.id,
        machineName: row.machine_name,
        role: row.role,
        cpuPercent: row.last_cpu_percent,
        memPercent: row.last_mem_percent,
        diskPercent: row.last_disk_percent,
        lastSeenAt: row.last_seen_at,
        alertState: state,
      };
      if (!stores[row.store_cnpj]) stores[row.store_cnpj] = { cnpj: row.store_cnpj, servers: [], workstations: [] };
      if (row.role === 'server') stores[row.store_cnpj].servers.push(entry);
      else stores[row.store_cnpj].workstations.push(entry);
    }

    const storeList = Object.values(stores);
    const serverTotal = storeList.reduce((sum, s) => sum + s.servers.length, 0);
    const serverOnline = storeList.reduce((sum, s) => sum + s.servers.filter((m) => m.alertState !== 'offline').length, 0);
    const machineTotal = storeList.reduce((sum, s) => sum + s.workstations.length, 0);
    const machineOnline = storeList.reduce((sum, s) => sum + s.workstations.filter((m) => m.alertState !== 'offline').length, 0);
    const hasActiveAlert = storeList.some((s) => [...s.servers, ...s.workstations].some((m) => m.alertState !== 'ok'));

    res.json({ serverOnline, serverTotal, machineOnline, machineTotal, hasActiveAlert, stores: storeList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stores/:cnpj', apiAuth, async (req: Request, res: Response) => {
  try {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    const thresholds = await getThresholds();
    const result = await pool.query('SELECT * FROM monitored_machines WHERE store_cnpj = $1 ORDER BY role DESC, machine_name', [cnpj]);
    const now = new Date();
    const machines = result.rows.map((row) => ({
      id: row.id,
      machineName: row.machine_name,
      role: row.role,
      cpuPercent: row.last_cpu_percent,
      memPercent: row.last_mem_percent,
      diskPercent: row.last_disk_percent,
      lastSeenAt: row.last_seen_at,
      alertState: evaluateAlertState({ lastDiskPercent: row.last_disk_percent, lastMemPercent: row.last_mem_percent, lastSeenAt: row.last_seen_at }, thresholds, now),
    }));
    res.json({ cnpj, machines });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/machines/:id/history', apiAuth, async (req: Request, res: Response) => {
  try {
    const machineId = parseInt(req.params.id, 10);
    const range = req.query.range === '7d' ? '7d' : '24h';

    if (range === '24h') {
      const result = await pool.query(
        `SELECT cpu_percent, mem_percent, disk_percent, sampled_at FROM machine_metrics_samples
         WHERE machine_id = $1 AND sampled_at > NOW() - INTERVAL '24 hours' ORDER BY sampled_at ASC`,
        [machineId]
      );
      return res.json({ range, points: result.rows.map((r) => ({ timestamp: r.sampled_at, cpuPercent: r.cpu_percent, memPercent: r.mem_percent, diskPercent: r.disk_percent })) });
    }

    const result = await pool.query(
      `SELECT avg_cpu_percent, avg_mem_percent, avg_disk_percent, hour_bucket FROM machine_metrics_hourly
       WHERE machine_id = $1 AND hour_bucket > NOW() - INTERVAL '7 days' ORDER BY hour_bucket ASC`,
      [machineId]
    );
    res.json({ range, points: result.rows.map((r) => ({ timestamp: r.hour_bucket, cpuPercent: r.avg_cpu_percent, memPercent: r.avg_mem_percent, diskPercent: r.avg_disk_percent })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verificação manual**

Usando a mesma loja/token de teste da Task 1 e o registro já gravado:

```bash
# sem token -> 401
curl -i http://localhost:3000/api/monitoring/overview

# com token -> 200, mostra a loja de teste com 1 workstation online
curl -i http://localhost:3000/api/monitoring/overview -H "x-api-token: <API_SECRET do seu .env>"

curl -i http://localhost:3000/api/monitoring/stores/11111111000199 -H "x-api-token: <API_SECRET do seu .env>"

curl -i "http://localhost:3000/api/monitoring/machines/1/history?range=24h" -H "x-api-token: <API_SECRET do seu .env>"
```

Expected: os 4 comportamentos batem (401 sem token; overview mostra `serverTotal: 0, machineTotal: 1, machineOnline: 1`; detalhe da loja lista a máquina; histórico retorna a amostra inserida na Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/monitoring.ts
git commit -m "feat: endpoints de leitura do monitoramento (overview, loja, historico)"
```

---

### Task 4: Alertas (varredura + Telegram) e rollup/limpeza

**Files:**
- Modify: `src/monitoring.ts` (adiciona `sendTelegramAlert`, `sweepAlerts`, `rollupAndPrune`, `startMonitoringJobs`)
- Modify: `server.ts` (chama `startMonitoringJobs(io)`)
- Modify: `.env.example` (adiciona `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)

**Interfaces:**
- Consumes: `alertStateLabel` de `./lib/monitoringStatus` (Task 2); `io` (Socket.io Server) passado por `server.ts`.
- Produces: `export function startMonitoringJobs(io: Server | null): void`

- [ ] **Step 1: Adicionar o import de `Server`/`alertStateLabel` e as funções de job**

No topo de `src/monitoring.ts`:

```typescript
import type { Server } from 'socket.io';
import { evaluateAlertState, alertStateLabel, MonitoringThresholds } from './lib/monitoringStatus';
```

No final do arquivo, antes de `export default router;`:

```typescript
// ── Notificação externa (Telegram) ────────
async function sendTelegramAlert(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
  } catch (err) {
    console.error('[monitoring] Erro ao enviar alerta no Telegram:', err);
  }
}

// ── Varredura de alertas: roda a cada 2 min, dispara só na transição ────
async function sweepAlerts(io: Server | null) {
  const thresholds = await getThresholds();
  const result = await pool.query('SELECT * FROM monitored_machines');
  const now = new Date();

  for (const row of result.rows) {
    const newState = evaluateAlertState(
      { lastDiskPercent: row.last_disk_percent, lastMemPercent: row.last_mem_percent, lastSeenAt: row.last_seen_at },
      thresholds,
      now
    );
    if (newState === row.alert_state) continue;

    await pool.query('UPDATE monitored_machines SET alert_state = $1 WHERE id = $2', [newState, row.id]);

    const label = `${row.machine_name} (loja ${row.store_cnpj})`;
    const message = newState === 'ok' ? `✅ ${label} voltou ao normal.` : `⚠️ ${label}: ${alertStateLabel(newState)}.`;

    io?.to('admin_room').emit('monitoring:alert', {
      machineId: row.id,
      storeCnpj: row.store_cnpj,
      machineName: row.machine_name,
      alertState: newState,
    });
    await sendTelegramAlert(message);
  }
}

// ── Rollup + limpeza: roda a cada 1h ────
async function rollupAndPrune() {
  await pool.query(`
    INSERT INTO machine_metrics_hourly (machine_id, hour_bucket, avg_cpu_percent, avg_mem_percent, avg_disk_percent)
    SELECT machine_id, date_trunc('hour', sampled_at), AVG(cpu_percent), AVG(mem_percent), AVG(disk_percent)
    FROM machine_metrics_samples
    WHERE sampled_at < NOW() - INTERVAL '48 hours'
    GROUP BY machine_id, date_trunc('hour', sampled_at)
    ON CONFLICT (machine_id, hour_bucket) DO UPDATE SET
      avg_cpu_percent = EXCLUDED.avg_cpu_percent,
      avg_mem_percent = EXCLUDED.avg_mem_percent,
      avg_disk_percent = EXCLUDED.avg_disk_percent
  `);
  await pool.query(`DELETE FROM machine_metrics_samples WHERE sampled_at < NOW() - INTERVAL '48 hours'`);
  await pool.query(`DELETE FROM machine_metrics_hourly WHERE hour_bucket < NOW() - INTERVAL '90 days'`);
}

export function startMonitoringJobs(io: Server | null) {
  setInterval(() => sweepAlerts(io).catch((err) => console.error('[monitoring] Erro na varredura de alertas:', err)), 2 * 60 * 1000);
  setInterval(() => rollupAndPrune().catch((err) => console.error('[monitoring] Erro no rollup/limpeza:', err)), 60 * 60 * 1000);
}
```

- [ ] **Step 2: Ligar os jobs em `server.ts`**

No import do router (linha adicionada na Task 1), inclui `startMonitoringJobs`:

```typescript
import monitoringRouter, { ensureMonitoringSchema, startMonitoringJobs } from './src/monitoring';
```

Depois de `setSocketServer(io);` / `setPaymentsSocketServer(io);`:

```typescript
  startMonitoringJobs(io);
```

- [ ] **Step 3: Adicionar as variáveis ao `.env.example`**

```
# Telegram — alerta de monitoramento de servidor/maquinas das lojas.
# Crie um bot com o @BotFather, pegue o token, e o chat_id do seu chat/grupo
# (ex.: mandando uma mensagem pro bot e consultando getUpdates).
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 4: Verificação manual**

Sem `TELEGRAM_BOT_TOKEN` configurado no `.env` local (comportamento esperado: alerta é só logado/ignorado, sem quebrar nada):

```bash
# forca a maquina de teste (Task 1/3) a entrar em alerta de disco
curl -i -X POST http://localhost:3000/api/monitoring/report -H "Content-Type: application/json" -H "x-monitoring-token: token-teste-123" -d '{"machineName":"Caixa 1","role":"workstation","cpuPercent":10,"memPercent":20,"diskPercent":95}'

# espera ate 2 min (ou reinicia o servidor pra forcar o setInterval a rodar antes) e confere no Postgres
docker exec -it smartprice_postgres_local psql -U smartprice -d smartprice -c "SELECT machine_name, alert_state FROM monitored_machines;"
```

Expected: `alert_state` muda de `ok` para `disk_alert` dentro de até 2 minutos, sem erro nos logs do `npm run dev` mesmo sem Telegram configurado.

- [ ] **Step 5: Commit**

```bash
git add server.ts src/monitoring.ts .env.example
git commit -m "feat: varredura de alertas com Telegram e rollup/limpeza de metricas antigas"
```

---

### Task 5: Token de monitoramento por loja + limites configuráveis (front-end)

**Files:**
- Modify: `src/store.ts` (tipo `allowedStores`, `AppState`, ação `generateMonitoringToken`, estado+ações de `monitoringThresholds`)
- Modify: `src/components/UserManagement.tsx` (botão de gerar/copiar token por loja)

**Interfaces:**
- Produces (usado pela Task 7): `monitoringThresholds: { diskPercent: number; memPercent: number; offlineMinutes: number }`, `loadMonitoringThresholds: () => Promise<void>`, `saveMonitoringThresholds: (t) => Promise<void>`, `generateMonitoringToken: (cnpj: string) => void`, campo `monitoringToken?: string` em cada item de `allowedStores`.

- [ ] **Step 1: Adicionar `monitoringToken` ao tipo `allowedStores`**

Em `src/store.ts`, no bloco do tipo `allowedStores` (linha 479) e no parâmetro de `addAllowedStore` (mesma lista de campos), adiciona:

```typescript
  allowedStores: {
    cnpj: string;
    bandeira: string;
    // ... campos existentes ...
    monitoringToken?: string;
  }[];
```

(Aplicar o mesmo campo opcional na assinatura de `addAllowedStore`, que hoje repete a mesma lista de campos do tipo acima.)

- [ ] **Step 2: Adicionar à interface `AppState`**

Perto de `togglePaymentBlock: (cnpj: string) => void;` (linha 520):

```typescript
  togglePaymentBlock: (cnpj: string) => void;
  generateMonitoringToken: (cnpj: string) => void;
  monitoringThresholds: { diskPercent: number; memPercent: number; offlineMinutes: number };
  loadMonitoringThresholds: () => Promise<void>;
  saveMonitoringThresholds: (thresholds: { diskPercent: number; memPercent: number; offlineMinutes: number }) => Promise<void>;
```

- [ ] **Step 3: Implementar as ações**

Logo depois de `togglePaymentBlock` (linha 1612):

```typescript
      generateMonitoringToken: (cnpj) => set((state) => {
        const nc = cnpj?.replace(/[^\d]/g, '') || '';
        const token = crypto.randomUUID();
        const newAllowedStores = state.allowedStores.map(s => s.cnpj?.replace(/[^\d]/g, '') === nc ? { ...s, monitoringToken: token } : s);
        setTimeout(() => get().saveUsersAndFlags(), 0);
        return { allowedStores: newAllowedStores };
      }),
      monitoringThresholds: { diskPercent: 90, memPercent: 90, offlineMinutes: 5 },
      loadMonitoringThresholds: async () => {
        try {
          const data = await apiGet('/settings/monitoring_thresholds');
          if (data?.value) set({ monitoringThresholds: data.value });
        } catch (error) {
          console.error('Error loading monitoring thresholds:', error);
        }
      },
      saveMonitoringThresholds: async (thresholds) => {
        set({ monitoringThresholds: thresholds });
        try {
          await apiPost('/settings/monitoring_thresholds', { value: thresholds });
        } catch (error) {
          console.error('Error saving monitoring thresholds:', error);
        }
      },
```

- [ ] **Step 4: Botão de gerar/copiar token em `UserManagement.tsx`**

Adiciona `generateMonitoringToken` à desestruturação do `useStore()` (linha 12) e `KeyRound` ao import de ícones (linha 3, junto dos outros nomes de `lucide-react`).

Depois do bloco de "Pendência de Pagamento" (fecha na linha 1026, antes do `</div>` da linha 1027):

```tsx
                      {/* Token de Monitoramento (agente de CPU/RAM/disco) */}
                      <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-cyan-600" />
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white opacity-60">Token de Monitoramento</h4>
                        </div>
                        {store.monitoringToken ? (
                          <div className="flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 rounded-lg text-[10px] bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-zinc-500 truncate">{store.monitoringToken}</code>
                            <button
                              onClick={() => { navigator.clipboard.writeText(store.monitoringToken || ''); toast.success('Token copiado!'); }}
                              className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                              Copiar
                            </button>
                            <button
                              onClick={() => generateMonitoringToken(store.cnpj)}
                              className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
                            >
                              Gerar novo
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => generateMonitoringToken(store.cnpj)}
                            className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            Gerar token de monitoramento
                          </button>
                        )}
                      </div>
```

- [ ] **Step 5: Rodar o typecheck**

Run: `npm run lint` — Expected: sem erros.

- [ ] **Step 6: Testar no navegador**

Logado como admin, abrir Gerenciar Usuários → expandir uma loja → clicar "Gerar token de monitoramento" → confirmar que aparece o token com botões Copiar/Gerar novo, e que "Copiar" realmente copia (cole em outro lugar pra confirmar).

- [ ] **Step 7: Commit**

```bash
git add src/store.ts src/components/UserManagement.tsx
git commit -m "feat: token de monitoramento por loja e limites configuraveis"
```

---

### Task 6: Extrair `Gauge` para componente compartilhado

**Files:**
- Create: `src/components/ui/Gauge.tsx`
- Modify: `src/components/SystemStats.tsx` (remove `Gauge`/`barColor`/`textColor` locais, importa do novo arquivo)

**Interfaces:**
- Produces (usado pela Task 7): `export const Gauge: React.FC<{ label: string; icon: React.ElementType; percent: number; detail: string }>`

- [ ] **Step 1: Criar `src/components/ui/Gauge.tsx`**

```tsx
import React from 'react';
import { cn } from '../../lib/utils';

const CRITICAL_THRESHOLD = 85;
const WARNING_THRESHOLD = 65;

function barColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'bg-red-500';
  if (percent >= WARNING_THRESHOLD) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function textColor(percent: number): string {
  if (percent >= CRITICAL_THRESHOLD) return 'text-red-600';
  if (percent >= WARNING_THRESHOLD) return 'text-yellow-600';
  return 'text-emerald-600';
}

interface Props {
  label: string;
  icon: React.ElementType;
  percent: number;
  detail: string;
}

export const Gauge: React.FC<Props> = ({ label, icon: Icon, percent, detail }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-bold text-black dark:text-white">{label}</span>
      </div>
      <span className={cn('text-sm font-black', textColor(percent))}>{percent.toFixed(1)}%</span>
    </div>
    <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
      <div className={cn('h-full transition-all', barColor(percent))} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
    <p className="text-xs text-zinc-400">{detail}</p>
  </div>
);
```

- [ ] **Step 2: Atualizar `src/components/SystemStats.tsx`**

Remove a definição local de `Gauge`/`barColor`/`textColor` (linhas 23-49 do arquivo atual — mas **mantém** `CRITICAL_THRESHOLD`/`WARNING_THRESHOLD`, que também são usados em `SystemStats.tsx` para o cálculo de `alerts`, fora do `Gauge`). Adiciona o import:

```typescript
import { Gauge } from './ui/Gauge';
```

O restante do arquivo (uso de `<Gauge ... />` nas linhas 116-135) não muda.

- [ ] **Step 3: Rodar o typecheck e testar visualmente**

Run: `npm run lint` — Expected: sem erros.

Abrir o painel de Status do Sistema (dentro do AdminDashboard) e confirmar que os 3 medidores (Disco/Memória/CPU) continuam idênticos visualmente a antes.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Gauge.tsx src/components/SystemStats.tsx
git commit -m "refactor: extrai Gauge para componente compartilhado"
```

---

### Task 7: `MonitoringDashboard.tsx` — tela de monitoramento + cards ao vivo no SmartHelp

**Files:**
- Create: `src/components/MonitoringDashboard.tsx`
- Modify: `src/store.ts` (adiciona `'monitoring'` ao tipo `View`)
- Modify: `src/App.tsx` (import + roteamento da view)
- Modify: `src/components/SmartHelpDashboard.tsx` (cards Servidor/Máquinas ao vivo)

**Interfaces:**
- Consumes: `GET /api/monitoring/overview`, `GET /api/monitoring/stores/:cnpj`, `GET /api/monitoring/machines/:id/history` (Task 3); `monitoringThresholds`/`loadMonitoringThresholds`/`saveMonitoringThresholds` de `useStore()` (Task 5); `Gauge` de `./ui/Gauge` (Task 6).

- [ ] **Step 1: Adicionar `'monitoring'` ao tipo `View`**

Em `src/store.ts`, linha 151:

```typescript
export type View = 'editor' | 'queue' | 'folders' | 'encarte' | 'dashboard' | 'smarthelp' | 'monitoring';
```

- [ ] **Step 2: Implementar `src/components/MonitoringDashboard.tsx`**

Este componente busca `/api/monitoring/overview` a cada 30s, lista as lojas (expansíveis), mostra os gauges do servidor e a grade de máquinas de cada loja, e abre um painel de histórico ao clicar numa máquina. Inclui também a edição dos limites de alerta (`monitoringThresholds`).

**Antes de escrever o gráfico de histórico (a função `MachineHistoryPanel` abaixo, especificamente a parte que desenha o SVG de linha), invoque a skill `dataviz` e siga a paleta/guia dela** — o resto deste componente (lista, gauges, formulário de limites) não precisa da skill, só o gráfico de linha do histórico.

```tsx
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Server, HardDrive, MemoryStick, Cpu, RefreshCw, AlertTriangle, Save } from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { Gauge } from './ui/Gauge';

const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';

interface MachineData {
  id: number;
  machineName: string;
  role: 'server' | 'workstation';
  cpuPercent: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  lastSeenAt: string | null;
  alertState: 'ok' | 'disk_alert' | 'mem_alert' | 'offline';
}

interface StoreOverview {
  cnpj: string;
  servers: MachineData[];
  workstations: MachineData[];
}

interface OverviewResponse {
  serverOnline: number;
  serverTotal: number;
  machineOnline: number;
  machineTotal: number;
  hasActiveAlert: boolean;
  stores: StoreOverview[];
}

const ALERT_BADGE: Record<MachineData['alertState'], { label: string; className: string }> = {
  ok: { label: 'Normal', className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
  disk_alert: { label: 'Disco crítico', className: 'bg-red-100 dark:bg-red-900/30 text-red-600' },
  mem_alert: { label: 'Memória crítica', className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' },
  offline: { label: 'Offline', className: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500' },
};

function MachineTile({ machine, onClick }: { machine: MachineData; onClick: () => void }) {
  const badge = ALERT_BADGE[machine.alertState];
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1.5 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-all text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-black dark:text-white truncate">{machine.machineName}</span>
        <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wide flex-shrink-0', badge.className)}>{badge.label}</span>
      </div>
      <p className="text-[10px] text-zinc-400">
        CPU {machine.cpuPercent?.toFixed(0) ?? '-'}% · RAM {machine.memPercent?.toFixed(0) ?? '-'}% · Disco {machine.diskPercent?.toFixed(0) ?? '-'}%
      </p>
    </button>
  );
}

function MachineHistoryPanel({ machine, onClose }: { machine: MachineData; onClose: () => void }) {
  const [range, setRange] = useState<'24h' | '7d'>('24h');
  const [points, setPoints] = useState<{ timestamp: string; cpuPercent: number; memPercent: number; diskPercent: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/monitoring/machines/${machine.id}/history?range=${range}`, { headers: { 'x-api-token': API_SECRET } })
      .then((res) => res.json())
      .then((data) => setPoints(data.points || []))
      .catch(() => setPoints([]))
      .finally(() => setIsLoading(false));
  }, [machine.id, range]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-black dark:text-white">{machine.machineName}</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">✕</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRange('24h')} className={cn('px-3 py-1.5 rounded-full text-[10px] font-black uppercase', range === '24h' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400')}>24h</button>
          <button onClick={() => setRange('7d')} className={cn('px-3 py-1.5 rounded-full text-[10px] font-black uppercase', range === '7d' ? 'bg-blue-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400')}>7 dias</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-zinc-400">Carregando histórico...</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-zinc-400">Sem dados suficientes ainda para este período.</p>
        ) : (
          <>
            {/* IMPLEMENTADO NA TASK 7 USANDO A SKILL dataviz — gráfico de linha
               com 3 séries (cpuPercent/memPercent/diskPercent) a partir de
               `points`, eixo X = timestamp, eixo Y = 0-100%. */}
            <div />
          </>
        )}
      </div>
    </div>
  );
}

function StoreSection({ store, onOpenMachine }: { store: StoreOverview; onOpenMachine: (m: MachineData) => void }) {
  const [expanded, setExpanded] = useState(false);
  const server = store.servers[0];

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <Server className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-bold text-black dark:text-white">Loja {store.cnpj}</span>
          <span className="text-xs text-zinc-400">
            {store.workstations.filter((m) => m.alertState !== 'offline').length}/{store.workstations.length} máquinas online
          </span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="p-4 space-y-4 border-t border-zinc-200 dark:border-zinc-700">
          {server && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
              <Gauge label="CPU (Servidor)" icon={Cpu} percent={server.cpuPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
              <Gauge label="RAM (Servidor)" icon={MemoryStick} percent={server.memPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
              <Gauge label="Disco (Servidor)" icon={HardDrive} percent={server.diskPercent || 0} detail={server.alertState === 'offline' ? 'Servidor offline' : 'Ao vivo'} />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {store.workstations.map((m) => (
              <MachineTile key={m.id} machine={m} onClick={() => onOpenMachine(m)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MonitoringDashboard() {
  const { setView, monitoringThresholds, loadMonitoringThresholds, saveMonitoringThresholds } = useStore();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const [thresholdsForm, setThresholdsForm] = useState(monitoringThresholds);

  const fetchOverview = () => {
    fetch('/api/monitoring/overview', { headers: { 'x-api-token': API_SECRET } })
      .then((res) => res.json())
      .then(setOverview)
      .catch(() => setOverview(null));
  };

  useEffect(() => {
    loadMonitoringThresholds();
    fetchOverview();
    const interval = setInterval(fetchOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setThresholdsForm(monitoringThresholds);
  }, [monitoringThresholds]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('smarthelp')} className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:shadow-md transition-all text-black dark:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-black dark:text-white">Monitoramento</h1>
            <p className="text-black dark:text-white opacity-60 text-sm font-medium">Servidores e máquinas das lojas, em tempo real</p>
          </div>
          <button onClick={fetchOverview} className="ml-auto p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
            <RefreshCw className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Limites de Alerta</h2>
          <div className="grid grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Disco (%)</span>
              <input type="number" value={thresholdsForm.diskPercent} onChange={(e) => setThresholdsForm({ ...thresholdsForm, diskPercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Memória (%)</span>
              <input type="number" value={thresholdsForm.memPercent} onChange={(e) => setThresholdsForm({ ...thresholdsForm, memPercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-zinc-400">Offline após (min)</span>
              <input type="number" value={thresholdsForm.offlineMinutes} onChange={(e) => setThresholdsForm({ ...thresholdsForm, offlineMinutes: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-black dark:text-white" />
            </label>
          </div>
          <button onClick={() => saveMonitoringThresholds(thresholdsForm)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors">
            <Save className="w-3.5 h-3.5" /> Salvar limites
          </button>
        </div>

        {!overview ? (
          <p className="text-sm text-zinc-400">Carregando...</p>
        ) : overview.stores.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhuma máquina reportou ainda. Instale o agente nas lojas para começar a ver dados aqui.</p>
        ) : (
          <div className="space-y-3">
            {overview.stores.map((s) => (
              <StoreSection key={s.cnpj} store={s} onOpenMachine={setSelectedMachine} />
            ))}
          </div>
        )}
      </div>

      {selectedMachine && <MachineHistoryPanel machine={selectedMachine} onClose={() => setSelectedMachine(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: Implementar o gráfico de histórico usando a skill `dataviz`**

Dentro de `MachineHistoryPanel`, substitui o placeholder `<div />` (comentário "IMPLEMENTADO NA TASK 7...") por um gráfico de linha SVG com 3 séries (CPU/RAM/disco) a partir do array `points`, seguindo a paleta e as diretrizes da skill `dataviz` (invoque a skill antes de escrever esse trecho). Eixo Y fixo de 0 a 100%, eixo X = `points[].timestamp`.

- [ ] **Step 4: Roteamento da view em `src/App.tsx`**

Import (junto dos outros componentes, perto de `import SmartHelpDashboard from './components/SmartHelpDashboard';`):

```typescript
import MonitoringDashboard from './components/MonitoringDashboard';
```

Depois do bloco `if (currentView === 'smarthelp' && userRole === 'admin') { return <SmartHelpDashboard />; }`:

```typescript
    if (currentView === 'monitoring' && userRole === 'admin') {
      return <MonitoringDashboard />;
    }
```

- [ ] **Step 5: Cards ao vivo em `SmartHelpDashboard.tsx`**

Adiciona um hook local (mesmo padrão de `useTefStatus`, definido no mesmo arquivo, antes do componente `SmartHelpDashboard`):

```typescript
function useMonitoringOverview() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('/api/monitoring/overview', { headers: { 'x-api-token': API_SECRET } });
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error('Erro ao carregar visão geral do monitoramento:', e);
      }
    };
    fetchOverview();
    const interval = setInterval(fetchOverview, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
```

Usa a mesma constante `API_SECRET` já definida no topo do arquivo (linha 9, `const API_SECRET = import.meta.env.VITE_API_SECRET || 'smartprice-api-2026';`) — mesmo padrão de `useTefStatus`, logo acima.

Dentro do componente `SmartHelpDashboard`, adiciona a chamada do hook e troca o array de 4 placeholders (linhas 239-250) por 2 cards ao vivo + 2 placeholders:

```tsx
  const monitoringOverview = useMonitoringOverview();
```

```tsx
            <button
              onClick={() => setView('monitoring')}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border transition-all hover:shadow-md",
                monitoringOverview?.hasActiveAlert ? "border-red-300 dark:border-red-900/50" : "border-zinc-200 dark:border-zinc-700"
              )}
            >
              <Server className={cn("w-6 h-6", monitoringOverview?.hasActiveAlert ? "text-red-600" : "text-emerald-600")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Servidores</span>
              <span className="text-[9px] text-zinc-400">
                {monitoringOverview ? `${monitoringOverview.serverOnline}/${monitoringOverview.serverTotal} online` : 'Carregando...'}
              </span>
            </button>
            <button
              onClick={() => setView('monitoring')}
              className={cn(
                "flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border transition-all hover:shadow-md",
                monitoringOverview?.hasActiveAlert ? "border-red-300 dark:border-red-900/50" : "border-zinc-200 dark:border-zinc-700"
              )}
            >
              <HardDrive className={cn("w-6 h-6", monitoringOverview?.hasActiveAlert ? "text-red-600" : "text-emerald-600")} />
              <span className="text-[10px] font-black uppercase tracking-widest text-black dark:text-white">Máquinas</span>
              <span className="text-[9px] text-zinc-400">
                {monitoringOverview ? `${monitoringOverview.machineOnline}/${monitoringOverview.machineTotal} online` : 'Carregando...'}
              </span>
            </button>
            {[
              { icon: Printer, label: 'Impressoras' },
              { icon: Wifi, label: 'Provedor' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 text-zinc-400">
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                <span className="text-[9px] text-zinc-400">Em construção</span>
              </div>
            ))}
```

- [ ] **Step 6: Rodar o typecheck**

Run: `npm run lint` — Expected: sem erros.

- [ ] **Step 7: Testar no navegador**

Com a máquina de teste da Task 1 já reportando: abrir SmartHelp → confirmar que os cards Servidores/Máquinas mostram contagem real (não "Em construção") → clicar em qualquer um → confirmar que abre a tela de Monitoramento, lista a loja de teste, expande mostrando a máquina "Caixa 1" → clicar na máquina → confirma que abre o histórico com o gráfico (mesmo que só 1-2 pontos ainda). Editar os limites de alerta e confirmar que salvam (F5 e continuam lá).

- [ ] **Step 8: Commit**

```bash
git add src/store.ts src/App.tsx src/components/MonitoringDashboard.tsx src/components/SmartHelpDashboard.tsx
git commit -m "feat: tela de monitoramento e cards ao vivo de servidor/maquinas no SmartHelp"
```

---

### Task 8: Agente PowerShell

**Files:**
- Create: `scripts/monitoring-agent/smartprice-monitor-agent.ps1`
- Create: `scripts/monitoring-agent/smartprice-monitor.json.example`

**Interfaces:**
- Consumes: `POST /api/monitoring/report` (Task 1).

- [ ] **Step 1: Criar o template de configuração**

`scripts/monitoring-agent/smartprice-monitor.json.example`:

```json
{
  "storeCnpj": "00000000000000",
  "monitoringToken": "COLE_AQUI_O_TOKEN_GERADO_NO_PAINEL_GERENCIAR_USUARIOS",
  "machineName": "Caixa 1",
  "role": "workstation"
}
```

- [ ] **Step 2: Criar o script do agente**

`scripts/monitoring-agent/smartprice-monitor-agent.ps1`:

```powershell
# ─────────────────────────────────────────
# smartprice-monitor-agent.ps1
# Le smartprice-monitor.json (mesma pasta), coleta CPU/RAM/disco e envia pro
# SmartPrice. Agendar no Agendador de Tarefas do Windows pra rodar a cada 1
# minuto. Nao precisa de nada instalado alem do PowerShell (nativo do Windows).
# ─────────────────────────────────────────

$configPath = Join-Path $PSScriptRoot 'smartprice-monitor.json'
if (-not (Test-Path $configPath)) {
  Write-Output "Arquivo de configuracao nao encontrado: $configPath"
  exit 1
}

try {
  $config = Get-Content $configPath -Raw | ConvertFrom-Json

  $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $os = Get-CimInstance Win32_OperatingSystem
  $memPercent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 1)
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $diskPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)

  $body = @{
    machineName = $config.machineName
    role        = $config.role
    cpuPercent  = $cpu
    memPercent  = $memPercent
    diskPercent = $diskPercent
  } | ConvertTo-Json

  Invoke-RestMethod -Uri 'https://sistemasmartprice.com.br/api/monitoring/report' `
    -Method Post `
    -Headers @{ 'x-monitoring-token' = $config.monitoringToken } `
    -ContentType 'application/json' `
    -Body $body `
    -TimeoutSec 15 | Out-Null
} catch {
  # Falha de rede/servidor nao deve travar a tarefa agendada nem gerar popup.
  Write-Output "Falha ao enviar metricas: $($_.Exception.Message)"
}
```

- [ ] **Step 3: Testar de verdade nesta máquina (Windows) contra o servidor local**

```bash
# 1. Sobe o servidor local (se ainda nao estiver rodando)
npm run dev
```

Cria um `smartprice-monitor.json` real (fora do controle de versão, só pra teste) copiando o `.example` e ajustando `monitoringToken` pro token de teste já inserido na Task 1 (`token-teste-123`) e a URL do script pra `http://localhost:3000/api/monitoring/report` (edite temporariamente a linha `-Uri` do script pra testar local; depois do teste, reverta pra `https://sistemasmartprice.com.br/...`).

```powershell
Copy-Item scripts/monitoring-agent/smartprice-monitor.json.example scripts/monitoring-agent/smartprice-monitor.json
# edite o monitoringToken pra "token-teste-123" e o machineName pra "Teste Agente Real"
powershell -File scripts/monitoring-agent/smartprice-monitor-agent.ps1
```

Confirme no Postgres que uma nova amostra apareceu com CPU/RAM/disco **reais** desta máquina:

```bash
docker exec -it smartprice_postgres_local psql -U smartprice -d smartprice -c "SELECT machine_name, last_cpu_percent, last_mem_percent, last_disk_percent, last_seen_at FROM monitored_machines WHERE machine_name = 'Teste Agente Real';"
```

Expected: linha aparece com valores plausíveis de CPU/RAM/disco desta máquina (não zero, não erro). Depois do teste, delete `scripts/monitoring-agent/smartprice-monitor.json` (é local, não deve ir pro git) e reverta a URL do script de volta pra produção.

- [ ] **Step 4: Adicionar `smartprice-monitor.json` ao `.gitignore`**

Em `.gitignore`, junto de `.env*`:

```
scripts/monitoring-agent/smartprice-monitor.json
```

- [ ] **Step 5: Commit**

```bash
git add scripts/monitoring-agent/smartprice-monitor-agent.ps1 scripts/monitoring-agent/smartprice-monitor.json.example .gitignore
git commit -m "feat: agente PowerShell de coleta de CPU/RAM/disco para as lojas"
```

---

## Rollout (depois de todas as tasks acima mergeadas)

1. Deploy pra VPS (mesmo fluxo já usado — push pra `main` dispara o GitHub Actions).
2. Configurar `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` no `.env` da VPS.
3. Gerar o token de monitoramento de **uma** loja piloto em Gerenciar Usuários.
4. Instalar `smartprice-monitor-agent.ps1` + `smartprice-monitor.json` (com o token da loja piloto) em 2-3 máquinas dessa loja, agendadas no Agendador de Tarefas a cada 1 minuto.
5. Acompanhar por alguns dias: `SystemStats.tsx` (CPU/RAM/disco da própria VPS) continua estável, e a tela de Monitoramento mostra os dados da loja piloto corretamente.
6. Gerar token e expandir gradualmente para as outras 9 lojas.
