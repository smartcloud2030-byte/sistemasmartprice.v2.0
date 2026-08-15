import assert from 'node:assert';
import { ENCARTE_TEMAS, getTemaById, MOLDE_WIDTH_PX, MOLDE_HEIGHT_PX } from './encarteTemas';

const HEX_RE = /^#[0-9a-f]{6}$/i;

// Calcula o contraste WCAG entre uma cor e branco puro — usado tanto pra
// verificar se o texto branco fixo da caixa de preço le bem em cima do
// priceBoxColor, quanto se o productNameColor le bem sobre o painel claro
// (que e branco ou creme bem proximo de branco).
function relativeLuminance(hex: string): number {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => parseInt(h, 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatioComBranco(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

// Contraste WCAG entre duas cores hex quaisquer (nao so contra branco) —
// usado pra checar o titulo contra as duas pontas do proprio gradiente do
// tema, ja que ele nao fica sobre um fundo branco como o preco/nome.
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

function existemDezTemas() {
  assert.strictEqual(ENCARTE_TEMAS.length, 10);
}

function idsSaoUnicos() {
  const ids = ENCARTE_TEMAS.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length);
}

function todosOsCamposObrigatoriosEstaoPreenchidos() {
  for (const tema of ENCARTE_TEMAS) {
    assert.ok(tema.nome.trim().length > 0, `tema ${tema.id} sem nome`);
    assert.ok(tema.background.cores.length >= 2, `tema ${tema.id} precisa de pelo menos 2 cores no gradiente`);
    for (const cor of tema.background.cores) assert.match(cor, HEX_RE, `tema ${tema.id} com cor de fundo invalida: ${cor}`);
    assert.match(tema.painelClaroColor, HEX_RE, `tema ${tema.id} com painelClaroColor invalido`);
    assert.match(tema.tituloColor, HEX_RE, `tema ${tema.id} com tituloColor invalido`);
    assert.match(tema.subtituloColor, HEX_RE, `tema ${tema.id} com subtituloColor invalido`);
    assert.match(tema.priceBoxColor, HEX_RE, `tema ${tema.id} com priceBoxColor invalido`);
    assert.match(tema.productNameColor, HEX_RE, `tema ${tema.id} com productNameColor invalido`);
    assert.ok(tema.icone.trim().length > 0, `tema ${tema.id} sem icone`);
  }
}

function priceBoxColorTemContrasteSuficienteComTextoBranco() {
  for (const tema of ENCARTE_TEMAS) {
    const ratio = contrastRatioComBranco(tema.priceBoxColor);
    assert.ok(ratio >= 4.5, `tema ${tema.id}: priceBoxColor ${tema.priceBoxColor} tem contraste ${ratio.toFixed(2)}:1 com texto branco, abaixo de 4.5:1`);
  }
}

function productNameColorTemContrasteSuficienteComPainelClaro() {
  for (const tema of ENCARTE_TEMAS) {
    const ratio = contrastRatio(tema.productNameColor, tema.painelClaroColor);
    assert.ok(ratio >= 4.5, `tema ${tema.id}: productNameColor ${tema.productNameColor} tem contraste ${ratio.toFixed(2)}:1 sobre painelClaroColor ${tema.painelClaroColor}, abaixo de 4.5:1`);
  }
}

function tituloColorTemContrasteSuficienteComOFundo() {
  for (const tema of ENCARTE_TEMAS) {
    for (const corDoGradiente of tema.background.cores) {
      const ratioTitulo = contrastRatio(tema.tituloColor, corDoGradiente);
      assert.ok(ratioTitulo >= 3, `tema ${tema.id}: tituloColor ${tema.tituloColor} tem contraste ${ratioTitulo.toFixed(2)}:1 contra ${corDoGradiente}, abaixo de 3:1 (minimo pra texto grande/negrito)`);

      const ratioSubtitulo = contrastRatio(tema.subtituloColor, corDoGradiente);
      assert.ok(ratioSubtitulo >= 3, `tema ${tema.id}: subtituloColor ${tema.subtituloColor} tem contraste ${ratioSubtitulo.toFixed(2)}:1 contra ${corDoGradiente}, abaixo de 3:1 (minimo pra texto grande/negrito)`);
    }
  }
}

function getTemaByIdEncontraTemaExistente() {
  const tema = getTemaById('inverno');
  assert.ok(tema);
  assert.strictEqual(tema?.nome, 'Inverno');
}

function getTemaByIdRetornaUndefinedParaIdInexistente() {
  assert.strictEqual(getTemaById('nao-existe'), undefined);
}

function dimensoesDoMoldeEstaoCorretas() {
  assert.strictEqual(MOLDE_WIDTH_PX, 2480);
  assert.strictEqual(MOLDE_HEIGHT_PX, 3508);
}

try {
  existemDezTemas();
  idsSaoUnicos();
  todosOsCamposObrigatoriosEstaoPreenchidos();
  priceBoxColorTemContrasteSuficienteComTextoBranco();
  productNameColorTemContrasteSuficienteComPainelClaro();
  tituloColorTemContrasteSuficienteComOFundo();
  getTemaByIdEncontraTemaExistente();
  getTemaByIdRetornaUndefinedParaIdInexistente();
  dimensoesDoMoldeEstaoCorretas();
  console.log('PASS: todos os testes de encarteTemas passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
