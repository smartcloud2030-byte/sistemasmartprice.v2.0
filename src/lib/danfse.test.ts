import assert from 'node:assert';
import { lerXmlNfse, montarDanfsePdf, urlConsultaPublica, formatarDataHora, formatarMoeda } from './danfse';

// Mesmo formato do XML que a API da prefeitura devolve (layout nacional), com dados fictícios.
const xml = `<?xml version="1.0" encoding="utf-8"?><NFSe versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS21012022266125544000198000000000020426105961449214"><xLocEmi>Bacabal</xLocEmi><xLocPrestacao>Bacabal</xLocPrestacao><nNFSe>204</nNFSe><cLocIncid>2101202</cLocIncid><xLocIncid>Bacabal</xLocIncid><xTribNac>Processamento de dados e congêneres.</xTribNac><ambGer>2</ambGer><cStat>100</cStat><dhProc>2026-10-19T12:14:56-03:00</dhProc><emit><CNPJ>66125544000198</CNPJ><IM>7027089</IM><xNome>SMART HELP LTDA</xNome><enderNac><xLgr>projeta 07</xLgr><nro>19</nro><xCpl>a</xCpl><xBairro>santa marina</xBairro><cMun>2101202</cMun><UF>MA</UF><CEP>65700000</CEP></enderNac></emit><valores><vLiq>300.00</vLiq></valores><DPS versao="1.00"><infDPS><tpAmb>1</tpAmb><dhEmi>2026-10-19T12:13:55-03:00</dhEmi><serie>1</serie><nDPS>1792422895970</nDPS><dCompet>2026-10-19</dCompet><tpEmit>1</tpEmit><prest><CNPJ>66125544000198</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest><toma><CNPJ>99888777000166</CNPJ><xNome>EMPRESA EXEMPLO LTDA</xNome><end><endNac><cMun>2203701</cMun><CEP>64180000</CEP></endNac><xLgr>RUA EXEMPLO</xLgr><nro>100</nro><xBairro>CENTRO</xBairro></end><fone>8633334444</fone><email>fiscal@exemplo.com.br</email></toma><serv><locPrest><cLocPrestacao>2101202</cLocPrestacao></locPrest><cServ><cTribNac>010301</cTribNac><xDescServ>Smartprice e Suporte</xDescServ></cServ></serv><valores><vServPrest><vServ>300.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><vTotTrib><vTotTribFed>0.00</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>0.00</vTotTribMun></vTotTrib></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;

function leIdentificacaoDaNota() {
  const d = lerXmlNfse(xml);
  assert.strictEqual(d.chave, '21012022266125544000198000000000020426105961449214');
  assert.strictEqual(d.numero, '204');
  assert.strictEqual(d.competencia, '19/10/2026');
  assert.strictEqual(d.dhEmissaoNfse, '19/10/2026 12:14:56');
  assert.strictEqual(d.numeroDps, '1792422895970');
  assert.strictEqual(d.situacao, 'Autorizada');
  assert.strictEqual(d.ambienteGerador, 'Sefin Nacional');
  assert.strictEqual(d.tipoAmbiente, 'Produção');
  assert.strictEqual(d.municipioEmissor, 'Bacabal - MA');
}

function mantemZerosAEsquerdaDoCodigoDeServico() {
  assert.strictEqual(lerXmlNfse(xml).servico.codigoTributacao, '010301');
}

function lePrestadorETomador() {
  const d = lerXmlNfse(xml);
  assert.strictEqual(d.prestador.doc, '66.125.544/0001-98');
  assert.strictEqual(d.prestador.cep, '65700-000');
  assert.strictEqual(d.prestador.endereco, 'projeta 07, 19, a, santa marina');
  assert.strictEqual(d.prestador.simplesNacional, 'Optante ME/EPP');
  assert.strictEqual(d.prestador.regimeApuracaoSn, 'Apuração SN federais e municipal');
  assert.strictEqual(d.tomador?.doc, '99.888.777/0001-66');
  assert.strictEqual(d.tomador?.cMun, '2203701');
  assert.strictEqual(d.tomador?.endereco, 'RUA EXEMPLO, 100, CENTRO');
  assert.strictEqual(d.tomador?.email, 'fiscal@exemplo.com.br');
}

function leValoresETributacao() {
  const d = lerXmlNfse(xml);
  assert.strictEqual(d.valores.servico, 'R$ 300,00');
  assert.strictEqual(d.valores.liquido, 'R$ 300,00');
  assert.strictEqual(d.valores.retencoes, '-');
  assert.strictEqual(d.issqn.tipoTributacao, 'Operação tributável');
  assert.strictEqual(d.issqn.retencao, 'Não retido');
  assert.strictEqual(d.issqn.regimeEspecial, 'Nenhum');
  assert.match(d.informacoesComplementares, /Lei nº 12\.741\/2012: Federais: R\$ 0,00/);
}

function recusaXmlQueNaoEhNfse() {
  assert.throws(() => lerXmlNfse('<outro/>'), /infNFSe/);
}

function formataDatasSemMexerNoFuso() {
  assert.strictEqual(formatarDataHora('2026-10-19T23:59:00-03:00'), '19/10/2026 23:59:00');
  assert.strictEqual(formatarMoeda('1234.5'), 'R$ 1.234,50');
}

function montaOPdfComQrDaConsultaPublica() {
  assert.strictEqual(urlConsultaPublica('123'), 'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=123');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const pdf = montarDanfsePdf(lerXmlNfse(xml), pixel);
  assert.strictEqual(pdf.getNumberOfPages(), 1);
}

try {
  leIdentificacaoDaNota();
  mantemZerosAEsquerdaDoCodigoDeServico();
  lePrestadorETomador();
  leValoresETributacao();
  recusaXmlQueNaoEhNfse();
  formataDatasSemMexerNoFuso();
  montaOPdfComQrDaConsultaPublica();
  console.log('PASS: todos os testes de danfse passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
