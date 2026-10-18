import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { diasParaVencer, importarArquivoPV, lerData, statusPV } from './listaPV';

function arquivoDe(linhas: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'x');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { name: 'teste.xlsx', arrayBuffer: async () => buf } as unknown as File;
}

async function main() {
  // Datas em vários formatos
  assert.equal(lerData('20/10/2026'), '2026-10-20');
  assert.equal(lerData('5/3/26'), '2026-03-05');
  assert.equal(lerData('2026-03-05'), '2026-03-05');
  assert.equal(lerData('12/2027'), '2027-12-31');
  assert.equal(lerData(new Date(2026, 9, 10)), '2026-10-10');
  assert.equal(lerData('31/13/2026'), null);
  assert.equal(lerData('xx'), null);

  // Planilha com cabeçalhos diferentes: "Validade" ganha de "Data Fabricação"
  const r = await importarArquivoPV(
    arquivoDe([
      ['Cód. Barras', 'Descrição do Produto', 'Data Fabricação', 'Validade', 'Qtde', 'Lote'],
      ['789001', 'DIPIRONA 500MG', '01/01/2026', '20/10/2026', 5, 'A1'],
      ['789002', 'AMOXICILINA', '01/01/2026', '10/10/2026', '3', 'B2'],
      ['789003', 'VITAMINA C', '', '12/2027', '', ''],
      ['789004', 'SEM DATA', '', '', 1, ''],
    ]),
  );
  assert.equal(r.itens.length, 3);
  assert.equal(r.ignoradas, 1);
  const [dipirona, amoxi, vitc] = r.itens;
  assert.equal(dipirona.vencimento, '2026-10-20');
  assert.equal(dipirona.codigo, '789001');
  assert.equal(dipirona.quantidade, 5);
  assert.equal(amoxi.quantidade, 3);
  assert.equal(vitc.quantidade, null);

  const hoje = new Date(2026, 9, 17);
  assert.equal(diasParaVencer(dipirona.vencimento, hoje), 3);
  assert.equal(diasParaVencer(amoxi.vencimento, hoje), -7);
  assert.equal(statusPV(-7), 'vencido');
  assert.equal(statusPV(0), 'vermelho');
  assert.equal(statusPV(1), 'vermelho');
  assert.equal(statusPV(30), 'vermelho');
  assert.equal(statusPV(31), 'amareloEscuro');
  assert.equal(statusPV(60), 'amareloEscuro');
  assert.equal(statusPV(61), 'amareloClaro');
  assert.equal(statusPV(150), 'amareloClaro');
  assert.equal(statusPV(179), 'amareloClaro');
  assert.equal(statusPV(180), 'verde');
  assert.equal(statusPV(400), 'verde');

  // Sem coluna de vencimento → erro claro
  await assert.rejects(() => importarArquivoPV(arquivoDe([['Produto', 'Qtd'], ['X', 1]])), /vencimento/);

  console.log('PASS: todos os testes de listaPV passaram');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
