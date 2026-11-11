/**
 * Aceita qualquer formato de foto (AVIF, WEBP, HEIC do iPhone, BMP, GIF, TIFF,
 * SVG, ICO, JFIF...) e devolve um PNG — o formato que o servidor, o recorte de
 * fundo (rembg) e o resto do sistema tratam sem surpresa. JPG e PNG passam direto.
 */
export const ACCEPT_IMAGENS =
  'image/*,.avif,.heic,.heif,.webp,.jfif,.pjpeg,.pjp,.bmp,.tif,.tiff,.gif,.svg,.ico';

const ehHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const passaDireto = (f: File) =>
  /^image\/(png|jpeg)$/i.test(f.type) && /\.(png|jpe?g)$/i.test(f.name);

const nomePng = (nome: string) => `${nome.replace(/\.[^.]+$/, '') || 'imagem'}.png`;

async function paraPngViaCanvas(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // SVG sem tamanho próprio vem 0×0 ou minúsculo — desenha num tamanho útil.
    let w = img.naturalWidth || 1000;
    let h = img.naturalHeight || 1000;
    const max = 3000;
    const escala = Math.min(1, max / Math.max(w, h));
    w = Math.round(w * escala);
    h = Math.round(h * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error('não deu pra converter'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizarImagem(file: File): Promise<File> {
  if (passaDireto(file)) return file;
  try {
    let fonte: Blob = file;
    if (ehHeic(file)) {
      const heic2any = (await import('heic2any')).default;
      const r = await heic2any({ blob: file, toType: 'image/png' });
      fonte = Array.isArray(r) ? r[0] : r;
      return new File([fonte], nomePng(file.name), { type: 'image/png' });
    }
    const png = await paraPngViaCanvas(fonte);
    return new File([png], nomePng(file.name), { type: 'image/png' });
  } catch {
    throw new Error(`Não consegui abrir "${file.name}". Tente salvar a foto como JPG ou PNG.`);
  }
}
