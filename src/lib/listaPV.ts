// Lista PV (produtos próximos do vencimento): leitura da planilha importada,
// cálculo de dias até vencer e exportação. Sem React aqui — só dados.
import * as XLSX from 'xlsx';

export interface ItemPV {
  id: string;
  produto: string;
  codigo: string;
  /** YYYY-MM-DD */
  vencimento: string;
  quantidade: number | null;
  lote: string;
  loja: string;
  /** Custo unitário em R$ (listas importadas antes de 2026-10-25 não têm). */
  custo?: number | null;
  /** Desconto em % (10 = 10%). */
  desconto?: number | null;
  /** Preço de oferta em R$ — base do cálculo do desconto em reais. */
  precoOferta?: number | null;
  /** % digitado na mão na linha — vale mais que o do período e o da planilha. */
  descontoManual?: number | null;
}

// Colunas que o usuário liga/desliga na tela e na exportação.
export type ColunaOpcionalPV = 'quantidade' | 'lote' | 'loja' | 'custo' | 'precoOferta' | 'desconto';
export const COLUNAS_OPCIONAIS_PV: { chave: ColunaOpcionalPV; rotulo: string }[] = [
  { chave: 'quantidade', rotulo: 'Qtd' },
  { chave: 'lote', rotulo: 'Lote' },
  { chave: 'loja', rotulo: 'Loja' },
  { chave: 'custo', rotulo: 'Custo' },
  { chave: 'precoOferta', rotulo: 'Preço de oferta' },
  { chave: 'desconto', rotulo: 'Desconto' },
];
export type ColunasPV = Record<ColunaOpcionalPV, boolean>;
export const COLUNAS_PV_PADRAO: ColunasPV = { quantidade: true, lote: true, loja: true, custo: true, precoOferta: true, desconto: true };

export type StatusPV = 'vencido' | 'vermelho' | 'amareloEscuro' | 'amareloClaro' | 'verde';

export const SETTINGS_KEY_PV = 'lista_pv';

// Cabeçalhos aceitos na planilha (sem acento, minúsculo). A primeira coluna
// cujo nome contém um destes termos é usada.
const COLUNAS: Record<keyof Omit<ItemPV, 'id' | 'descontoManual'>, string[]> = {
  produto: ['produto', 'descricao', 'nome', 'item'],
  codigo: ['codigo', 'ean', 'barra', 'gtin', 'cod'],
  vencimento: ['vencimento', 'validade', 'venc', 'data'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'estoque'],
  lote: ['lote'],
  loja: ['loja', 'filial', 'unidade'],
  custo: ['custo'],
  desconto: ['desconto'],
  precoOferta: ['oferta', 'preco venda', 'preco'],
};

const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const doisDig = (n: number) => String(n).padStart(2, '0');
const isoDe = (d: Date) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;

/** "R$ 1.234,56", "12,5", 12.5 → número; vazio ou inválido → null. */
export function lerNumero(valor: unknown): number | null {
  if (valor === '' || valor == null) return null;
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  let s = String(valor).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  // vírgula decimal brasileira: ponto vira separador de milhar
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** "10%", "10", 10 → 10. Célula formatada como % no Excel chega como 0,1 → 10. */
export function lerDesconto(valor: unknown): number | null {
  const n = lerNumero(valor);
  if (n == null) return null;
  if (typeof valor === 'number' && n > 0 && n < 1) return Math.round(n * 10000) / 100;
  return n;
}

export const moedaBR = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const percentualBR = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Aceita Date (célula de data), número serial do Excel, dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd. */
export function lerData(valor: unknown): string | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) return isoDe(valor);
  if (typeof valor === 'number' && isFinite(valor)) {
    const p = XLSX.SSF.parse_date_code(valor);
    if (p && p.y) return `${p.y}-${doisDig(p.m)}-${doisDig(p.d)}`;
    return null;
  }
  const s = String(valor ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${doisDig(+m[2])}-${doisDig(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let ano = +m[3];
    if (ano < 100) ano += 2000;
    const dia = +m[1];
    const mes = +m[2];
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return `${ano}-${doisDig(mes)}-${doisDig(dia)}`;
  }
  // mm/aaaa (validade só com mês) → último dia do mês
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const ultimo = new Date(+m[2], +m[1], 0);
    return isoDe(ultimo);
  }
  return null;
}

