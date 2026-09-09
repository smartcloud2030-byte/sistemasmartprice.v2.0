import assert from 'node:assert';
import { normalizarExtracao, type BrutoIA } from './reciboExtract';

const base: BrutoIA = {
  categoria: 'combustivel', valorReais: 250.0, dataDespesa: '2026-09-08',
  estabelecimento: 'Posto Ipiranga', documentoNumero: '123456',
  litros: 41.5, kmVeiculo: null, confianca: 'alta', observacao: null,
};

function converteValorReaisParaCentavos() {
  assert.strictEqual(normalizarExtracao(base).valorCentavos, 25000);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 12.34 }).valorCentavos, 1234);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 12.005 }).valorCentavos, 1201);
}
function valorInvalidoViraNull() {
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: null }).valorCentavos, null);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: 0 }).valorCentavos, null);
  assert.strictEqual(normalizarExtracao({ ...base, valorReais: -5 }).valorCentavos, null);
}
function categoriaForaDaListaViraOutros() {
  assert.strictEqual(normalizarExtracao({ ...base, categoria: 'xpto' as any }).categoria, 'outros');
  assert.strictEqual(normalizarExtracao(base).categoria, 'combustivel');
}
function confiancaInvalidaViraBaixa() {
  assert.strictEqual(normalizarExtracao({ ...base, confianca: 'meia' as any }).confianca, 'baixa');
  assert.strictEqual(normalizarExtracao({ ...base, confianca: 'media' }).confianca, 'media');
}
function camposDeTextoPassamDireto() {
  const r = normalizarExtracao(base);
  assert.strictEqual(r.estabelecimento, 'Posto Ipiranga');
  assert.strictEqual(r.documentoNumero, '123456');
  assert.strictEqual(r.dataDespesa, '2026-09-08');
  assert.strictEqual(r.litros, 41.5);
}
function dataForaDoFormatoViraNull() {
  assert.strictEqual(normalizarExtracao({ ...base, dataDespesa: '08/09/2026' }).dataDespesa, null);
  assert.strictEqual(normalizarExtracao({ ...base, dataDespesa: 'ontem' }).dataDespesa, null);
}

try {
  converteValorReaisParaCentavos();
  valorInvalidoViraNull();
  categoriaForaDaListaViraOutros();
  confiancaInvalidaViraBaixa();
  camposDeTextoPassamDireto();
  dataForaDoFormatoViraNull();
  console.log('PASS: todos os testes de reciboExtract (normalizarExtracao) passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
