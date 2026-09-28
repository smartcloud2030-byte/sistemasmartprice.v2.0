// ─────────────────────────────────────────
// despesasViagemFiles.ts — geração dos arquivos de relatório da viagem
// (fase 6): PDF (pdfkit) e Excel (xlsx/SheetJS). Recebe dados já carregados
// (itens +, opcionalmente, os buffers dos recibos) e devolve um Buffer —
// sem acesso a Postgres/MinIO aqui; isso é papel do router e do bot.
// ─────────────────────────────────────────
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import {
  type ItemDespesa, type LinhaRelatorio, linhasRelatorio, resumoPorCategoria, totalCentavos,
  centavosParaBRL, formatarDataBR, rotuloCategoria,
} from './despesasViagemReport';

export interface ViagemParaRelatorio {
  titulo: string;
  destino: string | null;
  motivo: string | null;
  empresa: string;
  dataInicio: string | null; // ISO
  dataFim: string | null;    // ISO
}

export interface ReciboAnexo {
  buffer: Buffer;
  categoria: string;
  valorCentavos: number | null;
  estabelecimento: string | null;
}

export function slugDestino(v: { destino: string | null; titulo: string }): string {
  const base = (v.destino || v.titulo || 'viagem').toLowerCase();
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'viagem'
  );
}

export function nomeArquivoRelatorio(v: { destino: string | null; titulo: string }, formato: 'pdf' | 'xlsx'): string {
  const data = new Date().toISOString().slice(0, 10);
  const slug = slugDestino(v);
  return formato === 'pdf' ? `relatorio-viagem-${slug}-${data}.pdf` : `despesas-${slug}-${data}.xlsx`;
}

function periodoLabel(v: ViagemParaRelatorio): string {
  const a = v.dataInicio ? formatarDataBR(v.dataInicio) : '';
  const b = v.dataFim ? formatarDataBR(v.dataFim) : '';
  if (a && b) return `${a} – ${b}`;
  return a || b || 'sem período definido';
}

const COLS: { chave: keyof LinhaRelatorio; rotulo: string; largura: number }[] = [
  { chave: 'data', rotulo: 'Data', largura: 60 },
  { chave: 'categoria', rotulo: 'Categoria', largura: 80 },
  { chave: 'estabelecimento', rotulo: 'Estabelecimento', largura: 130 },
  { chave: 'descricao', rotulo: 'Descrição', largura: 130 },
  { chave: 'valor', rotulo: 'Valor', largura: 65 },
];