export interface ResultadoImportacao {
  itens: ItemPV[];
  ignoradas: number;
  colunasEncontradas: string[];
}

export async function importarArquivoPV(arquivo: File): Promise<ResultadoImportacao> {
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const aba = wb.Sheets[wb.SheetNames[0]];
  if (!aba) throw new Error('A planilha está vazia.');
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '', raw: true });
  if (!linhas.length) throw new Error('A planilha não tem linhas.');

  const cabecalhos = Object.keys(linhas[0]);
  const mapa: Partial<Record<keyof typeof COLUNAS, string>> = {};
  const usados = new Set<string>();
  // vencimento antes de código ("cod" casaria com muita coisa) e de data genérica
  for (const campo of ['vencimento', 'produto', 'quantidade', 'lote', 'loja', 'custo', 'desconto', 'precoOferta', 'codigo'] as (keyof typeof COLUNAS)[]) {
    // Termo por termo, na ordem de prioridade: "Validade" ganha de uma
    // "Data de fabricação" que vem antes na planilha.
    let achado: string | undefined;
    for (const t of COLUNAS[campo]) {
      achado = cabecalhos.find((h) => !usados.has(h) && normalizar(h).includes(t));
      if (achado) break;
    }
    if (achado) {
      mapa[campo] = achado;
      usados.add(achado);
    }
  }
  if (!mapa.vencimento) throw new Error('Não achei a coluna de vencimento/validade na planilha.');
  if (!mapa.produto && !mapa.codigo) throw new Error('Não achei a coluna de produto (descrição) nem de código.');

  const itens: ItemPV[] = [];
  let ignoradas = 0;
  for (const l of linhas) {
    const vencimento = lerData(l[mapa.vencimento]);
    const produto = mapa.produto ? String(l[mapa.produto] ?? '').trim() : '';
    const codigo = mapa.codigo ? String(l[mapa.codigo] ?? '').trim() : '';
    if (!vencimento || (!produto && !codigo)) {
      ignoradas++;
      continue;
    }
    const qtd = mapa.quantidade ? lerNumero(l[mapa.quantidade]) : null;
    itens.push({
      id: crypto.randomUUID(),
      produto,
      codigo,
      vencimento,
      quantidade: qtd,
      lote: mapa.lote ? String(l[mapa.lote] ?? '').trim() : '',
      loja: mapa.loja ? String(l[mapa.loja] ?? '').trim() : '',
      custo: mapa.custo ? lerNumero(l[mapa.custo]) : null,
      desconto: mapa.desconto ? lerDesconto(l[mapa.desconto]) : null,
      precoOferta: mapa.precoOferta ? lerNumero(l[mapa.precoOferta]) : null,
    });
  }
  return { itens, ignoradas, colunasEncontradas: Object.entries(mapa).map(([k, v]) => `${k}: ${v}`) };
}

export function diasParaVencer(vencimento: string, hoje = new Date()): number {
  const [a, m, d] = vencimento.split('-').map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86_400_000);
}

// Faixas por dias até vencer. Os limites são editáveis (Descontos > duplo
// clique no período) e encadeados: o fim de uma faixa é o início da seguinte.
//   vencido        < 0
//   vermelho       0 .. limites[0]   (vence hoje conta aqui)
//   amareloEscuro  limites[0]+1 .. limites[1]
//   amareloClaro   limites[1]+1 .. limites[2]
//   verde          limites[2]+1 em diante
// Padrão: 30 / 60 / 179 (1-30 dias, 31-60 dias, 3 a 5 meses, 6 meses ou mais).
export type UnidadeFaixa = 'dias' | 'meses';
export type FaixaEditavel = Exclude<StatusPV, 'vencido'>;
export interface FaixasPV {
  limites: [number, number, number];
  unidades: Record<FaixaEditavel, UnidadeFaixa>;
}
export const FAIXAS_PV_PADRAO: FaixasPV = {
  limites: [30, 60, 179],
  unidades: { vermelho: 'dias', amareloEscuro: 'dias', amareloClaro: 'meses', verde: 'meses' },
};

