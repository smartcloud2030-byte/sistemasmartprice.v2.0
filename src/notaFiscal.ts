// ─────────────────────────────────────────
// notaFiscal.ts — Emissão de NFS-e Nacional (API da Prefeitura de Bacabal)
// Emissor (prestador) é sempre o mesmo CNPJ (NFSE_PRESTADOR_CNPJ no .env).
// Documentação de referência: zip "Tenclógica Sistemas - TerraCloud -
// Integração NFS-e" fornecido pela prefeitura, contrato v1.0.0 (14/05/2026).
// ─────────────────────────────────────────

// Config tributária fixa do prestador — não muda por nota. Ver "Cenário A"
// (Optante ME/EPP, caso mais comum) na documentação da prefeitura.
const PRESTADOR_CNAE = '9511800';
const PRESTADOR_LOCAL_PRESTACAO_IBGE = '2101202'; // Bacabal/MA
const PRESTADOR_REGIME = { opSimpNac: 3, regApTribSn: 1, regEspTrib: 0, issRetido: 1 } as const;

export interface EnderecoInput {
  xLgr: string;
  nro: string;
  xCpl?: string;
  xBairro: string;
  cMun: string;
  cep: string;
}

export interface EmissaoInput {
  tomadorCnpj: string;
  tomadorNome: string;
  tomadorEmail: string;
  tomadorTelefone?: string;
  tomadorEndereco: EnderecoInput;
  servicoCodigo: string;
  descricao: string;
  valor: number;
}

export function validateEmissaoInput(input: EmissaoInput): string | null {
  if (!/^\d{14}$/.test(input.tomadorCnpj)) return 'CNPJ do tomador inválido (precisa ter 14 dígitos).';
  if (!input.tomadorNome?.trim()) return 'Nome do tomador é obrigatório.';
  if (!input.tomadorEmail?.trim()) return 'E-mail do tomador é obrigatório.';
  if (!/^\d{6}$/.test(input.servicoCodigo)) return 'Código de serviço precisa ter exatamente 6 dígitos.';
  if (!input.descricao?.trim()) return 'Descrição do serviço é obrigatória.';
  if (!(input.valor > 0)) return 'Valor precisa ser maior que zero.';
  return null;
}

export function buildEmissaoPayload(input: EmissaoInput, prestadorCnpj: string) {
  return {
    prestadorCnpj,
    tomadorDoc: input.tomadorCnpj,
    servicoCodigo: input.servicoCodigo,
    valorTotal: input.valor.toFixed(2),
    cnae: PRESTADOR_CNAE,
    descricao: input.descricao,
    tomador: {
      nome: input.tomadorNome,
      email: input.tomadorEmail,
      telefone: input.tomadorTelefone || '',
      endereco: {
        xLgr: input.tomadorEndereco.xLgr,
        nro: input.tomadorEndereco.nro,
        xCpl: input.tomadorEndereco.xCpl || undefined,
        xBairro: input.tomadorEndereco.xBairro,
        cMun: input.tomadorEndereco.cMun,
        cep: input.tomadorEndereco.cep,
      },
    },
    servico: { localPrestacaoIbge: PRESTADOR_LOCAL_PRESTACAO_IBGE },
    prestadorRegime: PRESTADOR_REGIME,
    tribISSQN: { tribISSQN: 1 },
  };
}

export function mapNfseError(httpStatus: number, body: any): string {
  const code = body?.details?.code;

  if (httpStatus === 422 && body?.details?.codigoErro) {
    const base = body.details.descricaoErro || body.message || 'Nota rejeitada pela Receita Federal.';
    return body.details.acaoSugerida ? `${base} — ${body.details.acaoSugerida}` : base;
  }
  if (code === 'TOMADOR_SEM_IDENTIFICACAO') return 'CNPJ do cliente inválido ou não encontrado.';
  if (code === 'CATALOG_UNKNOWN_CODE') return 'Código de serviço não existe na tabela oficial (NBS).';
  if (code === 'VALIDATION_ERROR') return body?.message || 'Dados da nota inválidos.';
  if (httpStatus === 401 || httpStatus === 403 || code === 'TOKEN_BLOQUEADO') {
    return 'Erro de configuração da integração com a prefeitura — contate o suporte.';
  }
  if (httpStatus === 503) return 'Serviço da prefeitura indisponível no momento, tente novamente em alguns segundos.';
  return body?.message || 'Erro desconhecido ao emitir a nota fiscal.';
}

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import nodemailer from 'nodemailer';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

