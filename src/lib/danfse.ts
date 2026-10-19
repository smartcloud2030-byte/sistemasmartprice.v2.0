// ─────────────────────────────────────────
// danfse.ts — DANFSe v2.0 (layout nacional) montado a partir do XML oficial
// da NFS-e. A API da prefeitura só entrega o XML (não tem rota de PDF), então
// o PDF é desenhado aqui, copiando o modelo emitido pelo portal nacional.
// Só roda no servidor (usado no anexo do e-mail e na rota de download).
// ─────────────────────────────────────────
import { XMLParser } from 'fast-xml-parser';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export interface DanfseParte {
  doc: string;
  im: string;
  fone: string;
  nome: string;
  cMun: string;
  municipio: string;
  uf: string;
  cep: string;
  endereco: string;
  email: string;
}

export interface DanfseDados {
  chave: string;
  numero: string;
  competencia: string;
  dhEmissaoNfse: string;
  numeroDps: string;
  serieDps: string;
  dhEmissaoDps: string;
  emitente: string;
  situacao: string;
  ambienteGerador: string;
  tipoAmbiente: string;
  municipioEmissor: string;
  prestador: DanfseParte & { simplesNacional: string; regimeApuracaoSn: string };
  tomador: DanfseParte | null;
  servico: {
    codigoTributacao: string;
    codigoNbs: string;
    localPrestacao: string;
    descricaoTributacao: string;
    descricao: string;
  };
  issqn: {
    tipoTributacao: string;
    municipioIncidencia: string;
    regimeEspecial: string;
    retencao: string;
    baseCalculo: string;
    aliquota: string;
    valorApurado: string;
    deducoes: string;
    descontoIncondicionado: string;
  };
  federal: { irrf: string; cp: string; csll: string; pis: string; cofins: string };
  valores: {
    servico: string;
    descontoIncondicionado: string;
    descontoCondicionado: string;
    retencoes: string;
    liquido: string;
  };
  informacoesComplementares: string;
}

const VAZIO = '-';

const OP_SIMPLES: Record<string, string> = { '1': 'Não Optante', '2': 'Optante - Microempreendedor Individual (MEI)', '3': 'Optante ME/EPP' };
const REG_AP_SN: Record<string, string> = {
  '1': 'Apuração SN federais e municipal',
  '2': 'Apuração SN federais, ISSQN fora do SN',
  '3': 'Apuração federais e municipal fora do SN',
};
const REG_ESP: Record<string, string> = {
  '0': 'Nenhum', '1': 'Ato Cooperado', '2': 'Estimativa', '3': 'Microempresa Municipal',
  '4': 'Notário ou Registrador', '5': 'Profissional Autônomo', '6': 'Sociedade de Profissionais',
};
const TRIB_ISSQN: Record<string, string> = { '1': 'Operação tributável', '2': 'Imunidade', '3': 'Exportação de serviço', '4': 'Não Incidência' };
const RET_ISSQN: Record<string, string> = { '1': 'Não retido', '2': 'Retido pelo Tomador', '3': 'Retido pelo Intermediário' };
const TP_EMIT: Record<string, string> = { '1': 'Prestador', '2': 'Tomador', '3': 'Intermediário' };
const AMB_GER: Record<string, string> = { '1': 'Prefeitura', '2': 'Sefin Nacional' };

const txt = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const ouVazio = (v: string) => v || VAZIO;