/** Junta o que veio salvo com o padrão; limites inválidos voltam pro padrão. */
export function normalizarFaixas(f?: Partial<FaixasPV> | null): FaixasPV {
  const l = f?.limites;
  const ok = Array.isArray(l) && l.length === 3 && l.every((n) => Number.isInteger(n)) && l[0] >= 0 && l[0] < l[1] && l[1] < l[2];
  return {
    limites: ok ? [l[0], l[1], l[2]] : FAIXAS_PV_PADRAO.limites,
    unidades: { ...FAIXAS_PV_PADRAO.unidades, ...(f?.unidades || {}) },
  };
}

export function statusPV(dias: number, limites: [number, number, number] = FAIXAS_PV_PADRAO.limites): StatusPV {
  if (dias < 0) return 'vencido';
  if (dias <= limites[0]) return 'vermelho';
  if (dias <= limites[1]) return 'amareloEscuro';
  if (dias <= limites[2]) return 'amareloClaro';
  return 'verde';
}

/** Dias de início e fim da faixa (fim null = sem limite). */
export function intervaloFaixa(status: FaixaEditavel, f: FaixasPV): { de: number; ate: number | null } {
  const [a, b, c] = f.limites;
  if (status === 'vermelho') return { de: 0, ate: a };
  if (status === 'amareloEscuro') return { de: a + 1, ate: b };
  if (status === 'amareloClaro') return { de: b + 1, ate: c };
  return { de: c + 1, ate: null };
}

// Meses = meses completos (30 dias): "de 4 meses" começa no dia 120,
// "até 5 meses" vai até o dia 179 (antes de completar 6).
export const diasDoInicio = (v: number, u: UnidadeFaixa) => (u === 'meses' ? v * 30 : v);
export const diasDoFim = (v: number, u: UnidadeFaixa) => (u === 'meses' ? (v + 1) * 30 - 1 : v);
export const exibirInicio = (d: number, u: UnidadeFaixa) => (u === 'meses' ? Math.ceil(d / 30) : d);
export const exibirFim = (d: number, u: UnidadeFaixa) => (u === 'meses' ? Math.floor((d + 1) / 30) - 1 : d);
const alinhadoInicio = (d: number) => d % 30 === 0 || (d - 1) % 30 === 0;
const alinhadoFim = (d: number) => (d + 1) % 30 === 0 || d % 30 === 0;

export function rotuloFaixa(status: StatusPV, f: FaixasPV = FAIXAS_PV_PADRAO): string {
  if (status === 'vencido') return 'Vencidos';
  const u = f.unidades[status];
  const { de, ate } = intervaloFaixa(status, f);
  const nome = (n: number) => (u === 'meses' ? (n === 1 ? 'mês' : 'meses') : n === 1 ? 'dia' : 'dias');
  if (ate == null) {
    const n = exibirInicio(de, u);
    return `${n} ${nome(n)} ou mais`;
  }
  const fim = exibirFim(ate, u);
  if (status === 'vermelho') return u === 'meses' ? `Até ${fim} ${nome(fim)}` : `1 a ${fim} ${nome(fim)}`;
  const ini = exibirInicio(de, u);
  return ini === fim ? `${ini} ${nome(ini)}` : `${ini} a ${fim} ${nome(fim)}`;
}

/**
 * Muda o período de uma faixa (valores já em dias). Ajusta as vizinhas pra
 * continuar encadeado. Vizinha em meses que deixa de cair num mês redondo
 * passa a ser mostrada em dias. Erro → string.
 */
export function editarFaixa(f: FaixasPV, status: FaixaEditavel, de: number | null, ate: number | null, unidade: UnidadeFaixa): FaixasPV | string {
  const l: [number, number, number] = [...f.limites];
  if (status === 'vermelho') { if (ate == null) return 'Informe até quantos dias.'; l[0] = ate; }
  if (status === 'amareloEscuro') { if (de == null || ate == null) return 'Informe o início e o fim.'; l[0] = de - 1; l[1] = ate; }
  if (status === 'amareloClaro') { if (de == null || ate == null) return 'Informe o início e o fim.'; l[1] = de - 1; l[2] = ate; }
  if (status === 'verde') { if (de == null) return 'Informe a partir de quando.'; l[2] = de - 1; }
  if (l[0] < 0) return 'O primeiro período precisa começar depois de hoje.';
  if (!(l[0] < l[1] && l[1] < l[2])) return 'Os períodos ficaram sobrepostos — o fim tem que ser depois do início e não pode passar do período seguinte.';
  const novo: FaixasPV = { limites: l, unidades: { ...f.unidades, [status]: unidade } };
  for (const v of ['vermelho', 'amareloEscuro', 'amareloClaro', 'verde'] as FaixaEditavel[]) {
    if (v === status || novo.unidades[v] !== 'meses') continue;
    const { de: d, ate: a } = intervaloFaixa(v, novo);
    if ((v !== 'vermelho' && !alinhadoInicio(d)) || (a != null && !alinhadoFim(a))) novo.unidades[v] = 'dias';
  }
  return novo;
}

