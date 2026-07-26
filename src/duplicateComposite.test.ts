import assert from 'node:assert';
import sharp from 'sharp';
import { composeDuplicate } from './duplicateComposite';

async function opaqueCoreWithTransparentPadding(): Promise<Buffer> {
  const core = await sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: 0, g: 120, b: 200 } },
  }).png().toBuffer();
  return sharp(core)
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function producesLargerTransparentComposite() {
  const input = await opaqueCoreWithTransparentPadding();

  const result = await composeDuplicate(input);
  const resultMeta = await sharp(result).metadata();

  assert.strictEqual(resultMeta.format, 'png', 'saida deveria ser PNG');
  assert.strictEqual(resultMeta.hasAlpha, true, 'saida deveria manter canal alfa');
  // A imagem original tem 40x60 de produto (sem contar a margem transparente que
  // foi extendida). A composicao com 2 copias deslocadas sempre fica maior que
  // isso em largura e altura.
  assert.ok((resultMeta.width || 0) > 40, 'composicao deveria ser mais larga que o produto recortado sozinho (40px)');
  assert.ok((resultMeta.height || 0) > 60, 'composicao deveria ser mais alta que o produto recortado sozinho (60px)');
}

async function throwsOnInvalidBuffer() {
  await assert.rejects(
    () => composeDuplicate(Buffer.from('nao e uma imagem de verdade')),
    'buffer invalido deveria fazer composeDuplicate rejeitar a promise'
  );
}

async function main() {
  await producesLargerTransparentComposite();
  await throwsOnInvalidBuffer();
  console.log('PASS: todos os testes de duplicateComposite passaram');
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
