import assert from 'node:assert';
import sharp from 'sharp';
import { isAlreadyCutOut } from './backgroundDetect';

async function opaqueJpegHasBackground() {
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg().toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, false, 'JPEG opaco (sem canal alfa) deveria ser detectado como COM fundo');
}

async function transparentPngIsAlreadyCutOut() {
  const opaqueCore = await sharp({
    create: { width: 6, height: 6, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
  const buffer = await sharp(opaqueCore)
    .extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, true, 'PNG com pixels totalmente transparentes deveria ser detectado como JA sem fundo');
}

async function opaquePngWithAlphaChannelHasBackground() {
  const buffer = await sharp({
    create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const result = await isAlreadyCutOut(buffer);
  assert.strictEqual(result, false, 'PNG com canal alfa mas 100% opaco deveria ser detectado como COM fundo');
}

async function main() {
  await opaqueJpegHasBackground();
  await transparentPngIsAlreadyCutOut();
  await opaquePngWithAlphaChannelHasBackground();
  console.log('PASS: todos os testes de backgroundDetect passaram');
}

main().catch(err => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
