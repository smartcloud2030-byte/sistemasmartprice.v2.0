import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import 'dotenv/config';
import galleryRouter from './src/gallery';
import paymentsRouter, { setPaymentsSocketServer } from './src/payments';
import apiRouter, { pool, setSocketServer } from './api';

// ── Suporte / Chat: schema no Postgres local ──
// Observação: se a tabela já existir (criada por uma migration.sql antiga com
// colunas user_id/message), os ALTER TABLE abaixo apenas adicionam o que falta.
async function ensureChatSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      user_name TEXT,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID REFERENCES support_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS bandeira TEXT;`);
  await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;`);
  await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;`);
  await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_user_id ON support_conversations(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_support_messages_conv_created ON support_messages(conversation_id, created_at);`);
}

const conversationIdCache = new Map<string, string>();

async function findOrCreateConversation(cnpj: string, username?: string, bandeira?: string) {
  const res = await pool.query(
    `INSERT INTO support_conversations (user_id, user_name, bandeira, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET
       user_name = COALESCE(EXCLUDED.user_name, support_conversations.user_name),
       bandeira = COALESCE(EXCLUDED.bandeira, support_conversations.bandeira)
     RETURNING *`,
    [cnpj, username || null, bandeira || null]
  );
  conversationIdCache.set(cnpj, res.rows[0].id);
  return res.rows[0];
}

async function fetchMessages(conversationId: string) {
  const res = await pool.query(
    'SELECT * FROM support_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
  return res.rows.map(rowToMessage);
}

function rowToMessage(row: any) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_type: row.sender_type,
    text: row.message,
    timestamp: row.created_at,
    read: row.read,
    attachment_url: row.attachment_url || undefined,
    attachment_type: row.attachment_type || undefined,
  };
}

