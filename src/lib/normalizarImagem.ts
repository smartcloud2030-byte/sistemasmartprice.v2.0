/**
 * Aceita qualquer formato de foto (AVIF, WEBP, HEIC do iPhone, BMP, GIF, TIFF,
 * SVG, ICO, JFIF...) e devolve JPG (ou PNG, se tiver transparência) com no
 * máximo 1600px — formato que o servidor e o recorte de fundo (rembg) tratam
 * sem surpresa, e leve pra subir. JPG/PNG de até 1,5 MB passam direto.
 */
export const ACCEPT_IMAGENS =
  'image/*,.avif,.heic,.heif,.webp,.jfif,.pjpeg,.pjp,.bmp,.tif,.tiff,.gif,.svg,.ico';

const ehHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
const passaDireto = (f: File) =>
  /^image\/(png|jpeg)$/i.test(f.type) && /\.(png|jpe?g)$/i.test(f.name);

const semExt = (nome: string) => nome.replace(/\.[^.]+$/, '') || 'imagem';

/** Acima disso a foto é reduzida antes de subir (o servidor guarda 800px). */
const MAX_LADO = 1600;
const LEVE_O_BASTANTE = 1.5 * 1024 * 1024;

/** Tem algum pixel transparente? (foto já recortada precisa continuar PNG) */
function temTransparencia(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < data.length; i += 4 * 7) if (data[i] < 250) return true;
  return false;
}

/**
 * Redesenha a foto com no máximo MAX_LADO px. Sai JPG (leve) quando não tem
 * transparência, PNG quando tem. Antes WEBP/AVIF virava PNG de até 3000px
 * (10 MB+) e o envio travava em "Quase pronto... 80%" em internet lenta.
 */
async function reduzir(blob: Blob, nome: string): Promise<File> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // SVG sem tamanho próprio vem 0×0 ou minúsculo — desenha num tamanho útil.
    let w = img.naturalWidth || 1000;
    let h = img.naturalHeight || 1000;
    const escala = Math.min(1, MAX_LADO / Math.max(w, h));
    w = Math.max(1, Math.round(w * escala));
    h = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const png = temTransparencia(ctx, w, h);
    const tipo = png ? 'image/png' : 'image/jpeg';
    const saida = await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error('não deu pra converter'))), tipo, png ? undefined : 0.9),
    );
    return new File([saida], `${semExt(nome)}.${png ? 'png' : 'jpg'}`, { type: tipo });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizarImagem(file: File): Promise<File> {
  if (passaDireto(file) && file.size <= LEVE_O_BASTANTE) return file;
  try {
    let fonte: Blob = file;
    if (ehHeic(file)) {
      const heic2any = (await import('heic2any')).default;
      const r = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      fonte = Array.isArray(r) ? r[0] : r;
    }
    return await reduzir(fonte, file.name);
  } catch {
    // JPG/PNG que o navegador não conseguiu redesenhar: manda como está
    if (passaDireto(file)) return file;
    throw new Error(`Não consegui abrir "${file.name}". Tente salvar a foto como JPG ou PNG.`);
  }
}
