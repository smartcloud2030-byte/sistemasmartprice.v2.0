import assert from 'node:assert';
import { ENCARTE_TEMAS, getTemaById, MOLDE_WIDTH_PX, MOLDE_HEIGHT_PX } from './encarteTemas';

const HEX_RE = /^#[0-9a-f]{6}$/i;

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
  getTemaByIdEncontraTemaExistente();
  getTemaByIdRetornaUndefinedParaIdInexistente();
  dimensoesDoMoldeEstaoCorretas();
  console.log('PASS: todos os testes de encarteTemas passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
