// ─────────────────────────────────────────
// despesasViagem.ts — Despesas de viagem (reembolso Ultra Popular).
// Schema + CRUD de viagens/despesas, extração por IA e geração do relatório
// (PDF/Excel — src/lib/despesasViagemFiles.ts), usado por esta rota e pelo
// bot do WhatsApp (fecharViagem em src/whatsappBot.ts).
// Pool próprio (mesmo padrão de src/monitoring.ts) — evita import circular
// com api.ts.
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { CATEGORIAS_VALIDAS, STATUS_VALIDOS, type ItemDespesa } from './lib/despesasViagemReport';
import { extrairRecibo, IANaoConfiguradaError } from './lib/reciboExtract';
import { assinarRecibo, conferirAssinaturaRecibo, salvarRelatorio, statRecibo, streamRecibo } from './lib/recibos';
import {
  gerarRelatorioPDF, gerarRelatorioXLSX, nomeArquivoRelatorio,
  type ReciboAnexo, type ViagemParaRelatorio,
} from './lib/despesasViagemFiles';

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

export async function ensureDespesasViagemSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS viagens_despesa (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo         TEXT NOT NULL,
      destino        TEXT,
      motivo         TEXT,
      empresa        TEXT NOT NULL DEFAULT 'Ultra Popular',
      data_inicio    DATE,
      data_fim       DATE,
      status         TEXT NOT NULL DEFAULT 'aberta',
      criada_por     TEXT,
      observacoes    TEXT,
      total_centavos BIGINT NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS despesas_viagem (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      viagem_id        UUID NOT NULL REFERENCES viagens_despesa(id) ON DELETE CASCADE,
      categoria        TEXT NOT NULL DEFAULT 'outros',
      descricao        TEXT,
      valor_centavos   BIGINT NOT NULL,
      data_despesa     DATE NOT NULL,
      estabelecimento  TEXT,
      documento_numero TEXT,
      km_veiculo       INTEGER,
      litros           NUMERIC(8,3),
      recibo_key       TEXT,
      origem           TEXT NOT NULL DEFAULT 'manual',
      ia_status        TEXT NOT NULL DEFAULT 'pendente',
      ia_confianca     TEXT,
      ia_raw           JSONB,
      criado_por       TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_viagem_viagem ON despesas_viagem(viagem_id);`);
  // Despesa criada por foto (WhatsApp) nasce sem valor — preenchido pela extração.
  await pool.query(`ALTER TABLE despesas_viagem ALTER COLUMN valor_centavos DROP NOT NULL;`).catch(() => {});
}

async function recalcularTotal(viagemId: string) {
  await pool.query(
    `UPDATE viagens_despesa
        SET total_centavos = COALESCE(
              (SELECT SUM(valor_centavos) FROM despesas_viagem WHERE viagem_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [viagemId]
  );
}

function parseCentavos(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.round(Number(v));
  return null;
}

// Colunas explícitas nos SELECT de leitura: `::text` formata a DATE no
// Postgres (YYYY-MM-DD) e evita o Date do driver `pg` + shift de fuso no
// JSON.stringify.
const VIAGEM_SELECT = `id, titulo, destino, motivo, empresa,
  data_inicio::text AS data_inicio, data_fim::text AS data_fim,
  status, criada_por, observacoes, total_centavos, created_at, updated_at`;

const DESPESA_SELECT = `id, viagem_id, categoria, descricao, valor_centavos,
  data_despesa::text AS data_despesa, estabelecimento, documento_numero,
  km_veiculo, litros, recibo_key, origem, ia_status, ia_confianca, ia_raw,
  criado_por, created_at, updated_at`;

// ── Viagens ──────────────────────────────

router.get('/viagens', apiAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const params: any[] = [];
    let where = '';
    if (typeof status === 'string' && (STATUS_VALIDOS as readonly string[]).includes(status)) {
      params.push(status);
      where = 'WHERE status = $1';
    }
    const result = await pool.query(
      `SELECT ${VIAGEM_SELECT},
              (SELECT COUNT(*)::int FROM despesas_viagem d WHERE d.viagem_id = viagens_despesa.id) AS qtd_despesas
         FROM viagens_despesa
         ${where}
        ORDER BY created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/viagens', apiAuth, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.titulo || !String(b.titulo).trim()) return res.status(400).json({ error: 'titulo é obrigatório' });
    const result = await pool.query(
      `INSERT INTO viagens_despesa (titulo, destino, motivo, data_inicio, data_fim, observacoes, criada_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(b.titulo).trim(), b.destino || null, b.motivo || null,
        b.data_inicio || null, b.data_fim || null, b.observacoes || null, b.criada_por || 'admin',
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const viagem = await pool.query(`SELECT ${VIAGEM_SELECT} FROM viagens_despesa WHERE id = $1`, [req.params.id]);
    if (viagem.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    const despesas = await pool.query(
      `SELECT ${DESPESA_SELECT} FROM despesas_viagem WHERE viagem_id = $1 ORDER BY data_despesa ASC, created_at ASC`,
      [req.params.id]
    );
    const despesasComUrl = despesas.rows.map((d: any) => ({
      ...d,
      recibo_url: d.recibo_key ? `/api/despesas-viagem/recibo/${d.id}?k=${assinarRecibo(d.id)}` : null,
    }));
    res.json({ ...viagem.rows[0], despesas: despesasComUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const campos = ['titulo', 'destino', 'motivo', 'empresa', 'data_inicio', 'data_fim', 'observacoes', 'status'];
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    for (const c of campos) {
      if (!(c in b)) continue;
      if (c === 'status' && !(STATUS_VALIDOS as readonly string[]).includes(b[c])) {
        return res.status(400).json({ error: `status inválido (use ${STATUS_VALIDOS.join(', ')})` });
      }
      vals.push(b[c] === '' ? null : b[c]);
      sets.push(`${c} = $${vals.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE viagens_despesa SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/viagens/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM viagens_despesa WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Despesas ─────────────────────────────

router.post('/viagens/:id/despesas', apiAuth, async (req: Request, res: Response) => {
  try {
    const viagem = await pool.query('SELECT id FROM viagens_despesa WHERE id = $1', [req.params.id]);
    if (viagem.rowCount === 0) return res.status(404).json({ error: 'Viagem não encontrada' });

    const b = req.body || {};
    const valorCentavos = parseCentavos(b.valor_centavos);
    if (valorCentavos === null || valorCentavos <= 0) {
      return res.status(400).json({ error: 'valor_centavos precisa ser um inteiro > 0' });
    }
    if (!b.data_despesa) return res.status(400).json({ error: 'data_despesa é obrigatória' });
    const categoria = (CATEGORIAS_VALIDAS as readonly string[]).includes(b.categoria) ? b.categoria : 'outros';

    const result = await pool.query(
      `INSERT INTO despesas_viagem
         (viagem_id, categoria, descricao, valor_centavos, data_despesa, estabelecimento,
          documento_numero, km_veiculo, litros, recibo_key, origem, ia_status, ia_confianca, ia_raw, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        req.params.id, categoria, b.descricao || null, valorCentavos, b.data_despesa,
        b.estabelecimento || null, b.documento_numero || null,
        b.km_veiculo ?? null, b.litros ?? null, b.recibo_key || null,
        b.origem || 'manual', b.ia_status || 'revisado', b.ia_confianca || null,
        b.ia_raw ? JSON.stringify(b.ia_raw) : null, b.criado_por || 'admin',
      ]
    );
    await recalcularTotal(req.params.id);
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/despesas/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const atual = await pool.query('SELECT viagem_id FROM despesas_viagem WHERE id = $1', [req.params.id]);
    if (atual.rowCount === 0) return res.status(404).json({ error: 'Despesa não encontrada' });

    const campos = ['categoria', 'descricao', 'valor_centavos', 'data_despesa', 'estabelecimento',
      'documento_numero', 'km_veiculo', 'litros', 'recibo_key', 'ia_status', 'ia_confianca'];
    const b = req.body || {};
    const sets: string[] = [];
    const vals: any[] = [];
    for (const c of campos) {
      if (!(c in b)) continue;
      let v = b[c];
      if (c === 'categoria' && !(CATEGORIAS_VALIDAS as readonly string[]).includes(v)) {
        return res.status(400).json({ error: `categoria inválida (use ${CATEGORIAS_VALIDAS.join(', ')})` });
      }
      if (c === 'valor_centavos') {
        const n = parseCentavos(v);
        if (n === null || n <= 0) return res.status(400).json({ error: 'valor_centavos precisa ser um inteiro > 0' });
        v = n;
      }
      vals.push(v === '' ? null : v);
      sets.push(`${c} = $${vals.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    vals.push(req.params.id);
    const result = await pool.query(
      `UPDATE despesas_viagem SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    await recalcularTotal(atual.rows[0].viagem_id);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/despesas/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('DELETE FROM despesas_viagem WHERE id = $1 RETURNING viagem_id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Despesa não encontrada' });
    await recalcularTotal(result.rows[0].viagem_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Extração de nota por foto (stateless: não cria despesa nem guarda imagem) ──
router.post('/extrair', apiAuth, async (req: Request, res: Response) => {
  try {
    const { imagemBase64, mediaType, dica } = req.body || {};
    if (!imagemBase64 || typeof imagemBase64 !== 'string') {
      return res.status(400).json({ error: 'imagemBase64 é obrigatória' });
    }
    const tipo = typeof mediaType === 'string' && mediaType.startsWith('image/') ? mediaType : 'image/jpeg';
    const resultado = await extrairRecibo(imagemBase64, tipo, typeof dica === 'string' ? dica : undefined);
    res.json(resultado);
  } catch (err: any) {
    if (err instanceof IANaoConfiguradaError) {
      return res.status(503).json({ error: err.message });
    }
    console.error('[despesas-viagem] falha na extração:', err);
    res.status(502).json({ error: `Não consegui ler a nota: ${err.message}` });
  }
});

// ── Stream do recibo (bucket privado). Autentica pela assinatura na query
//    (`<img>` não manda header), não por x-api-token. ──
router.get('/recibo/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!conferirAssinaturaRecibo(id, String(req.query.k || ''))) return res.sendStatus(403);
    const row = await pool.query('SELECT recibo_key FROM despesas_viagem WHERE id = $1', [id]);
    const key = row.rows[0]?.recibo_key;
    if (!key) return res.sendStatus(404);
    const stat = await statRecibo(key);
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    (await streamRecibo(key)).pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Relatório (PDF/Excel) ────────────────

interface DespesaComRecibo {
  recibo_key: string;
  categoria: string;
  valorCentavos: number | null;
  estabelecimento: string | null;
}
interface DadosRelatorioViagem {
  viagem: ViagemParaRelatorio & { id: string };
  itens: ItemDespesa[];
  despesasComRecibo: DespesaComRecibo[];
}

async function carregarDadosRelatorio(viagemId: string): Promise<DadosRelatorioViagem | null> {
  const viagemRes = await pool.query(`SELECT ${VIAGEM_SELECT} FROM viagens_despesa WHERE id = $1`, [viagemId]);
  if (viagemRes.rowCount === 0) return null;
  const v = viagemRes.rows[0];
  const despesasRes = await pool.query(
    `SELECT categoria, descricao, valor_centavos, data_despesa::text AS data_despesa, estabelecimento, recibo_key
       FROM despesas_viagem WHERE viagem_id = $1 ORDER BY data_despesa ASC, created_at ASC`,
    [viagemId]
  );
  const itens: ItemDespesa[] = despesasRes.rows
    .filter((d: any) => d.valor_centavos != null)
    .map((d: any) => ({
      categoria: d.categoria,
      descricao: d.descricao,
      valorCentavos: Number(d.valor_centavos),
      dataDespesa: d.data_despesa,
      estabelecimento: d.estabelecimento,
    }));
  const despesasComRecibo: DespesaComRecibo[] = despesasRes.rows
    .filter((d: any) => d.recibo_key)
    .map((d: any) => ({
      recibo_key: d.recibo_key,
      categoria: d.categoria,
      valorCentavos: d.valor_centavos == null ? null : Number(d.valor_centavos),
      estabelecimento: d.estabelecimento,
    }));
  return {
    viagem: {
      id: v.id, titulo: v.titulo, destino: v.destino, motivo: v.motivo,
      empresa: v.empresa, dataInicio: v.data_inicio, dataFim: v.data_fim,
    },
    itens,
    despesasComRecibo,
  };
}

async function baixarRecibosParaPdf(despesas: DespesaComRecibo[]): Promise<ReciboAnexo[]> {
  const recibos: ReciboAnexo[] = [];
  for (const d of despesas) {
    try {
      const chunks: Buffer[] = [];
      const stream = await streamRecibo(d.recibo_key);
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      recibos.push({
        buffer: Buffer.concat(chunks), categoria: d.categoria,
        valorCentavos: d.valorCentavos, estabelecimento: d.estabelecimento,
      });
    } catch (e) {
      console.error('[despesas-viagem] falha ao baixar recibo pro PDF:', e);
    }
  }
  return recibos;
}

export async function gerarArquivoRelatorio(
  viagemId: string,
  formato: 'pdf' | 'xlsx'
): Promise<{ buffer: Buffer; contentType: string; nomeArquivo: string } | null> {
  const dados = await carregarDadosRelatorio(viagemId);
  if (!dados) return null;
  const nomeArquivo = nomeArquivoRelatorio(dados.viagem, formato);

  if (formato === 'xlsx') {
    const buffer = gerarRelatorioXLSX(dados.viagem, dados.itens);
    const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await salvarRelatorio(buffer, contentType, viagemId, nomeArquivo).catch((e) =>
      console.error('[despesas-viagem] falha ao guardar cópia do relatório:', e)
    );
    return { buffer, contentType, nomeArquivo };
  }

  const recibos = await baixarRecibosParaPdf(dados.despesasComRecibo);
  const buffer = await gerarRelatorioPDF(dados.viagem, dados.itens, recibos);
  const contentType = 'application/pdf';
  await salvarRelatorio(buffer, contentType, viagemId, nomeArquivo).catch((e) =>
    console.error('[despesas-viagem] falha ao guardar cópia do relatório:', e)
  );
  return { buffer, contentType, nomeArquivo };
}

router.post('/viagens/:id/relatorio', apiAuth, async (req: Request, res: Response) => {
  try {
    const formatoQuery = req.query.formato;
    const formato = formatoQuery === 'pdf' || formatoQuery === 'xlsx' ? formatoQuery : null;
    if (!formato) return res.status(400).json({ error: 'formato deve ser "pdf" ou "xlsx"' });

    const resultado = await gerarArquivoRelatorio(req.params.id, formato);
    if (!resultado) return res.status(404).json({ error: 'Viagem não encontrada' });

    res.setHeader('Content-Type', resultado.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.nomeArquivo}"`);
    res.send(resultado.buffer);
  } catch (err: any) {
    console.error('[despesas-viagem] falha ao gerar relatório:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
