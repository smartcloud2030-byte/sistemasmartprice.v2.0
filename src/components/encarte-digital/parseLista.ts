/**
 * Parser da "lista colada" de produtos — feature do painel Produtos do
 * encartefácil: o usuário cola linhas tipo
 *
 *   Pão francês 9,90 kg
 *   Coca-Cola 2L 8,99
 *   Detergente - R$ 2,49
 *   Banana
 *
 * e cada linha vira { nome, preco, unidade }. O casamento com imagem do
 * catálogo é feito em quem chama (acharNoCatalogo).
 */

export interface ProdutoParseado {
  nome: string;
  preco: number;
  unidade: string;
}

const UNIDADES: Record<string, string> = {
  kg: 'kg', quilo: 'kg', quilos: 'kg', k: 'kg',
  g: 'g', grama: 'g', gramas: 'g',
  mg: 'mg',
  l: 'L', lt: 'L', litro: 'L', litros: 'L',
  ml: 'ml',
  un: 'un', und: 'un', unid: 'un', unidade: 'un', unidades: 'un', uni: 'un', pc: 'un', pç: 'un', peca: 'un', 'peça': 'un',
  cx: 'cx', caixa: 'cx', caixas: 'cx',
  pct: 'pct', pacote: 'pct', pacotes: 'pct', pac: 'pct',
  fardo: 'fardo', fd: 'fardo',
  dz: 'dz', duzia: 'dz', 'dúzia': 'dz',
  bandeja: 'bandeja', bdj: 'bandeja',
  par: 'par', pares: 'par',
  saco: 'saco', sc: 'saco',
  rolo: 'rolo',
  cada: '',
};

interface NumEncontrado {
  txt: string;
  idx: number;
  valor: number;
  temDecimal: boolean;
}

function acharNumeros(linha: string): NumEncontrado[] {
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d+\.\d{1,2}|\d+/g;
  const out: NumEncontrado[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(linha))) {
    const txt = m[0];
    let valor: number;
    let temDecimal: boolean;
    if (txt.includes(',')) {
      valor = parseFloat(txt.replace(/\./g, '').replace(',', '.'));
      temDecimal = /,\d{1,2}$/.test(txt);
    } else if (/\.\d{1,2}$/.test(txt)) {
      valor = parseFloat(txt);
      temDecimal = true;
    } else {
      valor = parseFloat(txt);
      temDecimal = false;
    }
    if (Number.isFinite(valor)) out.push({ txt, idx: m.index, valor, temDecimal });
  }
  return out;
}

export function parseLinhaProduto(raw: string): ProdutoParseado | null {
  const linha = raw.trim();
  if (!linha) return null;

  const nums = acharNumeros(linha);
  // preço = último número com casas decimais; senão o último número solto
  const comDecimal = nums.filter((n) => n.temDecimal);
  const cand = comDecimal.length ? comDecimal[comDecimal.length - 1] : nums[nums.length - 1];

  let preco = 0;
  let precoIdx = linha.length;
  let precoLen = 0;
  if (cand) {
    preco = cand.valor;
    precoIdx = cand.idx;
    precoLen = cand.txt.length;
  }

  let nome = linha.slice(0, precoIdx);
  for (let i = 0; i < 5; i++) {
    const antes = nome;
    nome = nome
      .replace(/\s*[-–—:|]\s*$/, '')
      .replace(/\s+(?:por|de|a|c\/)\s*$/i, '')
      .replace(/\s*r\$\s*$/i, '')
      .trim();
    if (nome === antes) break;
  }
  if (!nome && cand) nome = linha.replace(cand.txt, '').trim();
  if (!nome) nome = linha;

  // unidade: token logo após o preço (aceita "/kg", "- kg", "kg")
  let unidade = '';
  const depois = linha.slice(precoIdx + precoLen).toLowerCase();
  const um = depois.match(/^\s*[/\-]?\s*([a-zà-ú]+)\.?/i);
  if (um) {
    const chave = um[1];
    if (chave in UNIDADES) unidade = UNIDADES[chave];
  }

  return { nome, preco, unidade };
}

export function parseLista(texto: string): ProdutoParseado[] {
  return texto
    .split(/\r?\n/)
    .map(parseLinhaProduto)
    .filter((p): p is ProdutoParseado => p != null && p.nome.length > 0);
}
