import assert from 'node:assert';
import { parseCnpjResponse, parseCnpjResponseEstruturado } from './cnpjLookup';

// Campos e formato conferidos contra a BrasilAPI real
// (GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}) em 2026-07-28.
function extractsNameAddressAndPhoneFromABrasilApiResponse() {
  const raw = {
    nome_fantasia: 'Farmacia Exemplo',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '123',
    bairro: 'CENTRO',
    municipio: 'TERESINA',
    uf: 'PI',
    ddd_telefone_1: '8699990000',
  };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.nome, 'Farmacia Exemplo');
  assert.strictEqual(data.endereco, 'RUA DAS FLORES, 123 - CENTRO - TERESINA - PI');
  assert.strictEqual(data.telefone, '(86) 9999-0000');
}

function fallsBackToRazaoSocialWhenNomeFantasiaIsEmpty() {
  const raw = {
    nome_fantasia: '',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    logradouro: '', numero: '', bairro: '', municipio: '', uf: '',
    ddd_telefone_1: '',
  };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.nome, 'FARMACIA EXEMPLO LTDA');
}

function handlesMissingFieldsWithoutThrowing() {
  const data = parseCnpjResponse({});
  assert.strictEqual(data.nome, '');
  assert.strictEqual(data.endereco, '');
  assert.strictEqual(data.telefone, '');
}

function formatsANineDigitCellphoneNumber() {
  const raw = { nome_fantasia: 'X', logradouro: '', numero: '', bairro: '', municipio: '', uf: '', ddd_telefone_1: '86999990000' };
  const data = parseCnpjResponse(raw);
  assert.strictEqual(data.telefone, '(86) 99999-0000');
}

function extractsStructuredAddressFromABrasilApiResponse() {
  const raw = {
    nome_fantasia: 'Farmacia Exemplo',
    razao_social: 'FARMACIA EXEMPLO LTDA',
    email: 'contato@exemplo.com.br',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '123',
    complemento: 'SALA 2',
    bairro: 'CENTRO',
    municipio: 'TERESINA',
    uf: 'PI',
    cep: '64000000',
    codigo_municipio_ibge: 2211001,
    ddd_telefone_1: '8699990000',
  };
  const data = parseCnpjResponseEstruturado(raw);
  assert.strictEqual(data.nome, 'Farmacia Exemplo');
  assert.strictEqual(data.email, 'contato@exemplo.com.br');
  assert.strictEqual(data.telefone, '(86) 9999-0000');
  assert.strictEqual(data.endereco.xLgr, 'RUA DAS FLORES');
  assert.strictEqual(data.endereco.nro, '123');
  assert.strictEqual(data.endereco.xCpl, 'SALA 2');
  assert.strictEqual(data.endereco.xBairro, 'CENTRO');
  assert.strictEqual(data.endereco.cMun, '2211001');
  assert.strictEqual(data.endereco.cep, '64000000');
  assert.strictEqual(data.endereco.uf, 'PI');
}

function handlesMissingFieldsInStructuredAddressWithoutThrowing() {
  const data = parseCnpjResponseEstruturado({});
  assert.strictEqual(data.nome, '');
  assert.strictEqual(data.email, '');
  assert.strictEqual(data.endereco.xLgr, '');
  assert.strictEqual(data.endereco.cMun, '');
  assert.strictEqual(data.endereco.cep, '');
}

try {
  extractsNameAddressAndPhoneFromABrasilApiResponse();
  fallsBackToRazaoSocialWhenNomeFantasiaIsEmpty();
  handlesMissingFieldsWithoutThrowing();
  formatsANineDigitCellphoneNumber();
  extractsStructuredAddressFromABrasilApiResponse();
  handlesMissingFieldsInStructuredAddressWithoutThrowing();
  console.log('PASS: todos os testes de cnpjLookup passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