export function formatarDoc(doc: string): string {
  const d = doc.replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

const formatarCep = (cep: string) => (/^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep);

/** "2026-10-19T12:14:56-03:00" → "19/10/2026 12:14:56" (sem mexer no fuso). */
export function formatarDataHora(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ''}`;
}

export function formatarMoeda(valor: string): string {
  if (!valor) return VAZIO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return valor;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const moedaOuVazio = (v: string) => (v && Number(v) !== 0 ? formatarMoeda(v) : VAZIO);

function montarEndereco(e: any): string {
  if (!e) return '';
  return [txt(e.xLgr), txt(e.nro), txt(e.xCpl), txt(e.xBairro)].filter(Boolean).join(', ');
}

export function urlConsultaPublica(chave: string): string {
  return `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`;
}

/**
 * Lê o XML oficial (layout nacional, schema sped.fazenda.gov.br/nfse) e devolve
 * os campos do DANFSe. Nome do município do tomador não vem no XML (só o código
 * IBGE) — fica vazio aqui e é preenchido por quem chama (ver gerarDanfsePdf).
 */
export function lerXmlNfse(xml: string): DanfseDados {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, parseTagValue: false });
  const raiz = parser.parse(xml);
  const inf = raiz?.NFSe?.infNFSe;
  if (!inf) throw new Error('XML não é uma NFS-e nacional (infNFSe ausente).');

  const dps = inf.DPS?.infDPS || {};
  const emit = inf.emit || {};
  const prest = dps.prest || {};
  const toma = dps.toma;
  const serv = dps.serv || {};
  const vDps = dps.valores || {};
  const vNfse = inf.valores || {};
  const tribMun = vDps.trib?.tribMun || {};
  const tribFed = vDps.trib?.tribFed || {};
  const totTrib = vDps.trib?.totTrib?.vTotTrib;

  const chave = txt(inf['@Id']).replace(/^NFS/, '');
  const ufEmissor = txt(emit.enderNac?.UF);

  const tomadorEnd = toma?.end || {};
  const tomador: DanfseParte | null = toma
    ? {
        doc: formatarDoc(txt(toma.CNPJ) || txt(toma.CPF) || txt(toma.NIF)),
        im: txt(toma.IM),
        fone: txt(toma.fone),
        nome: txt(toma.xNome),
        cMun: txt(tomadorEnd.endNac?.cMun),
        municipio: '',
        uf: '',
        cep: formatarCep(txt(tomadorEnd.endNac?.CEP)),
        endereco: montarEndereco(tomadorEnd),
        email: txt(toma.email),
      }
    : null;

  const totaisAproximados = totTrib
    ? `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: ${formatarMoeda(txt(totTrib.vTotTribFed) || '0')} ; Estaduais: ${formatarMoeda(txt(totTrib.vTotTribEst) || '0')} ; Municipais: ${formatarMoeda(txt(totTrib.vTotTribMun) || '0')}`
    : '';

  return {
    chave,
    numero: txt(inf.nNFSe),
    competencia: formatarDataHora(txt(dps.dCompet)),
    dhEmissaoNfse: formatarDataHora(txt(inf.dhProc)),
    numeroDps: txt(dps.nDPS),
    serieDps: txt(dps.serie),
    dhEmissaoDps: formatarDataHora(txt(dps.dhEmi)),
    emitente: TP_EMIT[txt(dps.tpEmit)] || VAZIO,
    situacao: txt(inf.cStat) === '100' ? 'Autorizada' : txt(inf.cStat),
    ambienteGerador: AMB_GER[txt(inf.ambGer)] || txt(inf.ambGer),
    tipoAmbiente: txt(dps.tpAmb) === '1' ? 'Produção' : 'Homologação',
    municipioEmissor: `${txt(inf.xLocEmi)}${ufEmissor ? ` - ${ufEmissor}` : ''}`,
    prestador: {
      doc: formatarDoc(txt(emit.CNPJ) || txt(emit.CPF)),
      im: txt(emit.IM),
      fone: txt(emit.fone),
      nome: txt(emit.xNome),
      cMun: txt(emit.enderNac?.cMun),
      municipio: txt(inf.xLocEmi),
      uf: ufEmissor,
      cep: formatarCep(txt(emit.enderNac?.CEP)),
      endereco: montarEndereco(emit.enderNac),
      email: txt(emit.email),
      simplesNacional: OP_SIMPLES[txt(prest.regTrib?.opSimpNac)] || VAZIO,
      regimeApuracaoSn: REG_AP_SN[txt(prest.regTrib?.regApTribSN)] || VAZIO,
    },
    tomador,
    servico: {
      codigoTributacao: txt(serv.cServ?.cTribNac),
      codigoNbs: txt(serv.cServ?.cNBS),
      localPrestacao: txt(inf.xLocPrestacao),
      descricaoTributacao: txt(inf.xTribNac),
      descricao: txt(serv.cServ?.xDescServ),
    },
    issqn: {
      tipoTributacao: TRIB_ISSQN[txt(tribMun.tribISSQN)] || VAZIO,
      municipioIncidencia: txt(inf.xLocIncid),
      regimeEspecial: REG_ESP[txt(prest.regTrib?.regEspTrib)] || VAZIO,
      retencao: RET_ISSQN[txt(tribMun.tpRetISSQN)] || VAZIO,
      baseCalculo: moedaOuVazio(txt(vNfse.vBC)),
      aliquota: txt(vNfse.pAliqAplic) ? `${txt(vNfse.pAliqAplic).replace('.', ',')}%` : VAZIO,
      valorApurado: moedaOuVazio(txt(vNfse.vISSQN)),
      deducoes: moedaOuVazio(txt(vNfse.vCalcDR)),
      descontoIncondicionado: moedaOuVazio(txt(vDps.vDescCondIncond?.vDescIncond)),
    },
    federal: {
      irrf: moedaOuVazio(txt(tribFed.vRetIRRF)),
      cp: moedaOuVazio(txt(tribFed.vRetCP)),
      csll: moedaOuVazio(txt(tribFed.vRetCSLL)),
      pis: moedaOuVazio(txt(tribFed.piscofins?.vPis)),
      cofins: moedaOuVazio(txt(tribFed.piscofins?.vCofins)),
    },
    valores: {
      servico: formatarMoeda(txt(vDps.vServPrest?.vServ)),
      descontoIncondicionado: moedaOuVazio(txt(vDps.vDescCondIncond?.vDescIncond)),
      descontoCondicionado: moedaOuVazio(txt(vDps.vDescCondIncond?.vDescCond)),
      retencoes: moedaOuVazio(txt(vNfse.vTotalRet)),
      liquido: formatarMoeda(txt(vNfse.vLiq)),
    },
    informacoesComplementares: [totaisAproximados, txt(serv.infoCompl?.xInfComp)].filter(Boolean).join('\n'),
  };
}

// ── Desenho (A4, mm) — proporções copiadas do DANFSe emitido pelo portal ──
const BORDA_X = 5;
const BORDA_W = 200;
const COL = [6.5, 55.5, 106.5, 157];
const LARG_COL = 48;

export function montarDanfsePdf(d: DanfseDados, qrPng: string): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setLineWidth(0.3);
  pdf.setTextColor(0, 0, 0);
  pdf.rect(BORDA_X, 4, BORDA_W, 289);

  const rotulo = (x: number, y: number, t: string, tam = 6) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(tam);
    pdf.text(t, x, y);
  };
  // Valor abaixo do rótulo; devolve quantas linhas ocupou.
  const valor = (x: number, y: number, t: string, largura = LARG_COL, tam = 7.5) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(tam);
    const linhas = pdf.splitTextToSize(t || VAZIO, largura);
    pdf.text(linhas, x, y);
    return linhas.length;
  };
  const campo = (col: number, y: number, r: string, v: string, largura = LARG_COL) => {
    rotulo(COL[col], y, r);
    return valor(COL[col], y + 3, v, largura);
  };
  const linhaH = (y: number) => pdf.line(BORDA_X, y, BORDA_X + BORDA_W, y);
  const cabecalhoSecao = (y: number, t: string) => {
    linhaH(y - 3.3);
    rotulo(COL[0], y, t, 7);
  };

  // Cabeçalho
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(0, 122, 77);
  pdf.text('NFS', 7, 15);
  pdf.setTextColor(0, 84, 147);
  pdf.text('e', 7 + pdf.getTextWidth('NFS'), 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(90, 90, 90);
  pdf.text(['Nota Fiscal de', 'Serviço Eletrônica'], 33, 11.5);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('DANFSe v2.0', 105, 10.5, { align: 'center' });
  pdf.setFontSize(9);
  pdf.text('Documento Auxiliar da NFS-e', 105, 15, { align: 'center' });
  pdf.setFontSize(8);
  pdf.text(`Município: ${d.municipioEmissor}`, 157, 8.5);
  pdf.setFontSize(6);
  pdf.text(`Ambiente Gerador: ${d.ambienteGerador}`, 157, 11.5);
  pdf.text(`Tipo de Ambiente: ${d.tipoAmbiente}`, 157, 14);
  linhaH(19);

  // Chave + identificação + QR
  let y = 22.5;
  rotulo(COL[0], y, 'CHAVE DE ACESSO DA NFS-E', 7);
  valor(COL[0], y + 4, d.chave, 120);
  y += 9;
  const blocoId: [string, string][][] = [
    [['NÚMERO DA NFS-E', d.numero], ['COMPETÊNCIA DA NFS-E', d.competencia], ['DATA E HORA DA EMISSÃO DA NFS-E', d.dhEmissaoNfse]],
    [['NÚMERO DA DPS', d.numeroDps], ['SÉRIE DA DPS', d.serieDps], ['DATA E HORA DA EMISSÃO DA DPS', d.dhEmissaoDps]],
    [['EMITENTE DA NFS-E', d.emitente], ['SITUAÇÃO DA NFS-E', d.situacao], ['FINALIDADE', VAZIO]],
  ];
  for (const linha of blocoId) {
    linha.forEach(([r, v], i) => {
      rotulo(COL[i], y, r, 7);
      valor(COL[i], y + 3.5, v);
    });
    y += 9;
  }
  pdf.addImage(qrPng, 'PNG', 168, 21, 24, 24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(5.5);
  pdf.text(
    pdf.splitTextToSize('A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e', 44),
    COL[3] + 1,
    48
  );

  // Prestador / Tomador
  const parte = (yIni: number, titulo: string, p: DanfseParte) => {
    let yy = yIni;
    cabecalhoSecao(yy, titulo);
    rotulo(COL[1], yy, 'CNPJ / CPF / NIF');
    rotulo(COL[2], yy, 'Indicador Municipal (Inscrição)');
    rotulo(COL[3], yy, 'Telefone');
    valor(COL[1], yy + 3.5, p.doc);
    valor(COL[2], yy + 3.5, ouVazio(p.im));
    valor(COL[3], yy + 3.5, ouVazio(p.fone));
    yy += 7.5;
    rotulo(COL[0], yy, 'Nome / Nome Empresarial');
    valor(COL[0], yy + 3, p.nome, 190);
    yy += 6;
    campo(0, yy, 'Município / Sigla UF', [p.municipio || p.cMun, p.uf].filter(Boolean).join(' / '));
    campo(1, yy, 'Código IBGE / CEP', `${p.cMun} / ${p.cep}`);
    const linhasEnd = campo(2, yy, 'Endereço', p.endereco, 96);
    yy += 4 + Math.max(1, linhasEnd) * 3.2;
    campo(0, yy, 'E-mail', ouVazio(p.email), 140);
    yy += 7;
    return yy;
  };

  y += 1;
  y = parte(y, 'PRESTADOR / FORNECEDOR', d.prestador);
  campo(0, y, 'Simples Nacional na Data de Competência', d.prestador.simplesNacional, 96);
  campo(2, y, 'Regime de Apuração Tributária pelo SN', d.prestador.regimeApuracaoSn, 96);
  y += 9.5;

  if (d.tomador) {
    y = parte(y, 'TOMADOR / ADQUIRENTE', d.tomador);
  } else {
    cabecalhoSecao(y, 'TOMADOR / ADQUIRENTE');
    valor(COL[0], y + 3.5, 'TOMADOR/ADQUIRENTE NÃO IDENTIFICADO NA NFS-e', 190);
    y += 9;
  }

  cabecalhoSecao(y, 'DESTINATÁRIO DA OPERAÇÃO');
  valor(COL[0], y + 3.5, 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO', 190);
  y += 8.5;
  cabecalhoSecao(y, 'INTERMEDIÁRIO DA OPERAÇÃO');
  rotulo(COL[1], y, 'CNPJ / CPF / NIF');
  rotulo(COL[2], y, 'Indicador Municipal (Inscrição)');
  rotulo(COL[3], y, 'Telefone');
  valor(COL[0], y + 3.5, 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 190);
  y += 8.5;

  // Serviço
  cabecalhoSecao(y, 'SERVIÇO PRESTADO');
  campo(1, y, 'Cód. Tributação Nac./Mun.', d.servico.codigoTributacao);
  campo(2, y, 'Código da NBS', ouVazio(d.servico.codigoNbs));
  campo(3, y, 'Local Prestação / UF / País', d.servico.localPrestacao, 46);
  y += 7;
  const lTrib = valor(COL[0], y, d.servico.descricaoTributacao, 192);
  y += lTrib * 3.2;
  const lDesc = valor(COL[0], y, d.servico.descricao, 192);
  y += lDesc * 3.2 + 3.5;

  // ISSQN
  cabecalhoSecao(y, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)');
  campo(1, y, 'Tipo de Tributação do ISSQN', d.issqn.tipoTributacao);
  campo(2, y, 'Município / Sigla UF / País de Incidência do ISSQN', d.issqn.municipioIncidencia, 96);
  y += 7.5;
  const grade = (linhas: [string, string][][]) => {
    for (const linha of linhas) {
      linha.forEach(([r, v], i) => campo(i, y, r, v));
      y += 7.5;
    }
  };
  grade([
    [['Regime Especial de Tributação do ISSQN', d.issqn.regimeEspecial], ['Tipo de Imunidade do ISSQN', VAZIO], ['Suspensão da Exigibilidade do ISSQN', VAZIO], ['Número Processo Suspensão', VAZIO]],
    [['Benefício Municipal', VAZIO], ['Cálculo do BM', VAZIO], ['Total Deduções/Reduções', d.issqn.deducoes], ['Desconto Incondicionado', d.issqn.descontoIncondicionado]],
    [['BC ISSQN', d.issqn.baseCalculo], ['Alíquota Aplicada', d.issqn.aliquota], ['Retenção do ISSQN', d.issqn.retencao], ['ISSQN Apurado', d.issqn.valorApurado]],
  ]);

  // Federal
  y += 1;
  cabecalhoSecao(y, 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)');
  campo(1, y, 'IRRF', d.federal.irrf);
  campo(2, y, 'Contribuição Previdenciária - Retida', d.federal.cp);
  campo(3, y, 'Contribuições Sociais - Retidas', d.federal.csll, 46);
  y += 7.5;
  grade([[['PIS - Débito Apuração Própria', d.federal.pis], ['COFINS - Débito Apuração Própria', d.federal.cofins], ['Descrição Contrib. Sociais - Retidas', VAZIO]]]);

  // IBS / CBS (Reforma Tributária — ainda não preenchido pela prefeitura)
  y += 1;
  cabecalhoSecao(y, 'TRIBUTAÇÃO IBS / CBS');
  campo(1, y, 'CST / Classificação tributária', VAZIO);
  campo(2, y, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', VAZIO, 96);
  y += 7.5;
  grade([
    [['Exclusões e Reduções da Base de Cálculo', VAZIO], ['Base de Cálculo Após Exclusões e Reduções', VAZIO], ['Red. Alíquota IBS / Red. Alíquota CBS', VAZIO], ['Alíquota - IBS UF / IBS Mun', VAZIO]],
    [['Alíq. Efetiva Municipal - IBS', VAZIO], ['Valor Apurado Municipal - IBS', VAZIO], ['Alíq. Efetiva Estadual - IBS', VAZIO], ['Valor Apurado Estadual - IBS', VAZIO]],
    [['Valor Total Apurado - IBS', VAZIO], ['Alíquota - CBS', VAZIO], ['Alíquota Efetiva - CBS', VAZIO], ['Valor Total Apurado - CBS', VAZIO]],
  ]);

  // Totais
  y += 1;
  cabecalhoSecao(y, 'VALOR TOTAL DA NFS-E');
  campo(1, y, 'VALOR DA OPERAÇÃO / SERVIÇO', d.valores.servico);
  campo(2, y, 'Desconto Incondicionado', d.valores.descontoIncondicionado);
  campo(3, y, 'Desconto Condicionado', d.valores.descontoCondicionado, 46);
  y += 7.5;
  grade([[['Total das Retenções (ISSQN / Federais)', d.valores.retencoes], ['VALOR LÍQUIDO DA NFS-e', d.valores.liquido], ['Total do IBS/CBS', VAZIO], ['VALOR LÍQUIDO DA NFS-e + IBS/CBS', d.valores.liquido]]]);

  // Informações complementares
  cabecalhoSecao(y, 'INFORMAÇÕES COMPLEMENTARES');
  valor(COL[0], y + 4, d.informacoesComplementares || VAZIO, 192, 7);

  // Rodapé (canhoto)
  const yRod = 280;
  pdf.rect(BORDA_X + 1.5, yRod, BORDA_W - 3, 11);
  pdf.line(55, yRod, 55, yRod + 11);
  pdf.line(106, yRod, 106, yRod + 11);
  rotulo(9, yRod + 3, 'DATA CIENTIFICAÇÃO:');
  rotulo(58, yRod + 3, 'IDENTIFICAÇÃO E ASSINATURA:');
  rotulo(108, yRod + 3, 'Nº NFS-e / CHAVE NFS-e');
  valor(108, yRod + 6.5, `${d.numero} / ${d.chave}`, 95, 7);

  return pdf;
}

// Nome do município pelo código IBGE (o XML só traz o código do tomador).
const cacheMunicipios = new Map<string, { nome: string; uf: string }>();
async function buscarMunicipioIbge(cMun: string): Promise<{ nome: string; uf: string } | null> {
  if (!/^\d{7}$/.test(cMun)) return null;
  const emCache = cacheMunicipios.get(cMun);
  if (emCache) return emCache;
  try {
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cMun}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const m = await res.json();
    const uf = m?.microrregiao?.mesorregiao?.UF?.sigla || m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || '';
    if (!m?.nome) return null;
    const achado = { nome: String(m.nome).toUpperCase(), uf };
    cacheMunicipios.set(cMun, achado);
    return achado;
  } catch {
    return null;
  }
}

/** XML oficial → PDF do DANFSe (Buffer), pronto pra anexar ou baixar. */
export async function gerarDanfsePdf(xml: string): Promise<Buffer> {
  const dados = lerXmlNfse(xml);
  if (dados.tomador && !dados.tomador.municipio) {
    const mun = await buscarMunicipioIbge(dados.tomador.cMun);
    if (mun) {
      dados.tomador.municipio = mun.nome;
      dados.tomador.uf = mun.uf;
    }
  }
  const qr = await QRCode.toDataURL(urlConsultaPublica(dados.chave), { margin: 0, errorCorrectionLevel: 'M', width: 300 });
  return Buffer.from(montarDanfsePdf(dados, qr).output('arraybuffer'));
}