export async function ensureNotaFiscalSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id SERIAL PRIMARY KEY,
      nfse_id TEXT,
      cnpj_tomador VARCHAR(14) NOT NULL,
      nome_tomador TEXT,
      email_tomador TEXT,
      codigo_servico VARCHAR(6) NOT NULL,
      descricao_servico TEXT NOT NULL,
      valor NUMERIC(12,2) NOT NULL,
      numero_nota TEXT,
      chave_acesso TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'transmitindo',
      erro_detalhe TEXT,
      ultimo_email_enviado_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

// Checagem extra de credencial real de admin, exigida apenas em /emitir por
// se tratar da emissão de um documento fiscal real (não basta o x-api-token
// compartilhado, que é o mesmo usado no resto do app). Mesma convenção de
// api.ts's getAdminCredentials — settings.admin_credentials como fonte de
// verdade, com fallback pra semente via env vars. Pool próprio deste arquivo
// (evita import circular com api.ts).
async function verificarSenhaAdmin(senha: string): Promise<boolean> {
  if (!senha) return false;
  const result = await pool.query('SELECT value FROM settings WHERE id = $1', ['admin_credentials']);
  const stored = result.rows[0]?.value;
  const credentials: Record<string, string> = stored && Object.keys(stored).length > 0
    ? stored
    : { daylon: process.env.ADMIN_PASSWORD_DAYLON || '8814', jh: process.env.ADMIN_PASSWORD_JH || '1993' };
  return Object.values(credentials).includes(senha);
}

const NFSE_BASE_URL = process.env.NFSE_API_BASE_URL || '';
const NFSE_TOKEN = process.env.NFSE_API_TOKEN || '';
const PRESTADOR_CNPJ = process.env.NFSE_PRESTADOR_CNPJ || '';

async function callNfsePrefeitura(path: string, options: { method?: string; body?: any } = {}) {
  const res = await fetch(`${NFSE_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${NFSE_TOKEN}`,
      'X-Contribuinte-Cnpj': PRESTADOR_CNPJ,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function danfseLinkDoGoverno(): string {
  return 'https://www.nfse.gov.br/consultapublica';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function enviarEmailNota(destinatario: string, nota: { numeroNota: string; chaveAcesso: string; valor: number; descricao: string }) {
  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  await transporte.sendMail({
    from: process.env.GMAIL_USER,
    to: destinatario,
    subject: `Nota Fiscal de Serviço nº ${nota.numeroNota}`,
    html: `
      <p>Segue sua Nota Fiscal de Serviço Eletrônica (NFS-e) nº <b>${escapeHtml(nota.numeroNota)}</b>, no valor de R$ ${nota.valor.toFixed(2)}.</p>
      <p>Descrição: ${escapeHtml(nota.descricao)}</p>
      <p>Para visualizar ou imprimir o documento oficial (DANFSe), acesse a consulta pública do governo e informe a chave de acesso abaixo:</p>
      <p><a href="${danfseLinkDoGoverno()}">${danfseLinkDoGoverno()}</a></p>
      <p>Chave de acesso: <code>${escapeHtml(nota.chaveAcesso)}</code></p>
    `,
  });
}

const router = Router();

router.post('/emitir', apiAuth, async (req: Request, res: Response) => {
  if (!NFSE_BASE_URL || !NFSE_TOKEN || !PRESTADOR_CNPJ) {
    return res.status(500).json({ error: 'Configuração da integração com a prefeitura inválida — contate o suporte.' });
  }

  const senhaAdmin = req.body?.adminPassword;
  try {
    if (!(await verificarSenhaAdmin(senhaAdmin))) {
      return res.status(401).json({ error: 'Senha de admin incorreta ou não informada.' });
    }
  } catch (err) {
    console.error('[notaFiscal] erro ao verificar senha de admin:', err);
    return res.status(500).json({ error: 'Erro ao verificar credenciais. Tente novamente.' });
  }

  const input: EmissaoInput = {
    tomadorCnpj: (req.body?.tomadorCnpj || '').replace(/\D/g, ''),
    tomadorNome: req.body?.tomadorNome || '',
    tomadorEmail: req.body?.tomadorEmail || '',
    tomadorTelefone: req.body?.tomadorTelefone || '',
    tomadorEndereco: req.body?.tomadorEndereco || {},
    servicoCodigo: req.body?.servicoCodigo || '',
    descricao: req.body?.descricao || '',
    valor: Number(req.body?.valor),
  };

  const erroValidacao = validateEmissaoInput(input);
  if (erroValidacao) return res.status(422).json({ error: erroValidacao });

  let status: number, data: any;
  try {
    const payload = buildEmissaoPayload(input, PRESTADOR_CNPJ);
    ({ status, data } = await callNfsePrefeitura('/erp/nfse-nacional', { method: 'POST', body: payload }));
  } catch (err: any) {
    console.error('[notaFiscal] POST /emitir:', err);
    return res.status(500).json({ error: 'Erro ao emitir nota fiscal. Tente novamente.' });
  }

  // A partir daqui a prefeitura já pode ter emitido a nota de verdade — um
  // erro nesse bloco (ex.: INSERT falhar) NÃO pode ser reportado como "tente
  // novamente", sob risco de o admin reemitir e gerar uma segunda nota real.
  try {
    if (status === 200) {
      const semNumeroOuChave = !data.numero || !data.chave;
      if (semNumeroOuChave) {
        console.error('[notaFiscal] 200 sem numero/chave — prefeitura pode ter mudado o contrato:', JSON.stringify(data));
      }
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, numero_nota, chave_acesso, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          data.id,
          input.tomadorCnpj,
          input.tomadorNome,
          input.tomadorEmail,
          input.servicoCodigo,
          input.descricao,
          input.valor,
          semNumeroOuChave ? null : data.numero,
          semNumeroOuChave ? null : data.chave,
          semNumeroOuChave ? 'transmitindo' : 'autorizada',
        ]
      );
      return res.json(inserted.rows[0]);
    }

    if (status === 202) {
      if (!data.id) {
        console.error('[notaFiscal] 202 sem id — nota vai ficar presa em transmitindo:', JSON.stringify(data));
      }
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'transmitindo') RETURNING *`,
        [data.id, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor]
      );
      return res.status(202).json(inserted.rows[0]);
    }

    const mensagem = mapNfseError(status, data);
    const rejeitadaComCodigoErro = status === 422 && data?.details?.codigoErro;
    if (rejeitadaComCodigoErro) {
      await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status, erro_detalhe)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'rejeitada', $8)`,
        [data?.details?.id || null, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, mensagem]
      );
    }
    if (status === 401 || status === 403) {
      return res.status(502).json({ error: mensagem });
    }
    if (!rejeitadaComCodigoErro) {
      console.error('[notaFiscal] resposta inesperada da prefeitura:', status, JSON.stringify(data));
    }
    return res.status(status >= 400 ? status : 500).json({ error: mensagem });
  } catch (err: any) {
    console.error('[notaFiscal] CRÍTICO — prefeitura respondeu mas falha ao salvar localmente:', { status, data, err });
    res.status(500).json({ error: 'A prefeitura pode ter emitido a nota, mas houve um erro ao salvar aqui. NÃO tente emitir de novo — contate o suporte com os dados exibidos no console do servidor.' });
  }
});

