// ─────────────────────────────────────────
// despesasViagemReport.ts — Constantes e agregação pura das despesas de viagem.
// Sem I/O: recebe itens já carregados e devolve totais/linhas formatadas.
// Usado pelo router (validação) e, nas fases seguintes, pela geração de
// PDF/Excel. Testado com node:assert via tsx.
// ─────────────────────────────────────────

export const CATEGORIAS_VALIDAS = [
  'combustivel', 'pedagio', 'refeicao', 'hospedagem',
  'estacionamento', 'manutencao', 'outros',
] as const;
export type CategoriaDespesa = (typeof CATEGORIAS_VALIDAS)[number];

export const STATUS_VALIDOS = ['aberta', 'fechada', 'enviada'] as const;
export type StatusViagem = (typeof STATUS_VALIDOS)[number];

const ROTULO_CATEGORIA: Record<CategoriaDespesa, string> = {
  combustivel: 'Combustível',
  pedagio: 'Pedágio',
  refeicao: 'Refeição',
  hospedagem: 'Hospedagem',
  estacionamento: 'Estacionamento',
  manutencao: 'Manutenção',
  outros: 'Outros',
};

export function rotuloCategoria(cat: string): string {
  return ROTULO_CATEGORIA[cat as CategoriaDespesa] ?? cat;
}

function agrupaMilhar(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function centavosParaBRL(centavos: number): string {
  const sinal = centavos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centavos));
  const reais = agrupaMilhar(Math.floor(abs / 100));
  const cent = String(abs % 100).padStart(2, '0');
  return `${sinal}R$ ${reais},${cent}`;
}

export function formatarDataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export interface ItemDespesa {
  categoria: string;
  descricao: string | null;
  valorCentavos: number;
  dataDespesa: string;       // ISO date (YYYY-MM-DD), com ou sem hora
  estabelecimento: string | null;
}

export function totalCentavos(itens: ItemDespesa[]): number {
  return itens.reduce((s, i) => s + i.valorCentavos, 0);
}

export interface ResumoCategoria {
  categoria: string;
  rotulo: string;
  totalCentavos: number;
  qtd: number;
}

export function resumoPorCategoria(itens: ItemDespesa[]): ResumoCategoria[] {
  const mapa = new Map<string, ResumoCategoria>();
  for (const i of itens) {
    const cur = mapa.get(i.categoria) ?? {
      categoria: i.categoria, rotulo: rotuloCategoria(i.categoria), totalCentavos: 0, qtd: 0,
    };
    cur.totalCentavos += i.valorCentavos;
    cur.qtd += 1;
    mapa.set(i.categoria, cur);
  }
  return [...mapa.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export interface LinhaRelatorio {
  data: string;              // DD/MM/AAAA
  categoria: string;         // rótulo legível
  estabelecimento: string;
  descricao: string;
  valor: string;             // "R$ 1.234,56"
}

export function linhasRelatorio(itens: ItemDespesa[]): LinhaRelatorio[] {
  return [...itens]
    .sort((a, b) => a.dataDespesa.localeCompare(b.dataDespesa))
    .map((i) => ({
      data: formatarDataBR(i.dataDespesa),
      categoria: rotuloCategoria(i.categoria),
      estabelecimento: i.estabelecimento ?? '',
      descricao: i.descricao ?? '',
      valor: centavosParaBRL(i.valorCentavos),
    }));
}

// Converte um valor digitado em reais (formatos BR) para centavos inteiros.
// Devolve null se vazio, não-numérico ou <= 0.
export function reaisParaCentavos(input: string): number | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^r\$\s*/i, '').replace(/\s/g, '');
  if (s === '' || /[^\d.,]/.test(s)) return null;

  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    s = s.replace(/\./g, '').replace(',', '.');       // ponto=milhar, vírgula=decimal
  } else if (temVirgula) {
    s = s.replace(',', '.');
  } else if (temPonto) {
    const partes = s.split('.');
    // um único ponto com <=2 dígitos depois = decimal; qualquer outra coisa = milhar
    if (!(partes.length === 2 && partes[1].length <= 2)) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