export const ROTULO_STATUS: Record<StatusPV, string> = {
  vencido: 'Vencido',
  vermelho: 'Vence em até 30 dias',
  amareloEscuro: '31 a 60 dias',
  amareloClaro: '3 a 5 meses',
  verde: '6 meses ou mais',
};

/** Desconto (%) configurado por período. Ordem: % manual da linha > período > planilha. */
export type DescontosPorFaixa = Partial<Record<StatusPV, number>>;

export const ORDEM_FAIXAS: StatusPV[] = ['vencido', 'vermelho', 'amareloEscuro', 'amareloClaro', 'verde'];

export function percentualDescontoPV(item: ItemPV, status: StatusPV, faixas?: DescontosPorFaixa): number | null {
  if (item.descontoManual != null) return item.descontoManual;
  const daFaixa = faixas?.[status];
  if (daFaixa != null && isFinite(daFaixa)) return daFaixa;
  return item.desconto ?? null;
}

/** Desconto em R$ sobre o preço de oferta (arredondado em centavos); null se faltar preço ou %. */
export function valorDescontoPV(precoOferta: number | null | undefined, percentual: number | null): number | null {
  if (precoOferta == null || percentual == null) return null;
  return Math.round(precoOferta * percentual) / 100;
}

export const dataBR = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export function exportarPV(
  itens: ItemPV[],
  nomeArquivo: string,
  colunas: ColunasPV = COLUNAS_PV_PADRAO,
  faixas?: DescontosPorFaixa,
  periodos: FaixasPV = FAIXAS_PV_PADRAO,
) {
  const linhas = itens.map((i) => {
    const dias = diasParaVencer(i.vencimento);
    const st = statusPV(dias, periodos.limites);
    const pct = percentualDescontoPV(i, st, faixas);
    const linha: Record<string, string | number> = {
      Produto: i.produto,
      Código: i.codigo,
      Vencimento: dataBR(i.vencimento),
      'Dias para vencer': dias,
      Situação: st === 'vencido' ? 'Vencido' : rotuloFaixa(st, periodos),
    };
    if (colunas.quantidade) linha.Quantidade = i.quantidade ?? '';
    if (colunas.lote) linha.Lote = i.lote;
    if (colunas.loja) linha.Loja = i.loja;
    if (colunas.custo) linha.Custo = i.custo ?? '';
    if (colunas.precoOferta) linha['Preço de oferta'] = i.precoOferta ?? '';
    if (colunas.desconto) {
      linha['Desconto (%)'] = pct ?? '';
      linha['Desconto (R$)'] = valorDescontoPV(i.precoOferta, pct) ?? '';
    }
    return linha;
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  const larguras: Record<string, number> = { Quantidade: 11, Lote: 12, Loja: 18, Custo: 12, 'Preço de oferta': 15, 'Desconto (%)': 13, 'Desconto (R$)': 14 };
  ws['!cols'] = [40, 16, 12, 16, 22, ...Object.keys(linhas[0] || {}).slice(5).map((k) => larguras[k] || 12)].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, nomeArquivo);
}

export function baixarModeloPV() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Produto', 'Código', 'Vencimento', 'Quantidade', 'Lote', 'Loja', 'Custo', 'Preço de oferta', 'Desconto (%)'],
    ['DIPIRONA 500MG 10 COMP', '7891234567890', '15/12/2026', 12, 'L2345', 'Loja Centro', 4.35, 8.99, 10],
  ]);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 13 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, 'modelo-lista-pv.xlsx');
}
