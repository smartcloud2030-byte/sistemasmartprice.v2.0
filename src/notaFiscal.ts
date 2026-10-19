// ─────────────────────────────────────────
// notaFiscal.ts — Emissão de NFS-e Nacional (API da Prefeitura de Bacabal)
// Emissor (prestador) é sempre o mesmo CNPJ (NFSE_PRESTADOR_CNPJ no .env).
// Documentação de referência: zip "Tenclógica Sistemas - TerraCloud -
// Integração NFS-e" fornecido pela prefeitura, contrato v1.0.0 (14/05/2026).
// ─────────────────────────────────────────

// CNAEs do cartão CNPJ da Smart Help (BrasilAPI, 2026-10-19). O CNAE vai por
// nota; o admin pode cadastrar outros pela tela (settings.nfse_cnaes).
export interface CnaeOpcao { codigo: string; descricao: string }
export const CNAE_PADRAO = '7319003';
export const CNAES_DO_CARTAO: CnaeOpcao[] = [
  { codigo: '7319003', descricao: 'Marketing direto' },
  { codigo: '9511800', descricao: 'Reparação e manutenção de computadores e periféricos' },
  { codigo: '6209100', descricao: 'Suporte técnico, manutenção e outros serviços em TI' },
  { codigo: '6319400', descricao: 'Portais, provedores de conteúdo e serviços de informação na internet' },
  { codigo: '7319004', descricao: 'Consultoria em publicidade' },
  { codigo: '7320300', descricao: 'Pesquisas de mercado e de opinião pública' },
  { codigo: '9512600', descricao: 'Reparação e manutenção de equipamentos de comunicação' },
];

// Config tributária fixa do prestador — não muda por nota. Ver "Cenário A"
// (Optante ME/EPP, caso mais comum) na documentação da prefeitura.
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
  cnae: string;
  descricao: string;
  valor: number;
}

export function validateEmissaoInput(input: EmissaoInput): string | null {
  if (!/^\d{14}$/.test(input.tomadorCnpj)) return 'CNPJ do tomador inválido (precisa ter 14 dígitos).';
  if (!input.tomadorNome?.trim()) return 'Nome do tomador é obrigatório.';
  if (!input.tomadorEmail?.trim()) return 'E-mail do tomador é obrigatório.';
  if (!/^\d{6}$/.test(input.servicoCodigo)) return 'Código de serviço precisa ter exatamente 6 dígitos.';
  if (!/^\d{7}$/.test(input.cnae)) return 'CNAE precisa ter exatamente 7 dígitos.';
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
    cnae: input.cnae,
    descricao: input.descricao,
    tomador: {
      nome: input.tomadorNome,
      email: input.tomadorEmail,
      telefone: (input.tomadorTelefone || '').replace(/\D/g, ''),
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
import { exigirAdmin } from './lib/sessao';

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
    ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cnae VARCHAR(7);
  `);
}

async function listarCnaes(): Promise<CnaeOpcao[]> {
  const result = await pool.query('SELECT value FROM settings WHERE id = $1', ['nfse_cnaes']);
  const salvos = result.rows[0]?.value;
  return Array.isArray(salvos) && salvos.length > 0 ? salvos : CNAES_DO_CARTAO;
}

// Só admin logado (sessão em cookie) ou script da própria VPS — ver src/lib/sessao.ts.
const apiAuth = exigirAdmin;

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

// Manda a nota pro e-mail do tomador assim que ela é autorizada. Falha de
// e-mail não pode derrubar a emissão (a nota já existe na prefeitura) — fica
// só no log, e o admin reenvia pelo histórico.
async function enviarEmailAutomatico(nota: any) {
  if (nota?.status !== 'autorizada' || !nota.email_tomador || !nota.numero_nota) return nota;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[notaFiscal] GMAIL_USER/GMAIL_APP_PASSWORD ausentes — e-mail automático não enviado.');
    return nota;
  }
  try {
    await enviarEmailNota(nota.email_tomador, {
      numeroNota: nota.numero_nota,
      chaveAcesso: nota.chave_acesso,
      valor: Number(nota.valor),
      descricao: nota.descricao_servico,
    });
    const updated = await pool.query(
      `UPDATE notas_fiscais SET ultimo_email_enviado_em = NOW() WHERE id = $1 RETURNING *`,
      [nota.id]
    );
    return updated.rows[0];
  } catch (err) {
    console.error('[notaFiscal] falha no e-mail automático da nota', nota.id, err);
    return nota;
  }
}

const router = Router();

router.get('/cnaes', apiAuth, async (_req: Request, res: Response) => {
  try {
    res.json({ padrao: CNAE_PADRAO, cnaes: await listarCnaes() });
  } catch (err: any) {
    console.error('[notaFiscal] GET /cnaes:', err);
    res.status(500).json({ error: 'Erro ao carregar CNAEs.' });
  }
});

router.post('/cnaes', apiAuth, async (req: Request, res: Response) => {
  const codigo = String(req.body?.codigo || '').replace(/\D/g, '');
  const descricao = String(req.body?.descricao || '').trim();
  if (!/^\d{7}$/.test(codigo)) return res.status(422).json({ error: 'CNAE precisa ter exatamente 7 dígitos.' });
  if (!descricao) return res.status(422).json({ error: 'Descrição do CNAE é obrigatória.' });

  try {
    const atuais = await listarCnaes();
    if (atuais.some((c) => c.codigo === codigo)) return res.status(409).json({ error: 'Esse CNAE já está na lista.' });
    const novos = [...atuais, { codigo, descricao }];
    await pool.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ('nfse_cnaes', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(novos)]
    );
    res.json({ padrao: CNAE_PADRAO, cnaes: novos });
  } catch (err: any) {
    console.error('[notaFiscal] POST /cnaes:', err);
    res.status(500).json({ error: 'Erro ao salvar CNAE.' });
  }
});

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
    cnae: String(req.body?.cnae || CNAE_PADRAO).replace(/\D/g, ''),
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
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, numero_nota, chave_acesso, status, cnae)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
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
          input.cnae,
        ]
      );
      return res.json(await enviarEmailAutomatico(inserted.rows[0]));
    }

    if (status === 202) {
      if (!data.id) {
        console.error('[notaFiscal] 202 sem id — nota vai ficar presa em transmitindo:', JSON.stringify(data));
      }
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status, cnae)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'transmitindo', $8) RETURNING *`,
        [data.id, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, input.cnae]
      );
      return res.status(202).json(inserted.rows[0]);
    }

    const mensagem = mapNfseError(status, data);
    const rejeitadaComCodigoErro = status === 422 && data?.details?.codigoErro;
    if (rejeitadaComCodigoErro) {
      await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status, erro_detalhe, cnae)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'rejeitada', $8, $9)`,
        [data?.details?.id || null, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, mensagem, input.cnae]
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
        return res.json(await enviarEmailAutomatico(updated.rows[0]));
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
