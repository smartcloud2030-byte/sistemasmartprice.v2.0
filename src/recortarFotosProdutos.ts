/**
 * Corta a sobra transparente das fotos de produto JÁ cadastradas (o cadastro
 * novo já faz isso sozinho — ver recortarSobra no upload-nobg2).
 *
 * Roda dentro do container:
 *   docker exec smartprice_app tsx src/recortarFotosProdutos.ts            → só conta e gera amostras em /tmp/recorte-amostras
 *   docker exec smartprice_app tsx src/recortarFotosProdutos.ts --aplicar  → grava as fotos novas e troca a URL no produto
 *
 * Grava com NOME NOVO (a URL antiga fica em cache de 1 ano no navegador) e
 * não apaga a antiga — encarte salvo que ainda aponta pra ela continua abrindo.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Pool } from 'pg';
import { minioClient, BUCKET } from './gallery';
import { recortarSobra } from './lib/recortarSobra';

const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://imagens.sistemasmartprice.com.br';
const APLICAR = process.argv.includes('--aplicar');
const AMOSTRAS = '/tmp/recorte-amostras';

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

async function baixar(chave: string): Promise<Buffer> {
  const stream = await minioClient.getObject(BUCKET, chave);
  const partes: Buffer[] = [];
  for await (const p of stream) partes.push(p as Buffer);
  return Buffer.concat(partes);
}

async function amostra(i: number, antes: Buffer, depois: Buffer) {
  const lado = async (b: Buffer) =>
    sharp(b).resize(300, 300, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
  const img = await sharp({ create: { width: 640, height: 320, channels: 3, background: '#d4d4d8' } })
    .composite([{ input: await lado(antes), left: 10, top: 10 }, { input: await lado(depois), left: 330, top: 10 }])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(AMOSTRAS, `${String(i).padStart(2, '0')}.png`), img);
}

(async () => {
  const prefixo = `${PUBLIC_URL}/${BUCKET}/`;
  const { rows } = await pool.query<{ image: string }>(
    `SELECT DISTINCT image FROM products WHERE image LIKE $1 || '%'`,
    [prefixo],
  );
  console.log(`${rows.length} fotos de produto na galeria. Modo: ${APLICAR ? 'APLICAR' : 'só conferir'}`);
  if (!APLICAR) fs.mkdirSync(AMOSTRAS, { recursive: true });

  let mudou = 0, igual = 0, erro = 0, amostrasFeitas = 0;
  for (const [i, { image }] of rows.entries()) {
    const chave = decodeURIComponent(image.slice(prefixo.length).split('?')[0]);
    try {
      const antes = await baixar(chave);
      const depois = await recortarSobra(antes);
      if (depois === antes) { igual++; continue; }
      mudou++;
      if (!APLICAR) {
        if (amostrasFeitas < 16 && i % 3 === 0) await amostra(amostrasFeitas++, antes, depois);
        continue;
      }
      const sufixo = `r${Date.now().toString(36)}`;
      const base = chave.replace(/\.[^./]+$/, '').replace(/-thumb$/, '');
      const novaChave = `${base}-${sufixo}.webp`;
      const novaThumb = `${base}-${sufixo}-thumb.webp`;
      const main = await sharp(depois).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const thumb = await sharp(depois).resize(200, 200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
      await minioClient.putObject(BUCKET, novaChave, main, main.length, { 'Content-Type': 'image/webp' });
      await minioClient.putObject(BUCKET, novaThumb, thumb, thumb.length, { 'Content-Type': 'image/webp' });
      await pool.query(`UPDATE products SET image = $1, thumb_image = $2 WHERE image = $3`, [
        prefixo + novaChave,
        prefixo + novaThumb,
        image,
      ]);
    } catch (e: any) {
      erro++;
      console.warn('erro em', chave, e.message);
    }
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${rows.length}…`);
  }
  console.log(`Pronto. Recortadas: ${mudou} | já estavam justas/sem transparência: ${igual} | erro: ${erro}`);
  if (!APLICAR) console.log(`Amostras (antes | depois) em ${AMOSTRAS}`);
  await pool.end();
  process.exit(0);
})();
