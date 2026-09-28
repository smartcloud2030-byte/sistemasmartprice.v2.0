import assert from 'node:assert';
import {
  parseNovaViagem,
  tituloViagem,
  ehComandoListagem,
  ehComandoFechar,
  ehComandoFecharForcado,
  ehConfirmacao,
  parseCorrecao,
  matchViagem,
  formatarCard,
  listaViagensAbertas,
} from './whatsappComandos';

function novaViagemComMotivo() {
  const r = parseNovaViagem('nova viagem Bacabal / visita lojas');
  assert.deepStrictEqual(r, { destino: 'Bacabal', motivo: 'visita lojas' });
  assert.strictEqual(tituloViagem(r!), 'Bacabal (visita lojas)');
}
function novaViagemSemMotivo() {
  const r = parseNovaViagem('Nova Viagem São Luís');
  assert.deepStrictEqual(r, { destino: 'São Luís', motivo: null });
  assert.strictEqual(tituloViagem(r!), 'São Luís');
}
function novaViagemInvalida() {
  assert.strictEqual(parseNovaViagem('nova viagem'), null);
  assert.strictEqual(parseNovaViagem('nova viagem   '), null);
  assert.strictEqual(parseNovaViagem('oi'), null);
}

function comandosDeListagemEFechamento() {
  assert.strictEqual(ehComandoListagem('minhas viagens'), true);
  assert.strictEqual(ehComandoListagem('Status'), true);
  assert.strictEqual(ehComandoListagem('minhas viagens hoje'), false);
  assert.strictEqual(ehComandoFechar('fechar viagem'), true);
  assert.strictEqual(ehComandoFechar('relatório'), true);
  assert.strictEqual(ehComandoFechar('relatorio'), true);
  assert.strictEqual(ehComandoFecharForcado('fechar mesmo'), true);
  assert.strictEqual(ehComandoFechar('fechar mesmo'), false);
  assert.strictEqual(ehConfirmacao('ok'), true);
  assert.strictEqual(ehConfirmacao('Confirmar'), true);
  assert.strictEqual(ehConfirmacao('okay'), false);
}

function correcaoDeValor() {
  const r = parseCorrecao('valor 245,90');
  assert.deepStrictEqual(r, { campo: 'valor', valorCentavos: 24590 });
  assert.strictEqual(parseCorrecao('valor abc'), null);
}
function correcaoDeCategoria() {
  assert.deepStrictEqual(parseCorrecao('categoria pedagio'), { campo: 'categoria', categoria: 'pedagio' });
  assert.deepStrictEqual(parseCorrecao('categoria Pedágio'), { campo: 'categoria', categoria: 'pedagio' });
  assert.strictEqual(parseCorrecao('categoria voo'), null);
}
function correcaoDeData() {
  const ref = new Date('2026-09-15T12:00:00Z');
  assert.deepStrictEqual(parseCorrecao('data 08/09', ref), { campo: 'data', dataDespesa: '2026-09-08' });
  assert.deepStrictEqual(parseCorrecao('data 08/09/2025', ref), { campo: 'data', dataDespesa: '2025-09-08' });
  assert.strictEqual(parseCorrecao('data 32/09', ref), null);
  assert.strictEqual(parseCorrecao('data qualquer coisa', ref), null);
}
function correcaoNaoReconhecida() {
  assert.strictEqual(parseCorrecao('bora almoçar'), null);
}

function combinaViagemPorSubstring() {
  const viagens = [
    { id: '1', titulo: 'Bacabal (visita lojas)', destino: 'Bacabal', total_centavos: 0 },
    { id: '2', titulo: 'São Luís', destino: 'São Luís', total_centavos: 0 },
  ];
  assert.strictEqual(matchViagem('bacabal', viagens)?.id, '1');
  assert.strictEqual(matchViagem('luís', viagens)?.id, '2');
  assert.strictEqual(matchViagem('l', viagens), null); // ambíguo (bate nas duas)
  assert.strictEqual(matchViagem('teresina', viagens), null); // nenhum
}

function cardDeConfirmacao() {
  const texto = formatarCard({
    categoria: 'combustivel', valorCentavos: 25000, estabelecimento: 'Posto XYZ',
    dataDespesa: '2026-09-08', confianca: 'alta',
  });
  assert.match(texto, /Combustível · R\$ 250,00 · Posto XYZ · 08\/09\/2026/);
  assert.match(texto, /Responde \*ok\*/);

  const incerto = formatarCard({
    categoria: 'outros', valorCentavos: null, estabelecimento: null, dataDespesa: null, confianca: 'baixa',
  });
  assert.match(incerto, /valor não lido/);
  assert.match(incerto, /confira os dados/);
}

function listagemDeViagens() {
  assert.match(listaViagensAbertas([]), /Nenhuma viagem aberta/);
  const texto = listaViagensAbertas([{ id: '1', titulo: 'Bacabal', destino: 'Bacabal', total_centavos: 25000 }]);
  assert.match(texto, /Bacabal — R\$ 250,00/);
}

try {
  novaViagemComMotivo();
  novaViagemSemMotivo();
  novaViagemInvalida();
  comandosDeListagemEFechamento();
  correcaoDeValor();
  correcaoDeCategoria();
  correcaoDeData();
  correcaoNaoReconhecida();
  combinaViagemPorSubstring();
  cardDeConfirmacao();
  listagemDeViagens();
  console.log('PASS: todos os testes de whatsappComandos passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
