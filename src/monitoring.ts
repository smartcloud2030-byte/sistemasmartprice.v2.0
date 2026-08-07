// ─────────────────────────────────────────
// monitoring.ts — Monitoramento de servidor/máquinas das lojas
// Recebe métricas do agente PowerShell instalado em cada máquina.
// Pool próprio (mesmo padrão de src/payments.ts) — evita import circular
// com api.ts.
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import type { Server } from 'socket.io';
import { evaluateAlertState, alertStateLabel, MonitoringThresholds } from './lib/monitoringStatus';

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

async function getThresholds(): Promise<MonitoringThresholds> {
  const result = await pool.query("SELECT value FROM settings WHERE id = 'monitoring_thresholds'");
  const stored = result.rows[0]?.value;
  return {
    diskPercent: stored?.diskPercent ?? 90,
    memPercent: stored?.memPercent ?? 90,
    offlineMinutes: stored?.offlineMinutes ?? 5,
  };
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

export { pool, apiAuth };
export default router;
