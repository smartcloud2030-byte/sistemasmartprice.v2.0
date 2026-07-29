import assert from 'node:assert';
import { formatPrice } from './encartePrice';

function splitsRealAndCentsFromBRLFormat() {
  assert.deepStrictEqual(formatPrice('R$ 6,19'), { integer: '6', cents: ',19' });
}

function acceptsPriceWithoutTheRSPrefix() {
  assert.deepStrictEqual(formatPrice('9,99'), { integer: '9', cents: ',99' });
}

function padsMissingCentsWithZero() {
  assert.deepStrictEqual(formatPrice('45'), { integer: '45', cents: ',00' });
}

function fallsBackToZeroZeroOnEmptyInput() {
  assert.deepStrictEqual(formatPrice(''), { integer: '0', cents: ',00' });
}

try {
  splitsRealAndCentsFromBRLFormat();
  acceptsPriceWithoutTheRSPrefix();
  padsMissingCentsWithZero();
  fallsBackToZeroZeroOnEmptyInput();
  console.log('PASS: todos os testes de encartePrice passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
