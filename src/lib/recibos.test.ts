import assert from 'node:assert';
process.env.API_SECRET = process.env.API_SECRET || 'teste-secret';
import { assinarRecibo, conferirAssinaturaRecibo } from './recibos';

function assinaturaConfereConsigo() {
  const s = assinarRecibo('abc-123');
  assert.ok(s.length >= 16);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', s), true);
}
function assinaturaErradaOuDeOutroIdFalha() {
  const s = assinarRecibo('abc-123');
  assert.strictEqual(conferirAssinaturaRecibo('abc-124', s), false);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', s + 'x'), false);
  assert.strictEqual(conferirAssinaturaRecibo('abc-123', ''), false);
}

try {
  assinaturaConfereConsigo();
  assinaturaErradaOuDeOutroIdFalha();
  console.log('PASS: todos os testes de recibos (assinatura) passaram');
} catch (e: any) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
