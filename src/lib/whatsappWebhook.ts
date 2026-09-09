// ─────────────────────────────────────────
// whatsappWebhook.ts — partes puras do webhook da Meta Cloud API:
// validação da assinatura HMAC e leitura do payload aninhado.
// ─────────────────────────────────────────
import crypto from 'node:crypto';

export function verificarAssinatura(
  corpoCru: Buffer | string,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(corpoCru).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface MensagemRecebida {
  messageId: string;
  from: string;
  tipo: 'text' | 'image' | 'outro';
  imageId?: string;
  caption?: string;
  texto?: string;
}

export function parseWebhookPayload(body: any): MensagemRecebida[] {
  const out: MensagemRecebida[] = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const msgs = Array.isArray(ch?.value?.messages) ? ch.value.messages : [];
      for (const m of msgs) {
        if (!m?.id || !m?.from) continue;
        if (m.type === 'image') {
          out.push({
            messageId: m.id, from: String(m.from), tipo: 'image',
            imageId: m.image?.id, caption: m.image?.caption || undefined,
          });
        } else if (m.type === 'text') {
          out.push({ messageId: m.id, from: String(m.from), tipo: 'text', texto: m.text?.body || '' });
        } else {
          out.push({ messageId: m.id, from: String(m.from), tipo: 'outro' });
        }
      }
    }
  }
  return out;
}
