// ─────────────────────────────────────────
// recibos.ts — armazenamento privado dos recibos de despesa de viagem.
// Bucket próprio (smartprice-recibos, SEM download anônimo). A UI abre o
// recibo por uma URL assinada pelo backend (HMAC do id da despesa com
// API_SECRET); o endpoint faz stream do objeto.
// ─────────────────────────────────────────
import * as Minio from 'minio';
import crypto from 'node:crypto';

const BUCKET = process.env.MINIO_BUCKET_RECIBOS || 'smartprice-recibos';

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

export async function ensureBucketRecibos(): Promise<void> {
  const existe = await client.bucketExists(BUCKET).catch(() => false);
  if (!existe) await client.makeBucket(BUCKET);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export async function salvarRecibo(buffer: Buffer, contentType: string, viagemId: string): Promise<string> {
  const ext = EXT[contentType] || 'bin';
  const key = `${viagemId}/${crypto.randomUUID()}.${ext}`;
  await client.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': contentType });
  return key;
}

export function statRecibo(key: string) {
  return client.statObject(BUCKET, key);
}
export function streamRecibo(key: string) {
  return client.getObject(BUCKET, key);
}

function segredo(): string {
  return process.env.API_SECRET || '';
}
export function assinarRecibo(despesaId: string): string {
  return crypto.createHmac('sha256', segredo()).update(`recibo:${despesaId}`).digest('hex').slice(0, 40);
}
export function conferirAssinaturaRecibo(despesaId: string, assinatura: string): boolean {
  if (!assinatura) return false;
  const esperado = assinarRecibo(despesaId);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
