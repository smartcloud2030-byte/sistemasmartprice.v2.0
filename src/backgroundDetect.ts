import sharp from 'sharp';

// Se a imagem tem canal alfa com pixels totalmente transparentes (min === 0),
// ela já veio recortada (sem fundo) antes — não precisa passar pelo rembg de novo.
// Sem canal alfa, ou com alfa 100% opaco (min === 255), ainda tem fundo.
export async function isAlreadyCutOut(buffer: Buffer): Promise<boolean> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) return false;

  const { channels } = await image.stats();
  const alphaChannel = channels[channels.length - 1];
  return alphaChannel.min === 0;
}
