import sharp from 'sharp';

const BACK_SCALE = 0.97;
const BACK_ROTATION_DEG = -2;
const FRONT_ROTATION_DEG = 0;
const OFFSET_X_RATIO = 0.42;
const OFFSET_Y_RATIO = 0.18;
const MARGIN_RATIO = 0.22;
const SHADOW_BLUR_SIGMA = 8;
const SHADOW_OPACITY = 0.35;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 14;
// Limita a maior dimensao do produto recortado antes de compor — a saida final
// sempre passa por resize pra 800x800 no chamador, entao compor em resolucao
// muito maior que isso so custa CPU/memoria sem ganho visual.
const MAX_INPUT_DIMENSION = 1000;

// Recorta o produto, cria uma copia "da frente" (ancorada, totalmente visivel)
// e uma copia "de tras" (quase o mesmo tamanho, levemente rotacionada,
// deslocada bastante pra baixo-direita — fica saindo por tras da copia da
// frente, como numa foto real de embalagem dupla), com uma sombra suave da
// frente projetada sobre a de tras, tudo composto num canvas transparente
// maior. Deterministico: mesmos pixels reais do produto, nunca inventa/
// distorce o rotulo.
export async function composeDuplicate(buffer: Buffer): Promise<Buffer> {
  let trimmed = await sharp(buffer).trim().toBuffer();
  trimmed = await sharp(trimmed)
    .resize(MAX_INPUT_DIMENSION, MAX_INPUT_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
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
  const marginX = Math.round(width * MARGIN_RATIO);
  const marginY = Math.round(height * MARGIN_RATIO);

  // A frente fica ancorada no canto base, totalmente visivel; a de tras sai
  // deslocada pra baixo-direita, entao aparece "saindo por tras" do lado
  // direito/inferior — igual numa foto real de embalagem dupla.
  const frontLeft = marginX;
  const frontTop = marginY;
  const backLeft = marginX + offsetX;
  const backTop = marginY + offsetY;

  const canvasWidth = Math.max(backLeft + backMeta.width, frontLeft + frontMeta.width) + marginX;
  const canvasHeight = Math.max(backTop + backMeta.height, frontTop + frontMeta.height) + marginY;

  return sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: backCopy, left: backLeft, top: backTop },
      { input: shadowLayer, left: frontLeft + SHADOW_OFFSET_X, top: frontTop + SHADOW_OFFSET_Y },
      { input: frontCopy, left: frontLeft, top: frontTop },
    ])
    .png()
    .toBuffer();
}