router.get('/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

    if (nota.status === 'transmitindo' && nota.nfse_id) {
      const { status, data } = await callNfsePrefeitura(`/erp/nfse-nacional/${nota.nfse_id}`);
      if (status === 200 && data.status === 'autorizado') {
        const updated = await pool.query(
          `UPDATE notas_fiscais SET status = 'autorizada', numero_nota = $1, chave_acesso = $2 WHERE id = $3 RETURNING *`,
          [data.numero, data.chave, nota.id]
        );
        return res.json(updated.rows[0]);
      }
      if (status === 200 && data.status === 'rejeitado') {
        const updated = await pool.query(
          `UPDATE notas_fiscais SET status = 'rejeitada', erro_detalhe = $1 WHERE id = $2 RETURNING *`,
          ['NFS-e rejeitada pela Receita Federal.', nota.id]
        );
        return res.json(updated.rows[0]);
      }
    }

    res.json(nota);
  } catch (err: any) {
    console.error('[notaFiscal] GET /:id:', err);
    res.status(500).json({ error: 'Erro ao consultar nota fiscal.' });
  }
});

router.get('/', apiAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[notaFiscal] GET /:', err);
    res.status(500).json({ error: 'Erro ao carregar histórico de notas fiscais.' });
  }
});

router.post('/:id/email', apiAuth, async (req: Request, res: Response) => {
  const destinatario = req.body?.email;
  if (!destinatario) return res.status(422).json({ error: 'E-mail de destino é obrigatório.' });

  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
    if (nota.status !== 'autorizada') return res.status(400).json({ error: 'Só é possível enviar por e-mail uma nota autorizada.' });

    await enviarEmailNota(destinatario, {
      numeroNota: nota.numero_nota,
      chaveAcesso: nota.chave_acesso,
      valor: Number(nota.valor),
      descricao: nota.descricao_servico,
    });

    const updated = await pool.query(
      `UPDATE notas_fiscais SET ultimo_email_enviado_em = NOW() WHERE id = $1 RETURNING *`,
      [nota.id]
    );
    res.json(updated.rows[0]);
  } catch (err: any) {
    console.error('[notaFiscal] POST /:id/email:', err);
    res.status(500).json({ error: 'Erro ao enviar e-mail. Tente novamente.' });
  }
});

export default router;
