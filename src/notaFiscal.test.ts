import assert from 'node:assert';
import { buildEmissaoPayload, validateEmissaoInput, mapNfseError, EmissaoInput } from './notaFiscal';

const validInput: EmissaoInput = {
  tomadorCnpj: '99888777000166',
  tomadorNome: 'Empresa Tomadora Exemplo Ltda',
  tomadorEmail: 'fiscal@exemplo.com.br',
  tomadorTelefone: '1133334444',
  tomadorEndereco: {
    xLgr: 'Avenida Paulista',
    nro: '1000',
    xCpl: 'Sala 302',
    xBairro: 'Bela Vista',
    cMun: '3550308',
    cep: '01310100',
  },
  servicoCodigo: '010101',
  descricao: 'Suporte de TI - manutencao mensal',
  valor: 150,
};

function buildsThePayloadWithFixedPrestadorConfig() {
  const payload: any = buildEmissaoPayload(validInput, '66125544000198');
  assert.strictEqual(payload.prestadorCnpj, '66125544000198');
  assert.strictEqual(payload.tomadorDoc, '99888777000166');
  assert.strictEqual(payload.servicoCodigo, '010101');
  assert.strictEqual(payload.valorTotal, '150.00');
  assert.strictEqual(payload.cnae, '9511800');
  assert.strictEqual(payload.descricao, 'Suporte de TI - manutencao mensal');
  assert.strictEqual(payload.tomador.nome, 'Empresa Tomadora Exemplo Ltda');
  assert.strictEqual(payload.tomador.email, 'fiscal@exemplo.com.br');
  assert.strictEqual(payload.tomador.endereco.cMun, '3550308');
  assert.strictEqual(payload.tomador.endereco.cep, '01310100');
  assert.strictEqual(payload.servico.localPrestacaoIbge, '2101202');
  assert.deepStrictEqual(payload.prestadorRegime, { opSimpNac: 3, regApTribSn: 1, regEspTrib: 0, issRetido: 1 });
  assert.deepStrictEqual(payload.tribISSQN, { tribISSQN: 1 });
}

function formatsValorWithTwoDecimalsEvenForWholeNumbers() {
  const payload: any = buildEmissaoPayload({ ...validInput, valor: 1000 }, '66125544000198');
  assert.strictEqual(payload.valorTotal, '1000.00');
}

function validateEmissaoInputRejectsInvalidCnpj() {
  const erro = validateEmissaoInput({ ...validInput, tomadorCnpj: '123' });
  assert.ok(erro && /CNPJ/.test(erro));
}

function validateEmissaoInputRejectsServicoCodigoWithWrongLength() {
  const erro = validateEmissaoInput({ ...validInput, servicoCodigo: '12' });
  assert.ok(erro && /6 dígitos/.test(erro));
}

function validateEmissaoInputRejectsZeroValue() {
  const erro = validateEmissaoInput({ ...validInput, valor: 0 });
  assert.ok(erro && /maior que zero/.test(erro));
}

function validateEmissaoInputAcceptsAValidInput() {
  const erro = validateEmissaoInput(validInput);
  assert.strictEqual(erro, null);
}

function mapsRfbRejectionUsingDescricaoErroAndAcaoSugerida() {
  const body = {
    statusCode: 422,
    message: 'E0039: municipio nao parametrizado',
    details: {
      codigoErro: 'E0039',
      descricaoErro: 'Municipio emissor nao parametrizado',
      acaoSugerida: 'Contatar a prefeitura',
    },
  };
  const msg = mapNfseError(422, body);
  assert.strictEqual(msg, 'Municipio emissor nao parametrizado — Contatar a prefeitura');
}

function mapsTomadorSemIdentificacaoToAFriendlyMessage() {
  const msg = mapNfseError(422, { details: { code: 'TOMADOR_SEM_IDENTIFICACAO' } });
  assert.strictEqual(msg, 'CNPJ do cliente inválido ou não encontrado.');
}

function mapsAuthErrorsToAGenericSupportMessage() {
  assert.strictEqual(mapNfseError(401, { details: { code: 'INVALID_TOKEN' } }), 'Erro de configuração da integração com a prefeitura — contate o suporte.');
  assert.strictEqual(mapNfseError(403, { details: { code: 'TOKEN_BLOQUEADO' } }), 'Erro de configuração da integração com a prefeitura — contate o suporte.');
}

function mapsServiceUnavailableToARetryMessage() {
  const msg = mapNfseError(503, {});
  assert.strictEqual(msg, 'Serviço da prefeitura indisponível no momento, tente novamente em alguns segundos.');
}

try {
  buildsThePayloadWithFixedPrestadorConfig();
  formatsValorWithTwoDecimalsEvenForWholeNumbers();
  validateEmissaoInputRejectsInvalidCnpj();
  validateEmissaoInputRejectsServicoCodigoWithWrongLength();
  validateEmissaoInputRejectsZeroValue();
  validateEmissaoInputAcceptsAValidInput();
  mapsRfbRejectionUsingDescricaoErroAndAcaoSugerida();
  mapsTomadorSemIdentificacaoToAFriendlyMessage();
  mapsAuthErrorsToAGenericSupportMessage();
  mapsServiceUnavailableToARetryMessage();
  console.log('PASS: todos os testes de notaFiscal (funcoes puras) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
