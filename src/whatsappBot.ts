// ─────────────────────────────────────────
// whatsappBot.ts — webhook da Meta Cloud API pra captura de nota de despesa
// de viagem por foto. Fase 4: caminho feliz foto -> despesa extraída -> card.
// Comandos por texto e loop de confirmação são da fase 5.
// Pool próprio (padrão do src/monitoring.ts).
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { verificarAssinatura, parseWebhookPayload, type MensagemRecebida } from './lib/whatsappWebhook';
import { salvarRecibo } from './lib/recibos';
import { extrairRecibo, IANaoConfiguradaError } from './lib/reciboExtract';

const router = Router();
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v22.0'}`;
const cfgOk = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APP_SECRET);

export async function ensureWhatsappSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      telefone         TEXT PRIMARY KEY,
      nome             TEXT,
      autorizado       BOOLEAN NOT NULL DEFAULT false,
      viagem_ativa_id  UUID,
      estado           JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_inbound_log (
      id            BIGSERIAL PRIMARY KEY,
      message_id    TEXT UNIQUE,
      telefone      TEXT,
      tipo          TEXT,
      payload       JSONB,
      processado_em TIMESTAMPTZ
    );
  `);
  const nums = (process.env.WHATSAPP_ALLOWED_NUMBERS || '')
    .split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean);
  for (const n of nums) {
    await pool.query(
      `INSERT INTO whatsapp_sessions (telefone, autorizado) VALUES ($1, true)
       ON CONFLICT (telefone) DO UPDATE SET autorizado = true`,
      [n],
    );
  }
}

async function enviarTexto(telefone: string, texto: string) {
  if (!cfgOk()) return;
  await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'text', text: { body: texto } }),
  }).catch((e) => console.error('[whatsapp] enviarTexto:', e));
}

async function baixarMidia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const meta: any = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  }).then((r) => r.json());
  if (!meta?.url) throw new Error('mídia sem URL');
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
  const mime = bin.headers.get('content-type') || meta.mime_type || 'image/jpeg';
  const buffer = Buffer.from(await bin.arrayBuffer());
  return { buffer, mime };
}

const rotulo: Record<string, string> = {
  combustivel: 'Combustível', pedagio: 'Pedágio', refeicao: 'Refeição',
  hospedagem: 'Hospedagem', estacionamento: 'Estacionamento', manutencao: 'Manutenção', outros: 'Outros',
};
const brl = (c: number | null) =>
  c == null ? 'valor não lido' : 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function sessao(telefone: string) {
  const r = await pool.query(
    `INSERT INTO whatsapp_sessions (telefone) VALUES ($1)
     ON CONFLICT (telefone) DO UPDATE SET updated_at = now() RETURNING *`,
    [telefone],
  );
  return r.rows[0];
}

async function viagemAbertaDoRemetente(telefone: string) {
  const r = await pool.query(
    `SELECT id, titulo FROM viagens_despesa
      WHERE status = 'aberta' AND (criada_por = $1 OR criada_por IS NULL OR criada_por = 'admin')
      ORDER BY created_at DESC`,
    [telefone],
  );
  return r.rows.length === 1 ? r.rows[0] : null;
}

async function recalcularTotal(viagemId: string) {
  await pool.query(
    `UPDATE viagens_despesa
        SET total_centavos = COALESCE((SELECT SUM(valor_centavos) FROM despesas_viagem WHERE viagem_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [viagemId],
  );
}

