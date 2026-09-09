// ─────────────────────────────────────────
// reciboExtract.ts — leitura de nota fiscal / cupom por foto, via Claude.
// extrairRecibo() chama o modelo (visão + saída estruturada por Zod).
// normalizarExtracao() (pura) converte a resposta pro formato do sistema.
// Stateless: não persiste nada nesta fase.
// ─────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIAS_VALIDAS, type CategoriaDespesa } from './despesasViagemReport';

const MODELO = process.env.DESPESAS_IA_MODEL || 'claude-opus-5';
const CONFIANCAS = ['alta', 'media', 'baixa'] as const;

export class IANaoConfiguradaError extends Error {
  constructor() {
    super('IA não configurada: defina ANTHROPIC_API_KEY no ambiente.');
    this.name = 'IANaoConfiguradaError';
  }
}

// Schema que a IA preenche. Pede valor em reais (decimal), não centavos.
const SchemaIA = z.object({
  categoria: z.enum(CATEGORIAS_VALIDAS as unknown as [string, ...string[]]),
  valorReais: z.number().nullable(),
  dataDespesa: z.string().nullable(), // YYYY-MM-DD
  estabelecimento: z.string().nullable(),
  documentoNumero: z.string().nullable(),
  litros: z.number().nullable(),
  kmVeiculo: z.number().nullable(),
  confianca: z.enum(CONFIANCAS),
  observacao: z.string().nullable(),
});
export type BrutoIA = z.infer<typeof SchemaIA>;

export interface ReciboExtraido {
  categoria: CategoriaDespesa;
  valorCentavos: number | null;
  dataDespesa: string | null;
  estabelecimento: string | null;
  documentoNumero: string | null;
  litros: number | null;
  kmVeiculo: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  observacao: string | null;
}

export function normalizarExtracao(bruto: BrutoIA): ReciboExtraido {
  const categoria = (CATEGORIAS_VALIDAS as readonly string[]).includes(bruto.categoria)
    ? (bruto.categoria as CategoriaDespesa)
    : 'outros';
  const confianca = (CONFIANCAS as readonly string[]).includes(bruto.confianca)
    ? (bruto.confianca as ReciboExtraido['confianca'])
    : 'baixa';
  const valorCentavos =
    typeof bruto.valorReais === 'number' && bruto.valorReais > 0
      ? Math.round(bruto.valorReais * 100)
      : null;
  const dataDespesa =
    typeof bruto.dataDespesa === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bruto.dataDespesa)
      ? bruto.dataDespesa
      : null;
  return {
    categoria,
    valorCentavos,
    dataDespesa,
    estabelecimento: bruto.estabelecimento || null,
    documentoNumero: bruto.documentoNumero || null,
    litros: typeof bruto.litros === 'number' ? bruto.litros : null,
    kmVeiculo: typeof bruto.kmVeiculo === 'number' ? bruto.kmVeiculo : null,
    confianca,
    observacao: bruto.observacao || null,
  };
}

function montarInstrucao(dica?: string): string {
  return [
    'Você recebe a foto de uma nota fiscal / cupom fiscal brasileiro de uma despesa de viagem.',
    'Extraia os campos do schema.',
    '- valorReais: o VALOR TOTAL pago, em reais, como número decimal (ex.: 250.9). Não é centavos.',
    '- categoria: a natureza do gasto. Uma de: ' + CATEGORIAS_VALIDAS.join(', ') + '.',
    '- dataDespesa: a data da compra no formato YYYY-MM-DD. Se não der pra ler, null.',
    '- estabelecimento: nome do posto/loja/restaurante. documentoNumero: nº do cupom/NF se legível.',
    '- litros / kmVeiculo: só pra combustível, se aparecerem; senão null.',
    "- confianca: 'alta' se leu tudo com clareza, 'media' com alguma dúvida, 'baixa' se o valor ou a data estão ilegíveis.",
    '- observacao: curto, só se tiver algo que o usuário precise saber (ex.: "valor rasurado").',
    dica ? `O usuário disse que esta despesa é: "${dica}". Respeite isso pra escolher a categoria.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function extrairRecibo(
  imagemBase64: string,
  mediaType: string,
  dica?: string,
): Promise<ReciboExtraido> {
  if (!process.env.ANTHROPIC_API_KEY) throw new IANaoConfiguradaError();

  const client = new Anthropic();
  const resp = await client.messages.parse({
    model: MODELO,
    max_tokens: 1024,
    output_config: { effort: 'low', format: zodOutputFormat(SchemaIA) },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: imagemBase64 },
          },
          { type: 'text', text: montarInstrucao(dica) },
        ],
      },
    ],
  });

  const bruto = resp.parsed_output;
  if (!bruto) throw new Error('A IA não devolveu um resultado válido.');
  return normalizarExtracao(bruto as BrutoIA);
}
