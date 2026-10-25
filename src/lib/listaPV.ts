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
}

// Colunas que o usuário liga/desliga na tela e na exportação.
export type ColunaOpcionalPV = 'quantidade' | 'lote' | 'loja' | 'custo' | 'desconto';
export const COLUNAS_OPCIONAIS_PV: { chave: ColunaOpcionalPV; rotulo: string }[] = [
  { chave: 'quantidade', rotulo: 'Qtd' },
  { chave: 'lote', rotulo: 'Lote' },
  { chave: 'loja', rotulo: 'Loja' },
  { chave: 'custo', rotulo: 'Custo' },
  { chave: 'desconto', rotulo: 'Desconto' },
];
export type ColunasPV = Record<ColunaOpcionalPV, boolean>;
export const COLUNAS_PV_PADRAO: ColunasPV = { quantidade: true, lote: true, loja: true, custo: true, desconto: true };

export type StatusPV = 'vencido' | 'vermelho' | 'amareloEscuro' | 'amareloClaro' | 'verde';

export const SETTINGS_KEY_PV = 'lista_pv';

// Cabeçalhos aceitos na planilha (sem acento, minúsculo). A primeira coluna
// cujo nome contém um destes termos é usada.
const COLUNAS: Record<keyof Omit<ItemPV, 'id'>, string[]> = {
  produto: ['produto', 'descricao', 'nome', 'item'],
  codigo: ['codigo', 'ean', 'barra', 'gtin', 'cod'],
  vencimento: ['vencimento', 'validade', 'venc', 'data'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'estoque'],
  lote: ['lote'],
  loja: ['loja', 'filial', 'unidade'],
  custo: ['custo'],
  desconto: ['desconto'],
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
  for (const campo of ['vencimento', 'produto', 'quantidade', 'lote', 'loja', 'custo', 'desconto', 'codigo'] as (keyof typeof COLUNAS)[]) {
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

// Faixas por dias até vencer (6 meses ≈ 180 dias, 3 meses ≈ 90):
//   vencido        < 0
//   vermelho       0–30   (vence hoje conta aqui)
//   amarelo escuro 31–60
//   amarelo claro  61–179 (3 a 5 meses; cobre também o vão 61–90 e 5–6 meses)
//   verde          180+   (6 meses ou mais)
export function statusPV(dias: number): StatusPV {
  if (dias < 0) return 'vencido';
  if (dias <= 30) return 'vermelho';
  if (dias <= 60) return 'amareloEscuro';
  if (dias < 180) return 'amareloClaro';
  return 'verde';
}

export const ROTULO_STATUS: Record<StatusPV, string> = {
  vencido: 'Vencido',
  vermelho: 'Vence em até 30 dias',
  amareloEscuro: '31 a 60 dias',
  amareloClaro: '3 a 5 meses',
  verde: '6 meses ou mais',
};

export const dataBR = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export function exportarPV(itens: ItemPV[], nomeArquivo: string, colunas: ColunasPV = COLUNAS_PV_PADRAO) {
  const linhas = itens.map((i) => {
    const dias = diasParaVencer(i.vencimento);
    const linha: Record<string, string | number> = {
      Produto: i.produto,
      Código: i.codigo,
      Vencimento: dataBR(i.vencimento),
      'Dias para vencer': dias,
      Situação: ROTULO_STATUS[statusPV(dias)],
    };
    if (colunas.quantidade) linha.Quantidade = i.quantidade ?? '';
    if (colunas.lote) linha.Lote = i.lote;
    if (colunas.loja) linha.Loja = i.loja;
    if (colunas.custo) linha.Custo = i.custo ?? '';
    if (colunas.desconto) linha['Desconto (%)'] = i.desconto ?? '';
    return linha;
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  const larguras: Record<string, number> = { Quantidade: 11, Lote: 12, Loja: 18, Custo: 12, 'Desconto (%)': 13 };
  ws['!cols'] = [40, 16, 12, 16, 22, ...Object.keys(linhas[0] || {}).slice(5).map((k) => larguras[k] || 12)].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, nomeArquivo);
}

export function baixarModeloPV() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Produto', 'Código', 'Vencimento', 'Quantidade', 'Lote', 'Loja', 'Custo', 'Desconto (%)'],
    ['DIPIRONA 500MG 10 COMP', '7891234567890', '15/12/2026', 12, 'L2345', 'Loja Centro', 4.35, 10],
  ]);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 13 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, 'modelo-lista-pv.xlsx');
}
