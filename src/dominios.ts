// Domínios do José (dos sistemas e dos clientes) com a data de vencimento do
// registro, pra o painel avisar antes de expirar. Só admin vê e mexe.
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { exigirAdmin } from './lib/sessao';
import { normalizarDominio, dominioValido } from './lib/dominios';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

const router = Router();

export async function ensureDominiosSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dominios (
      id SERIAL PRIMARY KEY,
      dominio TEXT NOT NULL UNIQUE,
      vencimento DATE NOT NULL,
      registrador TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // e-mail da conta do registrador onde o domínio é renovado
  await pool.query(`ALTER TABLE dominios ADD COLUMN IF NOT EXISTS conta TEXT`);
}

const COLUNAS = `id, dominio, to_char(vencimento, 'YYYY-MM-DD') AS vencimento, registrador, conta`;

type DadosDominio = { dominio: string; vencimento: string; registrador: string | null; conta: string | null };

function lerCorpo(body: any): DadosDominio | string {
  const dominio = normalizarDominio(String(body?.dominio ?? ''));
  const vencimento = String(body?.vencimento ?? '').slice(0, 10);
  const registrador = String(body?.registrador ?? '').trim().slice(0, 60) || null;
  const conta = String(body?.conta ?? '').trim().toLowerCase().slice(0, 120) || null;
  if (!dominioValido(dominio)) return 'Domínio inválido. Ex.: meusite.com.br';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || isNaN(Date.parse(vencimento))) return 'Informe a data de vencimento.';
  if (conta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(conta)) return 'E-mail da conta inválido.';
  return { dominio, vencimento, registrador, conta };
}

router.get('/', exigirAdmin, async (_req: Request, res: Response) => {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM dominios ORDER BY vencimento, dominio`);
  res.json(rows);
});

router.post('/', exigirAdmin, async (req: Request, res: Response) => {
  const dados = lerCorpo(req.body);
  if (typeof dados === 'string') return res.status(400).json({ error: dados });
  try {
    const { rows } = await pool.query(
      `INSERT INTO dominios (dominio, vencimento, registrador, conta) VALUES ($1, $2, $3, $4) RETURNING ${COLUNAS}`,
      [dados.dominio, dados.vencimento, dados.registrador, dados.conta],
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esse domínio já está cadastrado.' });
    throw err;
  }
});

router.put('/:id', exigirAdmin, async (req: Request, res: Response) => {
  const dados = lerCorpo(req.body);
  if (typeof dados === 'string') return res.status(400).json({ error: dados });
  try {
    const { rows } = await pool.query(
      `UPDATE dominios SET dominio = $1, vencimento = $2, registrador = $3, conta = $4 WHERE id = $5 RETURNING ${COLUNAS}`,
      [dados.dominio, dados.vencimento, dados.registrador, dados.conta, Number(req.params.id)],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Domínio não encontrado.' });
    res.json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Esse domínio já está cadastrado.' });
    throw err;
  }
});

router.delete('/:id', exigirAdmin, async (req: Request, res: Response) => {
  await pool.query('DELETE FROM dominios WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

export default router;
