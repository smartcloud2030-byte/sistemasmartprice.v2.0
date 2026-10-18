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
}

export type StatusPV = 'vencido' | 'proximo' | 'atencao' | 'ok';

export const SETTINGS_KEY_PV = 'lista_pv';
export const DIAS_PROXIMO_PADRAO = 30;

// Cabeçalhos aceitos na planilha (sem acento, minúsculo). A primeira coluna
// cujo nome contém um destes termos é usada.
const COLUNAS: Record<keyof Omit<ItemPV, 'id'>, string[]> = {
  produto: ['produto', 'descricao', 'nome', 'item'],
  codigo: ['codigo', 'ean', 'barra', 'gtin', 'cod'],
  vencimento: ['vencimento', 'validade', 'venc', 'data'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'estoque'],
  lote: ['lote'],
  loja: ['loja', 'filial', 'unidade'],
};

const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const doisDig = (n: number) => String(n).padStart(2, '0');
const isoDe = (d: Date) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;

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
  for (const campo of ['vencimento', 'produto', 'quantidade', 'lote', 'loja', 'codigo'] as (keyof typeof COLUNAS)[]) {
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
    const qtdBruta = mapa.quantidade ? l[mapa.quantidade] : '';
    const qtd = qtdBruta === '' || qtdBruta == null ? null : Number(String(qtdBruta).replace(',', '.'));
    itens.push({
      id: crypto.randomUUID(),
      produto,
      codigo,
      vencimento,
      quantidade: qtd != null && isFinite(qtd) ? qtd : null,
      lote: mapa.lote ? String(l[mapa.lote] ?? '').trim() : '',
      loja: mapa.loja ? String(l[mapa.loja] ?? '').trim() : '',
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

/** Vencido (<0), próximo (≤ diasProximo), atenção (≤ 2× diasProximo), ok. */
export function statusPV(dias: number, diasProximo: number): StatusPV {
  if (dias < 0) return 'vencido';
  if (dias <= diasProximo) return 'proximo';
  if (dias <= diasProximo * 2) return 'atencao';
  return 'ok';
}

export const ROTULO_STATUS: Record<StatusPV, string> = {
  vencido: 'Vencido',
  proximo: 'Próximo do vencimento',
  atencao: 'Atenção',
  ok: 'Dentro do prazo',
};

export const dataBR = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export function exportarPV(itens: ItemPV[], diasProximo: number, nomeArquivo: string) {
  const linhas = itens.map((i) => {
    const dias = diasParaVencer(i.vencimento);
    return {
      Produto: i.produto,
      Código: i.codigo,
      Vencimento: dataBR(i.vencimento),
      'Dias para vencer': dias,
      Situação: ROTULO_STATUS[statusPV(dias, diasProximo)],
      Quantidade: i.quantidade ?? '',
      Lote: i.lote,
      Loja: i.loja,
    };
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 11 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, nomeArquivo);
}

export function baixarModeloPV() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Produto', 'Código', 'Vencimento', 'Quantidade', 'Lote', 'Loja'],
    ['DIPIRONA 500MG 10 COMP', '7891234567890', '15/12/2026', 12, 'L2345', 'Loja Centro'],
  ]);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lista PV');
  XLSX.writeFile(wb, 'modelo-lista-pv.xlsx');
}
