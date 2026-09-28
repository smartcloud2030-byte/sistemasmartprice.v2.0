// ─────────────────────────────────────────
// whatsappBot.ts — webhook da Meta Cloud API pra captura de nota de despesa
// de viagem por foto e a conversa em texto: nova viagem, listagem, fechar
// viagem (gera e envia PDF + Excel — fase 6), e o loop de
// confirmação/correção do card.
// Pool próprio (padrão do src/monitoring.ts).
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import FormData from 'form-data';
import { verificarAssinatura, parseWebhookPayload, type MensagemRecebida } from './lib/whatsappWebhook';
import { salvarRecibo } from './lib/recibos';
import { extrairRecibo, IANaoConfiguradaError, type ReciboExtraido } from './lib/reciboExtract';
import { centavosParaBRL, resumoPorCategoria } from './lib/despesasViagemReport';
import { gerarArquivoRelatorio } from './despesasViagem';
import {
  parseNovaViagem,
  tituloViagem,
  ehComandoListagem,
  ehComandoFechar,
  ehComandoFecharForcado,
  ehConfirmacao,
  parseCorrecao,
  matchViagem,
  formatarCard,
  listaViagensAbertas,
  type ViagemAberta,
} from './lib/whatsappComandos';

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

// ── Estado da conversa ──────────────────────
type Fase = 'ocioso' | 'aguardando_viagem' | 'aguardando_descricao' | 'confirmando';
interface EstadoConversa {
  fase: Fase;
  despesaPendenteId?: string;
  midiaPendente?: { mediaId: string; caption?: string };
}
const ESTADO_OCIOSO: EstadoConversa = { fase: 'ocioso' };

async function gravarEstado(telefone: string, estado: EstadoConversa) {
  await pool.query(`UPDATE whatsapp_sessions SET estado = $2::jsonb, updated_at = now() WHERE telefone = $1`, [
    telefone, JSON.stringify(estado),
  ]);
}
async function setViagemAtiva(telefone: string, viagemId: string | null) {
  await pool.query(
    `UPDATE whatsapp_sessions SET viagem_ativa_id = $2, updated_at = now() WHERE telefone = $1`,
    [telefone, viagemId],
  );
}

async function enviarTexto(telefone: string, texto: string) {
  if (!cfgOk()) return;
  await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'text', text: { body: texto } }),
  }).catch((e) => console.error('[whatsapp] enviarTexto:', e));
}

async function enviarDocumento(telefone: string, buffer: Buffer, contentType: string, filename: string) {
  if (!cfgOk()) return;
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', buffer, { filename, contentType });
    const upload: any = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...form.getHeaders() },
      body: form.getBuffer(),
    }).then((r) => r.json());
    if (!upload?.id) {
      console.error('[whatsapp] upload de mídia sem id:', upload);
      await enviarTexto(telefone, `Gerei o arquivo "${filename}" mas não consegui enviar por aqui. Baixa pela tela do SmartPrice.`);
      return;
    }
    await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: telefone, type: 'document',
        document: { id: upload.id, filename },
      }),
    });
  } catch (e) {
    console.error('[whatsapp] enviarDocumento:', e);
    await enviarTexto(telefone, `Gerei o arquivo "${filename}" mas não consegui enviar por aqui. Baixa pela tela do SmartPrice.`);
  }
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

async function sessao(telefone: string) {
  const r = await pool.query(
    `INSERT INTO whatsapp_sessions (telefone) VALUES ($1)
     ON CONFLICT (telefone) DO UPDATE SET updated_at = now() RETURNING *`,
    [telefone],
  );
  return r.rows[0];
}

function lerEstado(row: any): EstadoConversa {
  const e = row?.estado;
  if (e && typeof e === 'object' && typeof e.fase === 'string') return e as EstadoConversa;
  return ESTADO_OCIOSO;
}

async function viagensAbertasDoRemetente(telefone: string): Promise<ViagemAberta[]> {
  const r = await pool.query(
    `SELECT id, titulo, destino, total_centavos FROM viagens_despesa
      WHERE status = 'aberta' AND (criada_por = $1 OR criada_por IS NULL OR criada_por = 'admin')
      ORDER BY created_at DESC`,
    [telefone],
  );
  return r.rows;
}

