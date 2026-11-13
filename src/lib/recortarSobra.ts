import sharp from 'sharp';

/**
 * Corta o espaço vazio em volta do produto (sobra transparente que fica
 * depois de tirar o fundo) e devolve a foto com uma margem pequena e igual
 * pra todas — assim o card mostra todos os produtos num tamanho parecido.
 *
 * Só mexe em foto COM transparência (PNG/WEBP com fundo removido). Arte com
 * fundo (cadastro com "remover fundo" desmarcado) passa intacta. Qualquer
 * erro devolve a original — nunca quebra o cadastro.
 */
export async function recortarSobra(buf: Buffer, margem = 0.04): Promise<Buffer> {
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.hasAlpha || !meta.width || !meta.height) return buf;

    // Caixa do produto pelo canal alfa (pixel com alfa > 12 conta como produto).
    const { data, info } = await sharp(buf).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const linha = y * w;
      for (let x = 0; x < w; x++) {
        if (data[linha + x] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return buf; // tudo transparente
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    // Já está justa (sobra < 2% em todo lado): não regrava à toa.
    if (cw >= w * 0.96 && ch >= h * 0.96) return buf;

    const m = Math.round(Math.max(cw, ch) * margem);
    return await sharp(buf)
      .extract({ left: x0, top: y0, width: cw, height: ch })
      .extend({ top: m, bottom: m, left: m, right: m, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return buf;
  }
}