export async function gerarRelatorioPDF(
  viagem: ViagemParaRelatorio,
  itens: ItemDespesa[],
  recibos: ReciboAnexo[] = [],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const margemEsq = doc.page.margins.left;
  const larguraUtil = doc.page.width - margemEsq - doc.page.margins.right;

  // ── Cabeçalho ──
  doc.fontSize(18).font('Helvetica-Bold').text('Relatório de Despesas de Viagem', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#444')
    .text(`${viagem.empresa}`)
    .text(`Viagem: ${viagem.titulo}${viagem.motivo ? ` — ${viagem.motivo}` : ''}`)
    .text(`Período: ${periodoLabel(viagem)}`)
    .text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`);
  doc.fillColor('#000');
  doc.moveDown(1);

  // ── Tabela ──
  const linhas = linhasRelatorio(itens);
  const alturaLinha = 20;

  function cabecalhoTabela() {
    let x = margemEsq;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    for (const c of COLS) {
      doc.text(c.rotulo, x + 2, y + 5, { width: c.largura - 4 });
      x += c.largura;
    }
    doc.moveTo(margemEsq, y + alturaLinha).lineTo(margemEsq + larguraUtil, y + alturaLinha).strokeColor('#ccc').stroke();
    doc.y = y + alturaLinha + 2;
  }

  function garantirEspaco(altura: number) {
    if (doc.y + altura > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      cabecalhoTabela();
    }
  }

  cabecalhoTabela();
  doc.font('Helvetica').fontSize(9);
  for (const l of linhas) {
    garantirEspaco(alturaLinha);
    let x = margemEsq;
    const y = doc.y;
    for (const c of COLS) {
      doc.text(l[c.chave] ?? '', x + 2, y + 4, { width: c.largura - 4, ellipsis: true });
      x += c.largura;
    }
    doc.y = y + alturaLinha;
  }
  doc.moveTo(margemEsq, doc.y).lineTo(margemEsq + larguraUtil, doc.y).strokeColor('#ccc').stroke();
  doc.moveDown(1);

  // ── Totais por categoria + total geral ──
  garantirEspaco(120);
  doc.font('Helvetica-Bold').fontSize(11).text('Totais por categoria');
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10);
  for (const r of resumoPorCategoria(itens)) {
    garantirEspaco(16);
    doc.text(`${r.rotulo}: ${centavosParaBRL(r.totalCentavos)} (${r.qtd} ${r.qtd === 1 ? 'item' : 'itens'})`);
  }
  doc.moveDown(0.5);
  garantirEspaco(30);
  doc.font('Helvetica-Bold').fontSize(14).text(`Total geral: ${centavosParaBRL(totalCentavos(itens))}`);

  // ── Anexo: imagens dos recibos, 2 por página ──
  const validos: { png: Buffer; legenda: string }[] = [];
  for (const r of recibos) {
    try {
      const png = await sharp(r.buffer).rotate().resize({ width: 900, withoutEnlargement: true }).png().toBuffer();
      const valor = r.valorCentavos == null ? 'valor não lido' : centavosParaBRL(r.valorCentavos);
      validos.push({ png, legenda: `${rotuloCategoria(r.categoria)} · ${valor}${r.estabelecimento ? ` · ${r.estabelecimento}` : ''}` });
    } catch (e) {
      console.error('[despesas-viagem] recibo ilegível, pulando do PDF:', e);
    }
  }

  if (validos.length > 0) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).text('Anexo — recibos');
    doc.moveDown(0.5);
    const alturaImg = (doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 60) / 2;
    let naPagina = 0;
    for (const { png, legenda } of validos) {
      if (naPagina === 2) {
        doc.addPage();
        naPagina = 0;
      }
      try {
        doc.image(png, margemEsq, doc.y, { fit: [larguraUtil, alturaImg - 16], align: 'center' });
      } catch (e) {
        console.error('[despesas-viagem] falha ao embutir recibo no PDF:', e);
      }
      doc.y += alturaImg - 16;
      doc.font('Helvetica').fontSize(9).text(legenda, margemEsq, doc.y, { width: larguraUtil, align: 'center' });
      doc.y += 16;
      naPagina += 1;
    }
  }

  // ── Rodapé ──
  doc.font('Helvetica').fontSize(8).fillColor('#888').text(
    `Gerado pelo SmartPrice em ${new Date().toLocaleDateString('pt-BR')}`,
    margemEsq,
    doc.page.height - doc.page.margins.bottom + 10,
    { width: larguraUtil, align: 'center' },
  );

  doc.end();
  return fim;
}

export function gerarRelatorioXLSX(viagem: ViagemParaRelatorio, itens: ItemDespesa[]): Buffer {
  const linhasDespesas = itens
    .map((i) => ({ ...i }))
    .sort((a, b) => a.dataDespesa.localeCompare(b.dataDespesa))
    .map((i) => ({
      Data: formatarDataBR(i.dataDespesa),
      Categoria: rotuloCategoria(i.categoria),
      Estabelecimento: i.estabelecimento ?? '',
      Descrição: i.descricao ?? '',
      'Valor (R$)': i.valorCentavos / 100,
    }));

  const resumo = resumoPorCategoria(itens);
  const linhasResumo = [
    ...resumo.map((r) => ({ Categoria: r.rotulo, Itens: r.qtd, 'Total (R$)': r.totalCentavos / 100 })),
    { Categoria: 'TOTAL GERAL', Itens: itens.length, 'Total (R$)': totalCentavos(itens) / 100 },
  ];

  const wb = XLSX.utils.book_new();
  const wsDespesas = XLSX.utils.json_to_sheet(linhasDespesas);
  wsDespesas['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDespesas, 'Despesas');

  const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
  wsResumo['!cols'] = [{ wch: 18 }, { wch: 8 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