async function fetchConversationsWithUnread() {
  const res = await pool.query(`
    SELECT c.id, c.user_id AS user_id, c.user_name, c.bandeira, c.updated_at,
      (SELECT COUNT(*) FROM support_messages m WHERE m.conversation_id = c.id AND m.sender_type = 'user' AND m.read = false)::int AS unread_count
    FROM support_conversations c
    ORDER BY c.updated_at DESC
  `);
  return res.rows;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    path: "/socket.io/",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    maxHttpBufferSize: 1e8
  });
  setSocketServer(io);
  setPaymentsSocketServer(io);

  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '50mb' }));

  // ── Rotas da API (ANTES do static) ────────
  app.use('/gallery', galleryRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api', apiRouter);

  await ensureChatSchema().catch(err => console.error('Erro ao preparar schema do chat:', err));

  io.on("connection", (socket) => {
    console.log("New socket connection attempt:", socket.id);

    socket.on("error", (err) => {
      console.error("Socket error for", socket.id, ":", err);
    });

    socket.on("user:join", async (userData) => {
      if (!userData) return;
      const cnpj = String(userData.cnpj || '').replace(/[^\d]/g, '');
      const username = String(userData.username || 'Usuário');
      const role = userData.role === 'admin' ? 'admin' : 'user';
      const bandeira = userData.bandeira ? String(userData.bandeira) : undefined;

      socket.data.cnpj = cnpj;
      socket.data.username = username;
      socket.data.role = role;

      // Sala por CNPJ — usada pelo webhook de pagamento (src/payments.ts) pra
      // liberar o acesso em tempo real assim que o pagamento é confirmado.
      if (cnpj) socket.join(`cnpj_${cnpj}`);

      try {
        if (role === 'admin') {
          socket.join('admin_room');
          const conversations = await fetchConversationsWithUnread();
          socket.emit('conversation:list', { conversations });
        } else {
          if (!cnpj) return;
          const conv = await findOrCreateConversation(cnpj, username, bandeira);
          socket.join(`conv_${conv.id}`);
          const messages = await fetchMessages(conv.id);
          socket.emit('message:history', { conversationId: conv.id, cnpj, messages });
        }
      } catch (err) {
        console.error('[CHAT] Erro no user:join:', err);
      }
    });

    socket.on("conversation:open", async (data) => {
      if (socket.data.role !== 'admin') return;
      const cnpj = String(data?.cnpj || '').replace(/[^\d]/g, '');
      if (!cnpj) return;
      try {
        const conv = await findOrCreateConversation(cnpj);
        const messages = await fetchMessages(conv.id);
        socket.emit('message:history', { conversationId: conv.id, cnpj, messages });
      } catch (err) {
        console.error('[CHAT] Erro no conversation:open:', err);
      }
    });

    socket.on("message:send", async (data) => {
      const senderRole = socket.data.role === 'admin' ? 'admin' : 'user';
      const targetCnpj = senderRole === 'admin'
        ? String(data?.cnpj || '').replace(/[^\d]/g, '')
        : String(socket.data.cnpj || '');
      const text = typeof data?.text === 'string' ? data.text.trim() : '';
      const attachmentUrl = data?.attachmentUrl ? String(data.attachmentUrl) : null;
      const attachmentType = data?.attachmentType ? String(data.attachmentType) : null;

      if (!targetCnpj || (!text && !attachmentUrl)) return;

      try {
        const conv = await findOrCreateConversation(targetCnpj);
        const senderId = senderRole === 'admin' ? 'admin' : targetCnpj;
        const senderName = socket.data.username || (senderRole === 'admin' ? 'Suporte' : 'Usuário');

        const inserted = await pool.query(
          `INSERT INTO support_messages (conversation_id, sender_id, sender_name, sender_type, message, attachment_url, attachment_type, read, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, now()) RETURNING *`,
          [conv.id, senderId, senderName, senderRole, text, attachmentUrl, attachmentType]
        );
        await pool.query('UPDATE support_conversations SET updated_at = now() WHERE id = $1', [conv.id]);

        const message = rowToMessage(inserted.rows[0]);

        io.to(`conv_${conv.id}`).emit('message:receive', { cnpj: targetCnpj, message });
        io.to('admin_room').emit('message:receive', { cnpj: targetCnpj, message });
      } catch (err) {
        console.error('[CHAT] Erro no message:send:', err);
      }
    });

    socket.on("message:read", async (data) => {
      const readerRole = socket.data.role === 'admin' ? 'admin' : 'user';
      const targetCnpj = readerRole === 'admin'
        ? String(data?.cnpj || '').replace(/[^\d]/g, '')
        : String(socket.data.cnpj || '');
      if (!targetCnpj) return;

      try {
        const conv = await findOrCreateConversation(targetCnpj);
        const otherType = readerRole === 'admin' ? 'user' : 'admin';
        await pool.query(
          `UPDATE support_messages SET read = true WHERE conversation_id = $1 AND sender_type = $2 AND read = false`,
          [conv.id, otherType]
        );
        io.to(`conv_${conv.id}`).emit('message:read_receipt', { cnpj: targetCnpj, readerType: readerRole });
        io.to('admin_room').emit('message:read_receipt', { cnpj: targetCnpj, readerType: readerRole });
      } catch (err) {
        console.error('[CHAT] Erro no message:read:', err);
      }
    });

    socket.on("message:clear", async (data) => {
      const requesterRole = socket.data.role === 'admin' ? 'admin' : 'user';
      const targetCnpj = requesterRole === 'admin'
        ? String(data?.cnpj || '').replace(/[^\d]/g, '')
        : String(socket.data.cnpj || '');
      if (!targetCnpj) return;

      try {
        const conv = await findOrCreateConversation(targetCnpj);
        await pool.query('DELETE FROM support_messages WHERE conversation_id = $1', [conv.id]);
        io.to(`conv_${conv.id}`).emit('message:cleared', { cnpj: targetCnpj });
        io.to('admin_room').emit('message:cleared', { cnpj: targetCnpj });
      } catch (err) {
        console.error('[CHAT] Erro no message:clear:', err);
      }
    });

    socket.on("typing:update", async (data) => {
      const role = socket.data.role === 'admin' ? 'admin' : 'user';
      const targetCnpj = role === 'admin'
        ? String(data?.cnpj || '').replace(/[^\d]/g, '')
        : String(socket.data.cnpj || '');
      const isTyping = !!data?.isTyping;
      if (!targetCnpj) return;

      const cachedId = conversationIdCache.get(targetCnpj);
      const convId = cachedId || (await findOrCreateConversation(targetCnpj)).id;

      io.to(`conv_${convId}`).emit('typing:update', { cnpj: targetCnpj, role, isTyping });
      io.to('admin_room').emit('typing:update', { cnpj: targetCnpj, role, isTyping });
    });

    // Desconectar/atualizar remotamente um CNPJ a partir do painel admin
    // (Gerenciar Usuários → Status de Acesso). Reaproveita a sala `cnpj_*`
    // já usada pelo webhook de pagamento pra falar com aquela sessão.
    socket.on("admin:force_logout", (data) => {
      if (socket.data.role !== 'admin') return;
      const cnpj = String(data?.cnpj || '').replace(/[^\d]/g, '');
      if (!cnpj) return;
      io.to(`cnpj_${cnpj}`).emit('session:force_logout');
    });

    socket.on("admin:force_reload", (data) => {
      if (socket.data.role !== 'admin') return;
      const cnpj = String(data?.cnpj || '').replace(/[^\d]/g, '');
      if (!cnpj) return;
      io.to(`cnpj_${cnpj}`).emit('session:force_reload');
    });

    socket.on("disconnect", () => {});
  });

  // ── Frontend ───────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    // SPA fallback — exclui rotas da API
    app.get(/^(?!\/api|\/gallery|\/socket\.io).*/, (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
