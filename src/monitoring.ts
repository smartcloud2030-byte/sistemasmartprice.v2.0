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
