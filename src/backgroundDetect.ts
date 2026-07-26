import sharp from 'sharp';

// Uma imagem so conta como "ja sem fundo" se pelo menos essa fracao dos pixels
// for totalmente transparente — evita que uma margem residual de poucos pixels
// (comum em PNGs baixados da web) engane a deteccao e pule a remocao de fundo
// numa foto que na pratica ainda tem fundo.
const MIN_TRANSPARENT_FRACTION = 0.02;

export async function isAlreadyCutOut(buffer: Buffer): Promise<boolean> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) return false;

  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const totalPixels = info.width * info.height;
  let transparentPixels = 0;
  for (let i = channels - 1; i < data.length; i += channels) {
    if (data[i] === 0) transparentPixels++;
  }
  return transparentPixels / totalPixels >= MIN_TRANSPARENT_FRACTION;
}
