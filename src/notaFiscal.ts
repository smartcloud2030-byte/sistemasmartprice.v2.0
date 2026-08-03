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
