import assert from 'node:assert';
import { extrairCodigos } from './ImportarPorCodigo';

assert.deepStrictEqual(extrairCodigos('7891058017392\n7896714218267\n7891058017392'), ['7891058017392', '7896714218267']);
assert.deepStrictEqual(extrairCodigos('codigo;nome\n7891000100103;LEITE\n12345;x\n78912345,07891106000956'), ['7891000100103', '78912345', '07891106000956']);
console.log('extrairCodigos: ok');
