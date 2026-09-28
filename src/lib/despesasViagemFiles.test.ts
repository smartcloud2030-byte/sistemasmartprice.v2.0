import assert from 'node:assert';
import * as XLSX from 'xlsx';
import {
  slugDestino, nomeArquivoRelatorio, gerarRelatorioXLSX, gerarRelatorioPDF,
  type ViagemParaRelatorio,
} from './despesasViagemFiles';
import type { ItemDespesa } from './despesasViagemReport';

const viagem: ViagemParaRelatorio = {
  titulo: 'Bacabal → São Luís (visita lojas)',
  destino: 'São Luís',
  motivo: 'visita lojas',
  empresa: 'Ultra Popular',
  dataInicio: '2026-09-07',
  dataFim: '2026-09-10',
};

const itens: ItemDespesa[] = [
  { categoria: 'combustivel', descricao: 'Tanque cheio', valorCentavos: 25000, dataDespesa: '2026-09-08', estabelecimento: 'Posto Ipiranga' },
  { categoria: 'pedagio', descricao: null, valorCentavos: 1230, dataDespesa: '2026-09-07', estabelecimento: 'CLF' },
  { categoria: 'refeicao', descricao: 'Almoço', valorCentavos: 4500, dataDespesa: '2026-09-08', estabelecimento: 'Restaurante do Zé' },
];

function slugRemoveAcentosEEspacos() {
  assert.strictEqual(slugDestino({ destino: 'São Luís', titulo: 'x' }), 'sao-luis');
  assert.strictEqual(slugDestino({ destino: null, titulo: 'Bacabal → São Luís' }), 'bacabal-sao-luis');
  assert.strictEqual(slugDestino({ destino: '', titulo: '' }), 'viagem');
}

function nomeArquivoUsaFormatoEDataDeHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  assert.strictEqual(nomeArquivoRelatorio(viagem, 'pdf'), `relatorio-viagem-sao-luis-${hoje}.pdf`);
  assert.strictEqual(nomeArquivoRelatorio(viagem, 'xlsx'), `despesas-sao-luis-${hoje}.xlsx`);
}

function xlsxTemAsDuasAbasComTotais() {
  const buffer = gerarRelatorioXLSX(viagem, itens);
  assert.ok(buffer.length > 0);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  assert.deepStrictEqual(wb.SheetNames, ['Despesas', 'Resumo']);

  const despesas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Despesas']);
  assert.strictEqual(despesas.length, 3);
  assert.strictEqual(despesas[0]['Data'], '07/09/2026'); // ordenado por data
  assert.strictEqual(despesas[0]['Categoria'], 'Pedágio');
  assert.strictEqual(despesas[0]['Valor (R$)'], 12.3);

  const resumo = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Resumo']);
  const total = resumo.find((r) => r['Categoria'] === 'TOTAL GERAL');
  assert.ok(total);
  assert.strictEqual(total!['Total (R$)'], (25000 + 1230 + 4500) / 100);
}

async function pdfGeraBufferComCabecalhoValido() {
  const buffer = await gerarRelatorioPDF(viagem, itens, []);
  assert.ok(buffer.length > 1000);
  assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
}

async function pdfSemItensNaoQuebra() {
  const buffer = await gerarRelatorioPDF(viagem, [], []);
  assert.ok(buffer.length > 500);
}

(async () => {
  try {
    slugRemoveAcentosEEspacos();
    nomeArquivoUsaFormatoEDataDeHoje();
    xlsxTemAsDuasAbasComTotais();
    await pdfGeraBufferComCabecalhoValido();
    await pdfSemItensNaoQuebra();
    console.log('PASS: todos os testes de despesasViagemFiles passaram');
  } catch (err: any) {
    console.error('FAIL:', err.message);
    process.exit(1);
  }
})();
