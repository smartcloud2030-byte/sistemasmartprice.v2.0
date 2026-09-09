import assert from 'node:assert';
import crypto from 'node:crypto';
import { verificarAssinatura, parseWebhookPayload } from './whatsappWebhook';

const SEGREDO = 'top-secret';
function assina(corpo: string) {
  return 'sha256=' + crypto.createHmac('sha256', SEGREDO).update(corpo).digest('hex');
}

function assinaturaValidaPassa() {
  const corpo = '{"a":1}';
  assert.strictEqual(verificarAssinatura(corpo, assina(corpo), SEGREDO), true);
}
function assinaturaInvalidaFalha() {
  assert.strictEqual(verificarAssinatura('{"a":1}', 'sha256=deadbeef', SEGREDO), false);
  assert.strictEqual(verificarAssinatura('{"a":1}', undefined, SEGREDO), false);
  assert.strictEqual(verificarAssinatura('{"a":1}', assina('{"a":2}'), SEGREDO), false);
}

const payloadImagem = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      value: {
        messages: [{
          id: 'wamid.ABC', from: '5599111111111', type: 'image',
          image: { id: 'MEDIA-1', caption: 'abastecimento', mime_type: 'image/jpeg' },
        }],
      },
    }],
  }],
};
const payloadTexto = {
  entry: [{ changes: [{ value: { messages: [{ id: 'wamid.T', from: '5599222', type: 'text', text: { body: 'oi' } }] } }] }],
};

function extraiImagem() {
  const [m] = parseWebhookPayload(payloadImagem);
  assert.strictEqual(m.messageId, 'wamid.ABC');
  assert.strictEqual(m.from, '5599111111111');
  assert.strictEqual(m.tipo, 'image');
  assert.strictEqual(m.imageId, 'MEDIA-1');
  assert.strictEqual(m.caption, 'abastecimento');
}
function extraiTexto() {
  const [m] = parseWebhookPayload(payloadTexto);
  assert.strictEqual(m.tipo, 'text');
  assert.strictEqual(m.texto, 'oi');
}
function payloadDeStatusOuVazioViraListaVazia() {
  assert.deepStrictEqual(parseWebhookPayload({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  assert.deepStrictEqual(parseWebhookPayload({}), []);
  assert.deepStrictEqual(parseWebhookPayload(null), []);
}

try {
  assinaturaValidaPassa();
  assinaturaInvalidaFalha();
  extraiImagem();
  extraiTexto();
  payloadDeStatusOuVazioViraListaVazia();
  console.log('PASS: todos os testes de whatsappWebhook passaram');
} catch (err: any) {
  console.error('FAIL:', err.message);
  process.exit(1);
}
