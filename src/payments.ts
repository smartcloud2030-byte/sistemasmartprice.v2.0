// ─────────────────────────────────────────
// payments.ts — Bloqueio por pendência de pagamento (Asaas)
// Cria assinatura recorrente por CNPJ, gera cobrança (PIX/cartão) quando o
// admin marca o CNPJ como pendente, e libera o acesso automaticamente via
// webhook do Asaas quando o pagamento é confirmado.
// ─────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import type { Server } from 'socket.io';

const router = Router();

// Pool próprio (mesmo padrão de src/gallery.ts) — evita import circular com
// api.ts, que futuramente pode precisar importar algo deste módulo.
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smartprice',
  user: process.env.DB_USER || 'smartprice',
  password: process.env.DB_PASSWORD || '',
});

let io: Server | null = null;
export function setPaymentsSocketServer(server: Server) {
  io = server;
}

function apiAuth(req: Request, res: Response, next: Function) {
  const token = req.headers['x-api-token'];
  if (token === process.env.API_SECRET) return next();
  res.status(401).json({ error: 'Não autorizado' });
}

// ── Cliente Asaas ──────────────────────────
const ASAAS_ENV = process.env.ASAAS_ENV || 'sandbox';
const ASAAS_BASE_URL = ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

async function asaas(path: string, options: { method?: string; body?: any } = {}) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new Error('ASAAS_API_KEY não configurada');
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.message || `Asaas retornou ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Próxima data de vencimento (YYYY-MM-DD) a partir de um dia do mês.
function nextDueDateFromDay(dueDay: number): string {
  const now = new Date();
  const today = now.getDate();
  const target = new Date(now.getFullYear(), now.getMonth() + (dueDay >= today ? 0 : 1), dueDay);
  return target.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Leitura/escrita do blob users_and_flags (mesmo padrão do endpoint ──
// /api/activity/:cnpj em api.ts) ───────────
async function readUsersAndFlags(): Promise<any> {
  const result = await pool.query('SELECT value FROM settings WHERE id = $1', ['users_and_flags']);
  return result.rows[0]?.value || { allowedStores: [] };
}

async function writeUsersAndFlags(value: any): Promise<void> {
  await pool.query(
    `INSERT INTO settings (id, value, updated_at) VALUES ('users_and_flags', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(value)]
  );
}

function normalizeCnpj(cnpj: string): string {
  return (cnpj || '').replace(/[^\d]/g, '');
}

// ── Criar assinatura recorrente para um CNPJ ──────────
router.post('/subscription', apiAuth, async (req: Request, res: Response) => {
  const { cnpj, name, cpfCnpj, value, dueDay } = req.body || {};
  if (!cnpj || !name || !cpfCnpj || !value || !dueDay) {
    return res.status(400).json({ error: 'cnpj, name, cpfCnpj, value e dueDay são obrigatórios' });
  }
  const nc = normalizeCnpj(cnpj);

  try {
    const flags = await readUsersAndFlags();
    const stores: any[] = flags.allowedStores || [];
    const storeIndex = stores.findIndex((s) => normalizeCnpj(s.cnpj) === nc);
    if (storeIndex === -1) return res.status(404).json({ error: 'CNPJ não encontrado em allowedStores' });

    let asaasCustomerId = stores[storeIndex].asaasCustomerId;
    if (!asaasCustomerId) {
      const customer = await asaas('/customers', {
        method: 'POST',
        body: { name, cpfCnpj: cpfCnpj.replace(/[^\d]/g, ''), externalReference: nc },
      });
      asaasCustomerId = customer.id;
    }

    const subscription = await asaas('/subscriptions', {
      method: 'POST',
      body: {
        customer: asaasCustomerId,
        billingType: 'UNDEFINED',
        value: Number(value),
        nextDueDate: nextDueDateFromDay(Number(dueDay)),
        cycle: 'MONTHLY',
        description: `SmartPrice — mensalidade CNPJ ${cnpj}`,
        externalReference: nc,
      },
    });

    stores[storeIndex] = {
      ...stores[storeIndex],
      asaasCustomerId,
      asaasSubscriptionId: subscription.id,
      subscriptionValue: Number(value),
      subscriptionDueDay: Number(dueDay),
    };
    flags.allowedStores = stores;
    await writeUsersAndFlags(flags);

    res.json({ success: true, asaasCustomerId, asaasSubscriptionId: subscription.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Buscar/gerar cobrança pendente pra tela de bloqueio ──────────
router.get('/charge/:cnpj', async (req: Request, res: Response) => {
  const nc = normalizeCnpj(req.params.cnpj);
  try {
    const flags = await readUsersAndFlags();
    const store = (flags.allowedStores || []).find((s: any) => normalizeCnpj(s.cnpj) === nc);
    if (!store) return res.status(404).json({ error: 'CNPJ não encontrado' });
    if (!store.asaasCustomerId) return res.status(400).json({ error: 'Nenhuma assinatura configurada para este CNPJ' });

    // Reaproveita uma cobrança PENDING já existente do cliente, se houver.
    const pendingList = await asaas(`/payments?customer=${store.asaasCustomerId}&status=PENDING&limit=1`);
    let payment = pendingList?.data?.[0];

    if (!payment) {
      // Bloqueio manual fora do ciclo normal da assinatura — gera cobrança avulsa.
      payment = await asaas('/payments', {
        method: 'POST',
        body: {
          customer: store.asaasCustomerId,
          billingType: 'UNDEFINED',
          value: store.subscriptionValue || 0,
          dueDate: todayDate(),
          description: `SmartPrice — regularização CNPJ ${store.cnpj}`,
          externalReference: nc,
        },
      });
    }

    let pixQrCode: { encodedImage: string; payload: string } | null = null;
    try {
      const pix = await asaas(`/payments/${payment.id}/pixQrCode`);
      if (pix?.encodedImage) pixQrCode = { encodedImage: pix.encodedImage, payload: pix.payload };
    } catch {
      // PIX pode não estar disponível pra esse método de cobrança — segue só com o link.
    }

    res.json({
      paymentId: payment.id,
      status: payment.status,
      value: payment.value,
      invoiceUrl: payment.invoiceUrl,
      pixQrCode,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Webhook do Asaas — libera o acesso quando o pagamento é confirmado ──────────
router.post('/webhook/asaas', async (req: Request, res: Response) => {
  const token = req.headers['asaas-access-token'];
  if (!process.env.ASAAS_WEBHOOK_TOKEN || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const { event, payment } = req.body || {};
    if ((event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') && payment?.customer) {
      const flags = await readUsersAndFlags();
      const stores: any[] = flags.allowedStores || [];
      const storeIndex = stores.findIndex((s) => s.asaasCustomerId === payment.customer);
      if (storeIndex !== -1 && stores[storeIndex].isPaymentBlocked) {
        stores[storeIndex] = { ...stores[storeIndex], isPaymentBlocked: false };
        flags.allowedStores = stores;
        await writeUsersAndFlags(flags);
        const nc = normalizeCnpj(stores[storeIndex].cnpj);
        io?.to(`cnpj_${nc}`).emit('payment:cleared');
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
