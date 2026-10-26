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
  // E-mail é opcional (cliente sem e-mail: só baixa o PDF), mas se vier tem que ser válido.
  if (input.tomadorEmail?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.tomadorEmail.trim())) return 'E-mail do tomador inválido.';
  if (!/^\d{6}$/.test(input.servicoCodigo)) return 'Código de serviço precisa ter exatamente 6 dígitos.';
  if (!/^\d{7}$/.test(input.cnae)) return 'CNAE precisa ter exatamente 7 dígitos.';
  if (!input.descricao?.trim()) return 'Descrição do serviço é obrigatória.';
  if (!(input.valor > 0)) return 'Valor precisa ser maior que zero.';
  return null;
}

// Códigos de justificativa do cancelamento (TSCodJustCanc, XSD NFS-e v1.01).
export const MOTIVOS_CANCELAMENTO: Record<string, string> = { '1': 'Erro na emissão', '2': 'Serviço não prestado', '9': 'Outros' };

export function validarCancelamento(cMotivo: string, motivo: string): string | null {
  if (!MOTIVOS_CANCELAMENTO[cMotivo]) return 'Escolha o motivo do cancelamento.';
  const texto = motivo.trim();
  if (texto.length < 15) return 'Explique o motivo com pelo menos 15 caracteres.';
  if (texto.length > 255) return 'A justificativa pode ter no máximo 255 caracteres.';
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
      email: input.tomadorEmail?.trim() || undefined,
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
import JSZip from 'jszip';
import { exigirAdmin, conferirSenha } from './lib/sessao';
import { montarComprovanteNotaFiscalPdf, nomeArquivoComprovante, ComprovanteNotaFiscalInput, formatCnpj } from './lib/notaFiscalPdf';
import { gerarDanfsePdf } from './lib/danfse';
import { parseCnpjResponseEstruturado, CnpjDataEstruturado } from './lib/cnpjLookup';

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
    ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS email_automatico BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ;
    ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cancelamento_motivo TEXT;
    ALTER TABLE notas_fiscais ADD COLUMN IF NOT EXISTS cancelamento_protocolo TEXT;
    CREATE TABLE IF NOT EXISTS nfse_agendamentos (
      id SERIAL PRIMARY KEY,
      chave TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      dia SMALLINT NOT NULL CHECK (dia BETWEEN 1 AND 28),
      itens JSONB NOT NULL,
      descricao TEXT NOT NULL,
      servico_codigo VARCHAR(6) NOT NULL,
      cnae VARCHAR(7) NOT NULL,
      email_cliente TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      ultima_competencia VARCHAR(7),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS nfse_lotes (
      id SERIAL PRIMARY KEY,
      agendamento_id INT,
      nome TEXT NOT NULL,
      competencia VARCHAR(7) NOT NULL,
      nota_ids INT[] NOT NULL DEFAULT '{}',
      falhas JSONB NOT NULL DEFAULT '[]',
      email_cliente TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'conferir',
      enviado_em TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
  // Desde 536ca94 as senhas ficam em hash scrypt — compara via conferirSenha.
  return Object.values(credentials).some((guardado) => conferirSenha(senha, guardado));
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

// XML oficial da RFB (GET /erp/nfse-nacional/{id}/xml — a API não tem rota de
// PDF). Aceita o UUID interno ou a chave de 50 dígitos. Falha → null, o e-mail
// sai só com o PDF.
async function baixarXmlOficial(nota: any): Promise<string | null> {
  const id = nota.nfse_id || nota.chave_acesso;
  if (!id || !NFSE_BASE_URL || !NFSE_TOKEN) return null;
  try {
    const res = await fetch(`${NFSE_BASE_URL}/erp/nfse-nacional/${encodeURIComponent(id)}/xml`, {
      headers: { 'Authorization': `Token ${NFSE_TOKEN}`, 'X-Contribuinte-Cnpj': PRESTADOR_CNPJ },
    });
    if (!res.ok) {
      console.error('[notaFiscal] XML oficial indisponível:', res.status, id);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.error('[notaFiscal] erro ao baixar XML oficial:', err);
    return null;
  }
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

function comprovanteDaNota(nota: any): ComprovanteNotaFiscalInput {
  return {
    numeroNota: nota.numero_nota || '',
    chaveAcesso: nota.chave_acesso || '',
    cnpjTomador: nota.cnpj_tomador,
    nomeTomador: nota.nome_tomador,
    descricaoServico: nota.descricao_servico,
    valor: Number(nota.valor),
    dataEmissao: nota.created_at,
    cnae: nota.cnae,
    codigoServico: nota.codigo_servico,
  };
}

// PDF da nota: DANFSe v2.0 desenhado a partir do XML oficial. Sem XML (API
// fora do ar), cai no comprovante simples pra o cliente não ficar sem nada.
async function pdfDaNota(nota: any, xml: string | null): Promise<Buffer> {
  if (xml) {
    try {
      return await gerarDanfsePdf(xml);
    } catch (err) {
      console.error('[notaFiscal] falha ao montar DANFSe, usando comprovante:', nota.id, err);
    }
  }
  return Buffer.from(montarComprovanteNotaFiscalPdf(comprovanteDaNota(nota)).output('arraybuffer'));
}

// Recebe a linha de notas_fiscais e manda o e-mail com o PDF da nota anexado.
async function enviarEmailNota(destinatario: string, nota: any) {
  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  const comprovante = comprovanteDaNota(nota);
  const xml = await baixarXmlOficial(nota);
  const pdf = await pdfDaNota(nota, xml);
  const anexos: { filename: string; content: Buffer | string; contentType: string }[] = [
    { filename: nomeArquivoComprovante(comprovante), content: pdf, contentType: 'application/pdf' },
  ];
  if (xml) anexos.push({ filename: nomeArquivoComprovante(comprovante).replace(/\.pdf$/, '.xml'), content: xml, contentType: 'application/xml' });

  await transporte.sendMail({
    from: `SMART HELP <${process.env.GMAIL_USER}>`,
    to: destinatario,
    subject: `Nota Fiscal de Serviço nº ${comprovante.numeroNota}`,
    html: `
      <p>Segue em anexo sua Nota Fiscal de Serviço Eletrônica (NFS-e) nº <b>${escapeHtml(comprovante.numeroNota)}</b>, no valor de R$ ${comprovante.valor.toFixed(2)}${xml ? ' (PDF e XML oficial)' : ''}.</p>
      <p>Descrição: ${escapeHtml(comprovante.descricaoServico)}</p>
      <p>Para visualizar ou imprimir o documento oficial (DANFSe), acesse a consulta pública do governo e informe a chave de acesso abaixo:</p>
      <p><a href="${danfseLinkDoGoverno()}">${danfseLinkDoGoverno()}</a></p>
      <p>Chave de acesso: <code>${escapeHtml(comprovante.chaveAcesso)}</code></p>
    `,
    attachments: anexos,
  });
}

// Manda a nota pro e-mail do tomador assim que ela é autorizada. Falha de
// e-mail não pode derrubar a emissão (a nota já existe na prefeitura) — fica
// só no log, e o admin reenvia pelo histórico.
async function enviarEmailAutomatico(nota: any) {
  if (nota?.status !== 'autorizada' || !nota.email_tomador || !nota.numero_nota) return nota;
  // Notas de lote não mandam e-mail uma a uma — vão juntas no ZIP (POST /lote/email).
  if (nota.email_automatico === false) return nota;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[notaFiscal] GMAIL_USER/GMAIL_APP_PASSWORD ausentes — e-mail automático não enviado.');
    return nota;
  }
  try {
    await enviarEmailNota(nota.email_tomador, nota);
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

// Emite uma nota (valida, chama a prefeitura, grava). Usado pela tela
// (POST /emitir) e pelo agendador mensal — mesmo caminho pros dois.
async function emitirNota(input: EmissaoInput, emailAutomatico: boolean): Promise<{ httpStatus: number; body: any }> {
  if (!NFSE_BASE_URL || !NFSE_TOKEN || !PRESTADOR_CNPJ) {
    return { httpStatus: 500, body: { error: 'Configuração da integração com a prefeitura inválida — contate o suporte.' } };
  }
  const erroValidacao = validateEmissaoInput(input);
  if (erroValidacao) return { httpStatus: 422, body: { error: erroValidacao } };

  let status: number, data: any;
  try {
    const payload = buildEmissaoPayload(input, PRESTADOR_CNPJ);
    ({ status, data } = await callNfsePrefeitura('/erp/nfse-nacional', { method: 'POST', body: payload }));
  } catch (err: any) {
    console.error('[notaFiscal] emitirNota:', err);
    return { httpStatus: 500, body: { error: 'Erro ao emitir nota fiscal. Tente novamente.' } };
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
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, numero_nota, chave_acesso, status, cnae, email_automatico)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
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
          emailAutomatico,
        ]
      );
      return { httpStatus: 200, body: await enviarEmailAutomatico(inserted.rows[0]) };
    }

    if (status === 202) {
      if (!data.id) {
        console.error('[notaFiscal] 202 sem id — nota vai ficar presa em transmitindo:', JSON.stringify(data));
      }
      const inserted = await pool.query(
        `INSERT INTO notas_fiscais (nfse_id, cnpj_tomador, nome_tomador, email_tomador, codigo_servico, descricao_servico, valor, status, cnae, email_automatico)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'transmitindo', $8, $9) RETURNING *`,
        [data.id, input.tomadorCnpj, input.tomadorNome, input.tomadorEmail, input.servicoCodigo, input.descricao, input.valor, input.cnae, emailAutomatico]
      );
      return { httpStatus: 202, body: inserted.rows[0] };
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
      return { httpStatus: 502, body: { error: mensagem } };
    }
    if (!rejeitadaComCodigoErro) {
      console.error('[notaFiscal] resposta inesperada da prefeitura:', status, JSON.stringify(data));
    }
    return { httpStatus: status >= 400 ? status : 500, body: { error: mensagem } };
  } catch (err: any) {
    console.error('[notaFiscal] CRÍTICO — prefeitura respondeu mas falha ao salvar localmente:', { status, data, err });
    return { httpStatus: 500, body: { error: 'A prefeitura pode ter emitido a nota, mas houve um erro ao salvar aqui. NÃO tente emitir de novo — contate o suporte com os dados exibidos no console do servidor.' } };
  }
}

// Nota que a prefeitura ainda estava processando: pergunta de novo e grava o
// resultado. Devolve a nota (atualizada ou não).
async function consultarNotaTransmitindo(nota: any): Promise<any> {
  if (nota.status === 'transmitindo' && nota.nfse_id) {
    const { status, data } = await callNfsePrefeitura(`/erp/nfse-nacional/${nota.nfse_id}`);
    if (status === 200 && data.status === 'autorizado') {
      const updated = await pool.query(
        `UPDATE notas_fiscais SET status = 'autorizada', numero_nota = $1, chave_acesso = $2 WHERE id = $3 RETURNING *`,
        [data.numero, data.chave, nota.id]
      );
      return enviarEmailAutomatico(updated.rows[0]);
    }
    if (status === 200 && data.status === 'rejeitado') {
      const updated = await pool.query(
        `UPDATE notas_fiscais SET status = 'rejeitada', erro_detalhe = $1 WHERE id = $2 RETURNING *`,
        ['NFS-e rejeitada pela Receita Federal.', nota.id]
      );
      return updated.rows[0];
    }
  }
  return nota;
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
      // 403, não 401: o fetch do app trata 401 como sessão vencida e desloga.
      return res.status(403).json({ error: 'Senha de admin incorreta ou não informada.' });
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
  const emailAutomatico = req.body?.enviarEmail !== false;

  const { httpStatus, body } = await emitirNota(input, emailAutomatico);
  res.status(httpStatus).json(body);
});

// ── Lote: várias notas do mesmo cliente num ZIP só ──
// A emissão em si é feita nota a nota pelo front (POST /emitir com
// enviarEmail:false); aqui só junta as autorizadas e entrega/manda.

function idsDoPedido(bruto: unknown): number[] {
  const lista = Array.isArray(bruto) ? bruto : String(bruto || '').split(',');
  return [...new Set(lista.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
}

async function notasAutorizadas(ids: number[]) {
  if (ids.length === 0) return [];
  const result = await pool.query(
    `SELECT * FROM notas_fiscais WHERE id = ANY($1::int[]) AND status = 'autorizada' ORDER BY numero_nota::bigint NULLS LAST, id`,
    [ids]
  );
  return result.rows;
}

async function montarZipDasNotas(notas: any[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const nota of notas) {
    const xml = await baixarXmlOficial(nota);
    const base = `nota-fiscal-${nota.numero_nota || nota.id}-${nota.cnpj_tomador}`;
    zip.file(`${base}.pdf`, await pdfDaNota(nota, xml));
    if (xml) zip.file(`${base}.xml`, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function nomeDoZip(): string {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Fortaleza' });
  return `notas-fiscais-${hoje}.zip`;
}

const moedaBr = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function tabelaDasNotas(notas: any[]): string {
  const total = notas.reduce((soma, n) => soma + Number(n.valor), 0);
  const linhas = notas
    .map((n) => `<tr><td>${escapeHtml(n.numero_nota)}</td><td>${escapeHtml(formatCnpj(n.cnpj_tomador))}</td><td>${escapeHtml(n.nome_tomador || '')}</td><td style="text-align:right">${moedaBr(Number(n.valor))}</td></tr>`)
    .join('');
  return `
    <table cellpadding="6" style="border-collapse:collapse;border:1px solid #ccc;font-size:13px">
      <tr style="background:#f2f2f2"><th>Nº</th><th>CNPJ</th><th>Tomador</th><th>Valor</th></tr>
      ${linhas}
      <tr><td colspan="3"><b>Total</b></td><td style="text-align:right"><b>${moedaBr(total)}</b></td></tr>
    </table>`;
}

function transporteGmail() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

// ZIP (DANFSe + XML de cada nota) num e-mail só pro cliente.
async function enviarZipPorEmail(notas: any[], destinatario: string) {
  const zip = await montarZipDasNotas(notas);
  await transporteGmail().sendMail({
    from: `SMART HELP <${process.env.GMAIL_USER}>`,
    to: destinatario,
    subject: `Notas Fiscais de Serviço — ${notas.length} nota${notas.length === 1 ? '' : 's'} (nº ${notas.map((n) => n.numero_nota).join(', ')})`,
    html: `
      <p>Segue em anexo (ZIP) ${notas.length === 1 ? 'a Nota Fiscal de Serviço Eletrônica' : `as ${notas.length} Notas Fiscais de Serviço Eletrônicas`}, com o PDF (DANFSe) e o XML oficial de cada uma.</p>
      ${tabelaDasNotas(notas)}
      <p>As notas podem ser consultadas em <a href="${danfseLinkDoGoverno()}">${danfseLinkDoGoverno()}</a> pela chave de acesso.</p>
    `,
    attachments: [{ filename: nomeDoZip(), content: zip, contentType: 'application/zip' }],
  });
  await pool.query(`UPDATE notas_fiscais SET ultimo_email_enviado_em = NOW() WHERE id = ANY($1::int[])`, [notas.map((n) => n.id)]);
}

router.get('/lote/zip', apiAuth, async (req: Request, res: Response) => {
  try {
    const notas = await notasAutorizadas(idsDoPedido(req.query.ids));
    if (notas.length === 0) return res.status(404).json({ error: 'Nenhuma nota autorizada nesse lote.' });
    const zip = await montarZipDasNotas(notas);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeDoZip()}"`);
    res.send(zip);
  } catch (err: any) {
    console.error('[notaFiscal] GET /lote/zip:', err);
    res.status(500).json({ error: 'Erro ao montar o ZIP das notas.' });
  }
});

router.post('/lote/email', apiAuth, async (req: Request, res: Response) => {
  const destinatario = String(req.body?.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return res.status(422).json({ error: 'Informe um e-mail válido.' });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Envio de e-mail não configurado no servidor.' });
  }

  try {
    const notas = await notasAutorizadas(idsDoPedido(req.body?.ids));
    if (notas.length === 0) return res.status(404).json({ error: 'Nenhuma nota autorizada nesse lote.' });

    await enviarZipPorEmail(notas, destinatario);
    res.json({ enviadas: notas.length });
  } catch (err: any) {
    console.error('[notaFiscal] POST /lote/email:', err);
    res.status(500).json({ error: 'Erro ao enviar o e-mail com as notas. Tente novamente.' });
  }
});

// Último lote usado por cliente (bandeira) — no mês seguinte a tela já vem
// preenchida. settings.nfse_lote_modelos = { [bandeira]: { itens, descricao, ... } }
async function lerModelosDeLote(): Promise<Record<string, any>> {
  const result = await pool.query('SELECT value FROM settings WHERE id = $1', ['nfse_lote_modelos']);
  const v = result.rows[0]?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

router.get('/lote/modelos', apiAuth, async (_req: Request, res: Response) => {
  try {
    res.json(await lerModelosDeLote());
  } catch (err: any) {
    console.error('[notaFiscal] GET /lote/modelos:', err);
    res.status(500).json({ error: 'Erro ao carregar lotes salvos.' });
  }
});

router.put('/lote/modelos', apiAuth, async (req: Request, res: Response) => {
  const chave = String(req.body?.chave || '').trim().slice(0, 100);
  const modelo = req.body?.modelo;
  if (!chave || !modelo || !Array.isArray(modelo.itens)) return res.status(422).json({ error: 'Lote inválido.' });

  try {
    const modelos = await lerModelosDeLote();
    modelos[chave] = {
      itens: modelo.itens
        .map((i: any) => ({ cnpj: String(i?.cnpj || '').replace(/\D/g, ''), valor: Number(i?.valor) || 0 }))
        .filter((i: any) => /^\d{14}$/.test(i.cnpj))
        .slice(0, 50),
      descricao: String(modelo.descricao || '').slice(0, 2000),
      servicoCodigo: String(modelo.servicoCodigo || '').replace(/\D/g, '').slice(0, 6),
      cnae: String(modelo.cnae || '').replace(/\D/g, '').slice(0, 7),
      email: String(modelo.email || '').trim().slice(0, 200),
      atualizadoEm: new Date().toISOString(),
    };
    await pool.query(
      `INSERT INTO settings (id, value, updated_at) VALUES ('nfse_lote_modelos', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(modelos)]
    );
    res.json(modelos[chave]);
  } catch (err: any) {
    console.error('[notaFiscal] PUT /lote/modelos:', err);
    res.status(500).json({ error: 'Erro ao salvar o lote.' });
  }
});

// ── Agendamento mensal ──
// Todo mês, no dia escolhido às 10h (horário de Bacabal), o servidor emite o
// lote sozinho e NÃO manda pro cliente: grava em nfse_lotes como 'conferir' e
// manda o resumo + ZIP pro José. Ele confere e libera pela tela (POST
// /lotes/:id/enviar). Só roda onde há token da prefeitura (VPS2; a standby
// não tem NFSE_API_TOKEN, então nunca emite em dobro).
const HORA_AGENDAMENTO = 10;
const FUSO = 'America/Fortaleza';

export function agoraEmBacabal(data = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(data)
      .map((p) => [p.type, p.value])
  );
  return { ano: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day), hora: Number(partes.hour), competencia: `${partes.year}-${partes.month}` };
}

/** Já passou do horário de emitir deste mês? (dia agendado às 10h ou depois) */
export function jaPassouDoHorario(diaAgendado: number, agora: { dia: number; hora: number }): boolean {
  return agora.dia > diaAgendado || (agora.dia === diaAgendado && agora.hora >= HORA_AGENDAMENTO);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dados do tomador pela BrasilAPI, do lado do servidor. Sem User-Agent a
// BrasilAPI responde 403 pro fetch do Node; tenta duas vezes antes de desistir.
async function buscarTomador(cnpj: string): Promise<{ dados: CnpjDataEstruturado | null; erro?: string }> {
  let erro = '';
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa) await esperar(3000);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (SmartPrice NFS-e)', Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { dados: parseCnpjResponseEstruturado(await res.json()) };
      erro = `consulta do CNPJ respondeu ${res.status}`;
    } catch (err: any) {
      erro = `consulta do CNPJ falhou (${err?.message || err})`;
    }
  }
  console.error('[notaFiscal] buscarTomador', cnpj, erro);
  return { dados: null, erro };
}

async function executarAgendamento(ag: any, competencia: string) {
  const idsAutorizados: number[] = [];
  const falhas: { cnpj: string; erro: string }[] = [];

  for (const item of ag.itens as { cnpj: string; valor: number }[]) {
    const { dados, erro } = await buscarTomador(item.cnpj);
    if (!dados) {
      falhas.push({ cnpj: item.cnpj, erro: `Não consegui buscar os dados do CNPJ (${erro}).` });
      continue;
    }
    const { body } = await emitirNota({
      tomadorCnpj: item.cnpj,
      tomadorNome: dados.nome,
      tomadorEmail: ag.email_cliente,
      tomadorTelefone: dados.telefone,
      tomadorEndereco: dados.endereco,
      servicoCodigo: ag.servico_codigo,
      cnae: ag.cnae,
      descricao: ag.descricao,
      valor: Number(item.valor),
    }, false);

    let nota = body;
    for (let i = 0; nota?.status === 'transmitindo' && i < 10; i++) {
      await esperar(6000);
      nota = await consultarNotaTransmitindo(nota);
    }
    if (nota?.status === 'autorizada') idsAutorizados.push(nota.id);
    else falhas.push({ cnpj: item.cnpj, erro: nota?.erro_detalhe || nota?.error || (nota?.status === 'transmitindo' ? 'Prefeitura ainda processando — confira no histórico.' : 'Erro ao emitir.') });
  }

  const lote = await pool.query(
    `INSERT INTO nfse_lotes (agendamento_id, nome, competencia, nota_ids, falhas, email_cliente, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [ag.id, ag.nome, competencia, idsAutorizados, JSON.stringify(falhas), ag.email_cliente, idsAutorizados.length ? 'conferir' : 'falhou']
  );
  console.log(`[notaFiscal] agendamento ${ag.id} (${ag.nome}) ${competencia}: ${idsAutorizados.length} autorizada(s), ${falhas.length} falha(s)`);

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return lote.rows[0];
  try {
    const notas = await notasAutorizadas(idsAutorizados);
    const listaFalhas = falhas.length
      ? `<p><b style="color:#b00">${falhas.length} não saíram:</b></p><ul>${falhas.map((f) => `<li>${escapeHtml(formatCnpj(f.cnpj))} — ${escapeHtml(f.erro)}</li>`).join('')}</ul>`
      : '';
    await transporteGmail().sendMail({
      from: `SMART HELP <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `[Conferir] Notas de ${ag.nome} — ${competencia.slice(5)}/${competencia.slice(0, 4)} (${notas.length} emitida${notas.length === 1 ? '' : 's'})`,
      html: `
        <p>O agendamento mensal de <b>${escapeHtml(ag.nome)}</b> emitiu as notas abaixo. <b>Ainda não foram enviadas ao cliente.</b></p>
        ${notas.length ? tabelaDasNotas(notas) : '<p>Nenhuma nota foi autorizada.</p>'}
        ${listaFalhas}
        <p>Confira o ZIP em anexo. Se estiver tudo certo, abra o SmartPrice → Financeiro → Notas Fiscais → <b>Lotes para conferir</b> e clique em <b>Enviar pro cliente</b> (${escapeHtml(ag.email_cliente)}).</p>
      `,
      attachments: notas.length ? [{ filename: nomeDoZip(), content: await montarZipDasNotas(notas), contentType: 'application/zip' }] : [],
    });
  } catch (err) {
    console.error('[notaFiscal] falha ao mandar resumo do agendamento pro admin:', err);
  }
  return lote.rows[0];
}

let agendadorRodando = false;
async function rodarAgendamentosVencidos() {
  if (agendadorRodando) return;
  agendadorRodando = true;
  try {
    const agora = agoraEmBacabal();
    if (agora.hora < HORA_AGENDAMENTO) return;
    const vencidos = await pool.query(
      `SELECT * FROM nfse_agendamentos WHERE ativo AND dia <= $1 AND ultima_competencia IS DISTINCT FROM $2 ORDER BY id`,
      [agora.dia, agora.competencia]
    );
    for (const ag of vencidos.rows) {
      // Marca o mês ANTES de emitir: se o servidor cair no meio, não emite de novo.
      const tomado = await pool.query(
        `UPDATE nfse_agendamentos SET ultima_competencia = $2 WHERE id = $1 AND ultima_competencia IS DISTINCT FROM $2 RETURNING *`,
        [ag.id, agora.competencia]
      );
      if (tomado.rows[0]) await executarAgendamento(tomado.rows[0], agora.competencia);
    }
  } catch (err) {
    console.error('[notaFiscal] erro no agendador de notas:', err);
  } finally {
    agendadorRodando = false;
  }
}

export function iniciarAgendadorDeNotas() {
  if (!NFSE_TOKEN) {
    console.log('[notaFiscal] agendador de notas desligado (sem NFSE_API_TOKEN neste servidor)');
    return;
  }
  setTimeout(() => rodarAgendamentosVencidos(), 60 * 1000);
  setInterval(() => rodarAgendamentosVencidos(), 5 * 60 * 1000);
}

router.get('/agendamentos', apiAuth, async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM nfse_agendamentos ORDER BY nome');
    res.json(result.rows);
  } catch (err: any) {
    console.error('[notaFiscal] GET /agendamentos:', err);
    res.status(500).json({ error: 'Erro ao carregar agendamentos.' });
  }
});

router.post('/agendamentos', apiAuth, async (req: Request, res: Response) => {
  try {
    if (!(await verificarSenhaAdmin(req.body?.adminPassword))) {
      return res.status(403).json({ error: 'Senha de admin incorreta ou não informada.' });
    }
  } catch (err) {
    console.error('[notaFiscal] erro ao verificar senha de admin:', err);
    return res.status(500).json({ error: 'Erro ao verificar credenciais. Tente novamente.' });
  }

  const chave = String(req.body?.chave || '').trim().slice(0, 150);
  const nome = String(req.body?.nome || '').trim().slice(0, 150);
  const dia = Number(req.body?.dia);
  const itens = (Array.isArray(req.body?.itens) ? req.body.itens : [])
    .map((i: any) => ({ cnpj: String(i?.cnpj || '').replace(/\D/g, ''), valor: Number(i?.valor) }))
    .filter((i: any) => /^\d{14}$/.test(i.cnpj))
    .slice(0, 50);
  const descricao = String(req.body?.descricao || '').trim();
  const servicoCodigo = String(req.body?.servicoCodigo || '').replace(/\D/g, '');
  const cnae = String(req.body?.cnae || CNAE_PADRAO).replace(/\D/g, '');
  const email = String(req.body?.email || '').trim();

  if (!chave || !nome) return res.status(422).json({ error: 'Escolha o grupo ou a bandeira.' });
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return res.status(422).json({ error: 'Dia do mês precisa ser de 1 a 28.' });
  if (itens.length === 0) return res.status(422).json({ error: 'Marque pelo menos um CNPJ.' });
  if (itens.some((i: any) => !(i.valor > 0))) return res.status(422).json({ error: 'Todos os CNPJs precisam de valor maior que zero.' });
  if (!/^\d{6}$/.test(servicoCodigo)) return res.status(422).json({ error: 'Código de serviço precisa ter 6 dígitos.' });
  if (!/^\d{7}$/.test(cnae)) return res.status(422).json({ error: 'CNAE precisa ter 7 dígitos.' });
  if (!descricao) return res.status(422).json({ error: 'Descrição do serviço é obrigatória.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: 'Informe o e-mail do cliente.' });

  // Agendar depois do horário deste mês não emite agora — começa no próximo.
  const agora = agoraEmBacabal();
  const competenciaInicial = jaPassouDoHorario(dia, agora) ? agora.competencia : null;

  try {
    const result = await pool.query(
      `INSERT INTO nfse_agendamentos (chave, nome, dia, itens, descricao, servico_codigo, cnae, email_cliente, ativo, ultima_competencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
       ON CONFLICT (chave) DO UPDATE SET nome = $2, dia = $3, itens = $4, descricao = $5, servico_codigo = $6, cnae = $7,
         email_cliente = $8, ativo = TRUE,
         ultima_competencia = COALESCE(nfse_agendamentos.ultima_competencia, $9)
       RETURNING *`,
      [chave, nome, dia, JSON.stringify(itens), descricao, servicoCodigo, cnae, email, competenciaInicial]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[notaFiscal] POST /agendamentos:', err);
    res.status(500).json({ error: 'Erro ao salvar o agendamento.' });
  }
});

router.patch('/agendamentos/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('UPDATE nfse_agendamentos SET ativo = $2 WHERE id = $1 RETURNING *', [req.params.id, req.body?.ativo === true]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[notaFiscal] PATCH /agendamentos/:id:', err);
    res.status(500).json({ error: 'Erro ao atualizar o agendamento.' });
  }
});

router.delete('/agendamentos/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM nfse_agendamentos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[notaFiscal] DELETE /agendamentos/:id:', err);
    res.status(500).json({ error: 'Erro ao remover o agendamento.' });
  }
});

// Lotes emitidos pelo agendador, esperando o José conferir e liberar.
router.get('/lotes', apiAuth, async (_req: Request, res: Response) => {
  try {
    const lotes = await pool.query(`SELECT * FROM nfse_lotes WHERE status = 'conferir' OR created_at > NOW() - INTERVAL '45 days' ORDER BY created_at DESC LIMIT 30`);
    const ids = lotes.rows.flatMap((l) => l.nota_ids);
    const notas = ids.length ? (await pool.query('SELECT id, numero_nota, cnpj_tomador, nome_tomador, valor FROM notas_fiscais WHERE id = ANY($1::int[])', [ids])).rows : [];
    res.json(lotes.rows.map((l) => ({ ...l, notas: notas.filter((n) => l.nota_ids.includes(n.id)) })));
  } catch (err: any) {
    console.error('[notaFiscal] GET /lotes:', err);
    res.status(500).json({ error: 'Erro ao carregar lotes.' });
  }
});

router.post('/lotes/:id/enviar', apiAuth, async (req: Request, res: Response) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: 'Envio de e-mail não configurado no servidor.' });
  }
  try {
    const lote = (await pool.query('SELECT * FROM nfse_lotes WHERE id = $1', [req.params.id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote não encontrado.' });
    const destinatario = String(req.body?.email || lote.email_cliente).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) return res.status(422).json({ error: 'Informe um e-mail válido.' });
    const notas = await notasAutorizadas(lote.nota_ids);
    if (notas.length === 0) return res.status(404).json({ error: 'Nenhuma nota autorizada nesse lote.' });

    await enviarZipPorEmail(notas, destinatario);
    const atualizado = await pool.query(
      `UPDATE nfse_lotes SET status = 'enviado', enviado_em = NOW(), email_cliente = $2 WHERE id = $1 RETURNING *`,
      [lote.id, destinatario]
    );
    res.json(atualizado.rows[0]);
  } catch (err: any) {
    console.error('[notaFiscal] POST /lotes/:id/enviar:', err);
    res.status(500).json({ error: 'Erro ao enviar o lote. Tente novamente.' });
  }
});

// Cancela a NFS-e na prefeitura/Receita (POST /erp/nfse-nacional/{chave}/cancelar).
router.post('/:id/cancelar', apiAuth, async (req: Request, res: Response) => {
  if (!NFSE_BASE_URL || !NFSE_TOKEN || !PRESTADOR_CNPJ) {
    return res.status(500).json({ error: 'Configuração da integração com a prefeitura inválida — contate o suporte.' });
  }
  try {
    if (!(await verificarSenhaAdmin(req.body?.adminPassword))) {
      return res.status(403).json({ error: 'Senha de admin incorreta ou não informada.' });
    }
  } catch (err) {
    console.error('[notaFiscal] erro ao verificar senha de admin:', err);
    return res.status(500).json({ error: 'Erro ao verificar credenciais. Tente novamente.' });
  }

  const cMotivo = String(req.body?.cMotivo || '');
  const motivo = String(req.body?.motivo || '').trim();
  const erroValidacao = validarCancelamento(cMotivo, motivo);
  if (erroValidacao) return res.status(422).json({ error: erroValidacao });

  try {
    const nota = (await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id])).rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
    if (nota.status === 'cancelada') return res.status(409).json({ error: 'Essa nota já está cancelada.' });
    if (nota.status !== 'autorizada' || !nota.chave_acesso) return res.status(400).json({ error: 'Só dá pra cancelar nota autorizada.' });

    const { status, data } = await callNfsePrefeitura(`/erp/nfse-nacional/${nota.chave_acesso}/cancelar`, {
      method: 'POST',
      body: { motivo, cMotivo },
    });

    const marcarCancelada = (protocolo: string | null, quando: string | null) => pool.query(
      `UPDATE notas_fiscais SET status = 'cancelada', cancelada_em = COALESCE($2::timestamptz, NOW()),
         cancelamento_motivo = $3, cancelamento_protocolo = $4 WHERE id = $1 RETURNING *`,
      [nota.id, quando, `${MOTIVOS_CANCELAMENTO[cMotivo]} — ${motivo}`, protocolo]
    );

    if (status === 200) {
      const atualizada = await marcarCancelada(data?.protocolo || null, data?.canceladaEm || null);
      return res.json(atualizada.rows[0]);
    }
    if (status === 409) {
      // Já estava cancelada lá (ex.: cancelada pelo portal) — só acerta aqui.
      const atualizada = await marcarCancelada(null, null);
      return res.json(atualizada.rows[0]);
    }

    console.error('[notaFiscal] cancelamento recusado:', status, JSON.stringify(data));
    if (status === 401 || status === 403) return res.status(502).json({ error: mapNfseError(status, data) });
    if (status === 400) return res.status(400).json({ error: 'A prefeitura diz que essa nota não está autorizada (não dá pra cancelar).' });
    const msg = data?.details?.descricaoErro || data?.message || 'A Receita Federal recusou o cancelamento.';
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: data?.details?.acaoSugerida ? `${msg} — ${data.details.acaoSugerida}` : msg });
  } catch (err: any) {
    console.error('[notaFiscal] POST /:id/cancelar:', err);
    res.status(500).json({ error: 'Erro ao cancelar a nota. Confira no histórico antes de tentar de novo.' });
  }
});

router.get('/:id/pdf', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
    if (nota.status !== 'autorizada') return res.status(400).json({ error: 'Só nota autorizada tem PDF.' });

    const pdf = await pdfDaNota(nota, await baixarXmlOficial(nota));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${nomeArquivoComprovante(comprovanteDaNota(nota))}"`);
    res.send(pdf);
  } catch (err: any) {
    console.error('[notaFiscal] GET /:id/pdf:', err);
    res.status(500).json({ error: 'Erro ao gerar o PDF da nota.' });
  }
});

router.get('/:id', apiAuth, async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM notas_fiscais WHERE id = $1', [req.params.id]);
    const nota = result.rows[0];
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

    res.json(await consultarNotaTransmitindo(nota));
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

    await enviarEmailNota(destinatario, nota);

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