async function processar(msg: MensagemRecebida, payload: any) {
  // dedup por message_id
  const dup = await pool.query(
    `INSERT INTO whatsapp_inbound_log (message_id, telefone, tipo, payload)
     VALUES ($1,$2,$3,$4) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
    [msg.messageId, msg.from, msg.tipo, payload],
  );
  if (dup.rowCount === 0) return;

  const s = await sessao(msg.from);
  if (!s.autorizado) {
    await enviarTexto(msg.from, 'Número não autorizado a lançar despesas de viagem.');
    return;
  }

  if (msg.tipo !== 'image') {
    await enviarTexto(
      msg.from,
      'Manda a *foto da nota* com uma linha do que é (ex.: "abastecimento"). ' +
      'Abrir/fechar viagem e confirmar valores é pelo SmartPrice por enquanto.',
    );
    return;
  }

  const viagem = await viagemAbertaDoRemetente(msg.from);
  if (!viagem) {
    await enviarTexto(
      msg.from,
      'Você não tem exatamente uma viagem *aberta*. Abra ou escolha a viagem no SmartPrice ' +
      '(Financeiro › Viagens) e reenvie a foto.',
    );
    return;
  }

  let despesaId: string;
  try {
    const { buffer, mime } = await baixarMidia(msg.imageId!);
    const key = await salvarRecibo(buffer, mime, viagem.id);
    const ins = await pool.query(
      `INSERT INTO despesas_viagem (viagem_id, categoria, data_despesa, recibo_key, origem, ia_status, criado_por)
       VALUES ($1, 'outros', CURRENT_DATE, $2, 'whatsapp', 'pendente', $3) RETURNING id`,
      [viagem.id, key, msg.from],
    );
    despesaId = ins.rows[0].id;
  } catch (e: any) {
    console.error('[whatsapp] falha ao salvar recibo:', e);
    await enviarTexto(msg.from, 'Recebi a foto mas não consegui guardar. Tenta de novo daqui a pouco.');
    return;
  }

  await recalcularTotal(viagem.id);
  await enviarTexto(msg.from, `📸 Recebi a nota da viagem "${viagem.titulo}". Lendo…`);

  try {
    const { buffer } = await baixarMidia(msg.imageId!);
    const r = await extrairRecibo(buffer.toString('base64'), 'image/jpeg', msg.caption);
    await pool.query(
      `UPDATE despesas_viagem SET
         categoria = $1, valor_centavos = $2, data_despesa = COALESCE($3::date, data_despesa),
         estabelecimento = $4, documento_numero = $5, litros = $6, km_veiculo = $7,
         ia_status = 'extraido', ia_confianca = $8, ia_raw = $9, updated_at = now()
       WHERE id = $10`,
      [
        r.categoria, r.valorCentavos, r.dataDespesa, r.estabelecimento, r.documentoNumero,
        r.litros, r.kmVeiculo, r.confianca, JSON.stringify(r), despesaId,
      ],
    );
    await recalcularTotal(viagem.id);
    const dt = r.dataDespesa ? r.dataDespesa.split('-').reverse().join('/') : 's/ data';
    await enviarTexto(
      msg.from,
      `✅ ${rotulo[r.categoria] || r.categoria} · ${brl(r.valorCentavos)} · ` +
      `${r.estabelecimento || 's/ estabelecimento'} · ${dt}` +
      (r.confianca === 'baixa'
        ? '\n⚠️ leitura incerta — confira no SmartPrice.'
        : '\nConfira e ajuste no SmartPrice se precisar.'),
    );
  } catch (e: any) {
    const msgErr = e instanceof IANaoConfiguradaError
      ? 'A leitura automática está desligada. Lança o valor no SmartPrice.'
      : 'Não consegui ler a nota. O recibo foi salvo; lança o valor no SmartPrice.';
    await enviarTexto(msg.from, msgErr);
  }
}

// ── GET /webhook — verificação da Meta ──
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge ?? ''));
  }
  res.sendStatus(403);
});

// ── POST /webhook — mensagens ──
router.post('/webhook', (req: Request, res: Response) => {
  if (!cfgOk()) return res.status(503).json({ error: 'WhatsApp não configurado' });
  const cru = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body));
  if (!verificarAssinatura(cru, req.header('x-hub-signature-256'), process.env.WHATSAPP_APP_SECRET!)) {
    return res.sendStatus(401);
  }
  res.sendStatus(200); // ack imediato
  const msgs = parseWebhookPayload(req.body);
  for (const m of msgs) {
    processar(m, req.body).catch((e) => console.error('[whatsapp] processar:', e));
  }
});

export default router;
