// Gera src/data/cmed.json.gz a partir da Lista PMC da CMED/Anvisa (código de
// barras -> nome do medicamento). Roda no Mac, NÃO no servidor (ler o xlsx
// gasta ~600 MB). Uso:
//   node scripts/atualizar-cmed.cjs            (baixa a lista mais nova)
//   node scripts/atualizar-cmed.cjs lista.xlsx (usa um arquivo já baixado)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const XLSX = require('xlsx');

const PAGINA = 'https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos';

async function baixarLista() {
  const html = await (await fetch(PAGINA, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const m = html.match(/href="([^"]*lista_pmc_[^"]*\.xlsx[^"]*)"/i);
  if (!m) throw new Error('Não achei o link da lista PMC na página da CMED.');
  const url = new URL(m[1], PAGINA).toString();
  console.log('Baixando', url);
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer());
  return { buf, fonte: decodeURIComponent(url.split('/arquivos/')[1]?.split('/')[0] || url) };
}

(async () => {
  const arquivo = process.argv[2];
  const { buf, fonte } = arquivo ? { buf: fs.readFileSync(arquivo), fonte: path.basename(arquivo) } : await baixarLista();
  const wb = XLSX.read(buf, { dense: true });
  const nomeAba = wb.SheetNames.find((n) => /pmc/i.test(n)) || wb.SheetNames[wb.SheetNames.length - 1];
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, defval: '' });
  const ih = linhas.findIndex((r) => r.some((c) => String(c).trim().startsWith('EAN')));
  const cab = linhas[ih].map((c) => String(c).trim().toUpperCase());
  const col = (nome) => cab.findIndex((c) => c === nome || c.startsWith(nome));
  const cEan = [col('EAN 1'), col('EAN 2'), col('EAN 3')].filter((i) => i >= 0);
  const cProd = col('PRODUTO'), cApres = col('APRESENTA'), cLab = col('LABORAT'), cSubst = col('SUBST');
  if (cEan.length === 0 || cProd < 0) throw new Error('Colunas EAN/PRODUTO não encontradas — a CMED mudou o layout?');

  const itens = {};
  for (const r of linhas.slice(ih + 1)) {
    const dados = [r[cProd], r[cApres], r[cLab], r[cSubst]].map((v) => String(v ?? '').replace(/\s+/g, ' ').trim());
    if (!dados[0]) continue;
    for (const c of cEan) {
      const ean = String(r[c] ?? '').replace(/\D/g, '');
      if (ean.length <= 14 && ean.replace(/^0+/, '').length >= 8 && !itens[ean]) itens[ean] = dados;
    }
  }
  const saida = { fonte, geradoEm: new Date().toISOString(), itens };
  const destino = path.join(__dirname, '..', 'src', 'data', 'cmed.json.gz');
  fs.writeFileSync(destino, zlib.gzipSync(JSON.stringify(saida), { level: 9 }));
  console.log(`${Object.keys(itens).length} códigos de barras -> ${destino} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
