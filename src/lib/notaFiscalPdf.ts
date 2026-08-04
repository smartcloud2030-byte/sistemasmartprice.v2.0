import { jsPDF } from 'jspdf';

export interface ComprovanteNotaFiscalInput {
  numeroNota: string;
  chaveAcesso: string;
  cnpjTomador: string;
  nomeTomador: string;
  descricaoServico: string;
  valor: number;
  dataEmissao: string;
}

const currency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCnpj(cnpj: string): string {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function baixarComprovanteNotaFiscalPdf(input: ComprovanteNotaFiscalInput) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 20;
  let y = margin;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('Comprovante de Nota Fiscal de Serviço (NFS-e)', margin, y);
  y += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  const aviso = pdf.splitTextToSize(
    'Este comprovante não substitui a via oficial do governo. Para consultar/imprimir o documento fiscal oficial (DANFSe), acesse nfse.gov.br/consultapublica e informe a chave de acesso abaixo.',
    170
  );
  pdf.text(aviso, margin, y);
  y += aviso.length * 4.5 + 8;

  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, 190, y);
  y += 10;

  const linha = (label: string, valor: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(label, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(20, 20, 20);
    const texto = pdf.splitTextToSize(valor, 120);
    pdf.text(texto, margin + 50, y);
    y += Math.max(7, texto.length * 5.5);
  };

  linha('Prestador (CNPJ):', formatCnpj('66125544000198'));
  linha('Tomador:', input.nomeTomador);
  linha('CNPJ do tomador:', formatCnpj(input.cnpjTomador));
  linha('Número da nota:', input.numeroNota);
  linha('Chave de acesso:', input.chaveAcesso);
  linha('Descrição do serviço:', input.descricaoServico);
  linha('Valor:', currency(input.valor));
  linha('Data de emissão:', new Date(input.dataEmissao).toLocaleString('pt-BR'));

  y += 5;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, 190, y);
  y += 8;

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(9);
  pdf.setTextColor(120, 120, 120);
  pdf.text('Consulta pública oficial: https://www.nfse.gov.br/consultapublica', margin, y);

  pdf.save(`nota-fiscal-${input.numeroNota || input.chaveAcesso}.pdf`);
}