// Viagem "corrente": a marcada na sessão (se ainda aberta), senão a única
// viagem aberta do remetente (compatibilidade com viagens criadas pela tela).
async function viagemCorrente(session: any, abertas: ViagemAberta[]): Promise<ViagemAberta | null> {
  if (session.viagem_ativa_id) {
    const achada = abertas.find((v) => v.id === session.viagem_ativa_id);
    if (achada) return achada;
  }
  return abertas.length === 1 ? abertas[0] : null;
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

// ── Foto: cria a despesa pendente e roda a extração ──
async function processarFoto(
  viagem: ViagemAberta,
  mediaId: string,
  caption: string | undefined,
  telefone: string,
) {
  let despesaId: string;
  try {
    const { buffer, mime } = await baixarMidia(mediaId);
    const key = await salvarRecibo(buffer, mime, viagem.id);
    const ins = await pool.query(
      `INSERT INTO despesas_viagem (viagem_id, categoria, data_despesa, recibo_key, origem, ia_status, criado_por)
       VALUES ($1, 'outros', CURRENT_DATE, $2, 'whatsapp', 'pendente', $3) RETURNING id`,
      [viagem.id, key, telefone],
    );
    despesaId = ins.rows[0].id;
  } catch (e: any) {
    console.error('[whatsapp] falha ao salvar recibo:', e);
    await enviarTexto(telefone, 'Recebi a foto mas não consegui guardar. Tenta de novo daqui a pouco.');
    return;
  }

  await recalcularTotal(viagem.id);
  await enviarTexto(telefone, `📸 Recebi a nota da viagem "${viagem.titulo}". Lendo…`);
  await gravarEstado(telefone, { fase: 'aguardando_descricao', despesaPendenteId: despesaId });

  let extraido: ReciboExtraido | null = null;
  try {
    const { buffer } = await baixarMidia(mediaId);
    extraido = await extrairRecibo(buffer.toString('base64'), 'image/jpeg', caption);
    await pool.query(
      `UPDATE despesas_viagem SET
         categoria = $1, valor_centavos = $2, data_despesa = COALESCE($3::date, data_despesa),
         estabelecimento = $4, documento_numero = $5, litros = $6, km_veiculo = $7,
         ia_status = 'extraido', ia_confianca = $8, ia_raw = $9, updated_at = now()
       WHERE id = $10`,
      [
        extraido.categoria, extraido.valorCentavos, extraido.dataDespesa, extraido.estabelecimento,
        extraido.documentoNumero, extraido.litros, extraido.kmVeiculo, extraido.confianca,
        JSON.stringify(extraido), despesaId,
      ],
    );
    await recalcularTotal(viagem.id);
  } catch (e: any) {
    const msgErr = e instanceof IANaoConfiguradaError
      ? 'A leitura automática está desligada. Manda "valor 245,90" (e ajuste categoria/data se quiser) que eu lanço.'
      : 'Não consegui ler a nota. Manda "valor 245,90" que eu lanço mesmo assim.';
    await enviarTexto(telefone, msgErr);
    await gravarEstado(telefone, { fase: 'confirmando', despesaPendenteId: despesaId });
    return;
  }

  await enviarTexto(telefone, formatarCard({
    categoria: extraido.categoria, valorCentavos: extraido.valorCentavos,
    estabelecimento: extraido.estabelecimento, dataDespesa: extraido.dataDespesa,
    confianca: extraido.confianca,
  }));
  await gravarEstado(telefone, { fase: 'confirmando', despesaPendenteId: despesaId });
}

async function pedirEscolhaDeViagem(telefone: string, abertas: ViagemAberta[], midia?: { mediaId: string; caption?: string }) {
  await gravarEstado(telefone, { fase: 'aguardando_viagem', midiaPendente: midia });
  const lista = abertas.length > 0 ? `\nSuas viagens abertas:\n${abertas.map((v) => `• ${v.titulo}`).join('\n')}` : '';
  await enviarTexto(
    telefone,
    `Pra qual viagem? Responde o nome dela, ou "nova viagem <destino> / <motivo>" pra abrir uma nova.${lista}`,
  );
}

async function fecharViagem(telefone: string, viagem: ViagemAberta) {
  const itens = await pool.query(
    `SELECT categoria, valor_centavos, data_despesa::text AS data_despesa FROM despesas_viagem WHERE viagem_id = $1`,
    [viagem.id],
  );
  await pool.query(
    `UPDATE viagens_despesa SET status = 'fechada', updated_at = now() WHERE id = $1`,
    [viagem.id],
  );
  await setViagemAtiva(telefone, null);
  await gravarEstado(telefone, ESTADO_OCIOSO);

  const linhasItens: { categoria: string; valorCentavos: number }[] = itens.rows
    .filter((r: any) => r.valor_centavos != null)
    .map((r: any) => ({ categoria: r.categoria, valorCentavos: Number(r.valor_centavos) }));
  const resumo = resumoPorCategoria(linhasItens.map((i) => ({ ...i, descricao: null, dataDespesa: '', estabelecimento: null })));
  const totalCentavos = linhasItens.reduce((s, i) => s + i.valorCentavos, 0);
  const linhasResumo = resumo.map((r) => `${r.rotulo}: ${centavosParaBRL(r.totalCentavos)} (${r.qtd})`).join('\n');
  await enviarTexto(
    telefone,
    `✅ Viagem "${viagem.titulo}" fechada.\n${linhasResumo}\nTotal: ${centavosParaBRL(totalCentavos)}\nGerando o relatório…`,
  );

  try {
    const [pdf, xlsx] = await Promise.all([
      gerarArquivoRelatorio(viagem.id, 'pdf'),
      gerarArquivoRelatorio(viagem.id, 'xlsx'),
    ]);
    if (pdf) await enviarDocumento(telefone, pdf.buffer, pdf.contentType, pdf.nomeArquivo);
    if (xlsx) await enviarDocumento(telefone, xlsx.buffer, xlsx.contentType, xlsx.nomeArquivo);
  } catch (e) {
    console.error('[whatsapp] falha ao gerar relatório da viagem:', e);
    await enviarTexto(telefone, 'Não consegui gerar o relatório agora. Baixa pela tela do SmartPrice ou manda "relatório" de novo.');
  }
}

// ── Roteamento principal ──
async function processar(msg: MensagemRecebida, payload: any) {
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

  const abertas = await viagensAbertasDoRemetente(msg.from);

  if (msg.tipo === 'image') {
    const corrente = await viagemCorrente(s, abertas);
    if (!corrente) {
      await pedirEscolhaDeViagem(msg.from, abertas, { mediaId: msg.imageId!, caption: msg.caption });
      return;
    }
    await setViagemAtiva(msg.from, corrente.id);
    await processarFoto(corrente, msg.imageId!, msg.caption, msg.from);
    return;
  }

  const texto = (msg.texto ?? '').trim();
  const estado = lerEstado(s);

  // 1) nova viagem
  const nova = parseNovaViagem(texto);
  if (nova) {
    const ins = await pool.query(
      `INSERT INTO viagens_despesa (titulo, destino, motivo, data_inicio, criada_por)
       VALUES ($1,$2,$3,CURRENT_DATE,$4) RETURNING id, titulo`,
      [tituloViagem(nova), nova.destino, nova.motivo, msg.from],
    );
    const viagem = ins.rows[0];
    await setViagemAtiva(msg.from, viagem.id);
    await enviarTexto(msg.from, `✅ Viagem "${viagem.titulo}" aberta. Manda as fotos das notas.`);
    if (estado.fase === 'aguardando_viagem' && estado.midiaPendente) {
      await gravarEstado(msg.from, ESTADO_OCIOSO);
      await processarFoto(viagem, estado.midiaPendente.mediaId, estado.midiaPendente.caption, msg.from);
    } else {
      await gravarEstado(msg.from, ESTADO_OCIOSO);
    }
    return;
  }

  // 2) escolhendo viagem pra uma foto pendurada
  if (estado.fase === 'aguardando_viagem') {
    const achada = matchViagem(texto, abertas);
    if (achada) {
      await setViagemAtiva(msg.from, achada.id);
      const midia = estado.midiaPendente;
      await gravarEstado(msg.from, ESTADO_OCIOSO);
      if (midia) await processarFoto(achada, midia.mediaId, midia.caption, msg.from);
      return;
    }
    await pedirEscolhaDeViagem(msg.from, abertas, estado.midiaPendente);
    return;
  }

  // 3) listagem
  if (ehComandoListagem(texto)) {
    await enviarTexto(msg.from, listaViagensAbertas(abertas));
    return;
  }

  // 4) fechar mesmo (força, ignora pendências)
  if (ehComandoFecharForcado(texto)) {
    const corrente = await viagemCorrente(s, abertas);
    if (!corrente) {
      await enviarTexto(msg.from, 'Você não tem viagem aberta pra fechar.');
      return;
    }
    await fecharViagem(msg.from, corrente);
    return;
  }

  // 5) fechar viagem / relatório
  if (ehComandoFechar(texto)) {
    const corrente = await viagemCorrente(s, abertas);
    if (!corrente) {
      await enviarTexto(msg.from, 'Você não tem viagem aberta pra fechar.');
      return;
    }
    const pendentes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM despesas_viagem
        WHERE viagem_id = $1 AND (ia_status IN ('pendente','erro') OR ia_confianca = 'baixa')`,
      [corrente.id],
    );
    const n = pendentes.rows[0].n;
    if (n > 0) {
      await enviarTexto(
        msg.from,
        `${n} ${n === 1 ? 'item sem valor confirmado' : 'itens sem valor confirmado'} — fecha assim mesmo? Responde "fechar mesmo".`,
      );
      return;
    }
    await fecharViagem(msg.from, corrente);
    return;
  }

  // 6) confirmação / correção do card
  if (estado.fase === 'confirmando' && estado.despesaPendenteId) {
    if (ehConfirmacao(texto)) {
      const d = await pool.query(
        `UPDATE despesas_viagem SET ia_status = 'revisado', updated_at = now()
          WHERE id = $1 RETURNING viagem_id`,
        [estado.despesaPendenteId],
      );
      if (d.rowCount) {
        await recalcularTotal(d.rows[0].viagem_id);
        const v = await pool.query(`SELECT titulo, total_centavos FROM viagens_despesa WHERE id = $1`, [d.rows[0].viagem_id]);
        await enviarTexto(
          msg.from,
          `✅ Lançado! Total da viagem "${v.rows[0].titulo}": ${centavosParaBRL(Number(v.rows[0].total_centavos))}.`,
        );
      }
      await gravarEstado(msg.from, ESTADO_OCIOSO);
      return;
    }

    const correcao = parseCorrecao(texto);
    if (correcao) {
      if (correcao.campo === 'valor') {
        const d = await pool.query(
          `UPDATE despesas_viagem SET valor_centavos = $2, updated_at = now() WHERE id = $1 RETURNING viagem_id`,
          [estado.despesaPendenteId, correcao.valorCentavos],
        );
        if (d.rowCount) await recalcularTotal(d.rows[0].viagem_id);
      } else if (correcao.campo === 'categoria') {
        await pool.query(`UPDATE despesas_viagem SET categoria = $2, updated_at = now() WHERE id = $1`, [
          estado.despesaPendenteId, correcao.categoria,
        ]);
      } else {
        await pool.query(`UPDATE despesas_viagem SET data_despesa = $2, updated_at = now() WHERE id = $1`, [
          estado.despesaPendenteId, correcao.dataDespesa,
        ]);
      }
      const atual = await pool.query(
        `SELECT categoria, valor_centavos, estabelecimento, data_despesa::text AS data_despesa, ia_confianca
           FROM despesas_viagem WHERE id = $1`,
        [estado.despesaPendenteId],
      );
      if (atual.rowCount) {
        const r = atual.rows[0];
        await enviarTexto(msg.from, formatarCard({
          categoria: r.categoria, valorCentavos: r.valor_centavos == null ? null : Number(r.valor_centavos),
          estabelecimento: r.estabelecimento, dataDespesa: r.data_despesa, confianca: r.ia_confianca,
        }));
      }
      return;
    }
  }

  // 7) texto chegando enquanto a extração roda (vira descrição)
  if (estado.fase === 'aguardando_descricao' && estado.despesaPendenteId && texto) {
    await pool.query(`UPDATE despesas_viagem SET descricao = $2, updated_at = now() WHERE id = $1`, [
      estado.despesaPendenteId, texto,
    ]);
    await enviarTexto(msg.from, `Anotei: "${texto}" — já te aviso quando terminar de ler a nota.`);
    return;
  }

  // 8) ajuda
  await enviarTexto(
    msg.from,
    'Manda a *foto da nota* com uma linha do que é (ex.: "abastecimento"), ou um comando:\n' +
    '"nova viagem <destino> / <motivo>" · "minhas viagens" · "fechar viagem"',
  );
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
