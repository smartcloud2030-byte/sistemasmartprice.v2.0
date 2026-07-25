import sharp from 'sharp';

const BACK_SCALE = 0.85;
const BACK_ROTATION_DEG = -8;
const FRONT_ROTATION_DEG = 3;
const OFFSET_X_RATIO = 0.16;
const OFFSET_Y_RATIO = 0.12;
const MARGIN_RATIO = 0.25;
const SHADOW_BLUR_SIGMA = 8;
const SHADOW_OPACITY = 0.35;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 14;

// Recorta o produto, cria uma copia "de tras" (menor, rotacionada) e uma copia
// "da frente" (tamanho original, levemente rotacionada), com uma sombra suave
// atras da copia da frente, e compoe tudo num canvas transparente maior.
// Deterministico: mesmos pixels reais do produto, nunca inventa/distorce o rotulo.
export async function composeDuplicate(buffer: Buffer): Promise<Buffer> {
  const trimmed = await sharp(buffer).trim().toBuffer();
  const { width, height } = await sharp(trimmed).metadata();
  if (!width || !height) {
    throw new Error('composeDuplicate: imagem recortada ficou sem dimensoes validas');
  }

  const backCopy = await sharp(trimmed)
    .resize(Math.round(width * BACK_SCALE), Math.round(height * BACK_SCALE))
    .rotate(BACK_ROTATION_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const backMeta = await sharp(backCopy).metadata();
  if (!backMeta.width || !backMeta.height) {
    throw new Error('composeDuplicate: falha ao gerar a copia de tras');
  }

  const frontCopy = await sharp(trimmed)
    .rotate(FRONT_ROTATION_DEG, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const frontMeta = await sharp(frontCopy).metadata();
  if (!frontMeta.width || !frontMeta.height) {
    throw new Error('composeDuplicate: falha ao gerar a copia da frente');
  }

  // Sombra: silhueta preta solida (RGB preto + canal alfa da copia da frente),
  // borrada e com opacidade reduzida.
  const alphaMask = await sharp(frontCopy).extractChannel('alpha').toBuffer();
  const shadowBase = await sharp({
    create: { width: frontMeta.width, height: frontMeta.height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .joinChannel(alphaMask)
    .png()
    .toBuffer();
  const shadowLayer = await sharp(shadowBase)
    .blur(SHADOW_BLUR_SIGMA)
    .linear([1, 1, 1, SHADOW_OPACITY], [0, 0, 0, 0])
    .toBuffer();

  const offsetX = Math.round(width * OFFSET_X_RATIO);
  const offsetY = Math.round(height * OFFSET_Y_RATIO);
  const margin = Math.round(Math.max(width, height) * MARGIN_RATIO);

  const backLeft = margin;
  const backTop = margin;
  const frontLeft = margin + offsetX;
  const frontTop = margin + offsetY;

  const canvasWidth = Math.max(backLeft + backMeta.width, frontLeft + frontMeta.width) + margin;
  const canvasHeight = Math.max(backTop + backMeta.height, frontTop + frontMeta.height) + margin;

  return sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadowLayer, left: frontLeft + SHADOW_OFFSET_X, top: frontTop + SHADOW_OFFSET_Y },
      { input: backCopy, left: backLeft, top: backTop },
      { input: frontCopy, left: frontLeft, top: frontTop },
    ])
    .png()
    .toBuffer();
}
