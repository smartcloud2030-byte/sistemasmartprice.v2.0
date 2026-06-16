import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase only if credentials are provided
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

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
    maxHttpBufferSize: 1e8 // 100mb for attachments
  });

  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // In-memory fallback for the last 100 messages
  let inMemoryMessages: any[] = [];

  // Cleanup old messages every 10 minutes
  setInterval(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    
    // Cleanup in-memory
    inMemoryMessages = inMemoryMessages.filter(m => new Date(m.timestamp) > sixHoursAgo);

    // Cleanup Supabase
    if (supabase) {
      try {
        let { error } = await supabase
          .from('chat_messages')
          .delete()
          .lt('created_at', sixHoursAgo.toISOString());
        
        // Fallback to 'chat_messagens'
        if (error && (error.code === '42P01' || error.message?.includes('not found'))) {
          const { error: retryError } = await supabase
            .from('chat_messagens')
            .delete()
            .lt('created_at', sixHoursAgo.toISOString());
          error = retryError;
        }

        if (error && error.code !== 'PGRST116') {
          console.error('Error cleaning up Supabase messages:', error);
        }
      } catch (err) {
        console.error('Supabase cleanup exception:', err);
      }
    }
  }, 10 * 60 * 1000);

  const activeUsers = new Map();

  io.on("connection", (socket) => {
    console.log("New socket connection attempt:", socket.id);

    socket.on("error", (err) => {
      console.error("Socket error for", socket.id, ":", err);
    });

    socket.on("user:join", async (userData) => {
      if (!userData) return;
      const cnpj = String(userData.cnpj || '').replace(/[^\d]/g, '');
      const username = String(userData.username || 'Unknown');
      const role = String(userData.role || 'user');

      console.log(`[CHAT] User joined: ${username} (${cnpj}) as ${role}`);
      activeUsers.set(socket.id, { ...userData, cnpj, username, role });
      
      if (cnpj) {
        socket.join(`user_${cnpj}`);
        console.log(`[CHAT] Socket ${socket.id} joined room: user_${cnpj}`);
      }

      if (role === 'admin') {
        socket.join("admin_room");
        console.log(`[CHAT] Socket ${socket.id} joined room: admin_room`);
      }

      let history: any[] = [];

      // Try to load from Supabase first
      if (supabase) {
        try {
          let { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: true });

          // Fallback to 'chat_messagens'
          if (error && (error.code === '42P01' || error.message?.includes('not found'))) {
            const { data: retryData, error: retryError } = await supabase
              .from('chat_messagens')
              .select('*')
              .order('created_at', { ascending: true });
            data = retryData;
            error = retryError;
          }

          if (!error && data) {
            history = data.map(m => ({
              id: m.id,
              text: m.text,
              timestamp: m.created_at,
              from: {
                cnpj: m.from_cnpj,
                username: m.from_username,
                role: m.from_role
              },
              to: m.to_cnpj ? {
                cnpj: m.to_cnpj,
                username: m.to_username
              } : null,
              attachment: m.attachment,
              attachmentType: m.attachment_type
            }));
          }
        } catch (err) {
          console.error('Error fetching Supabase history:', err);
        }
      }

      // Merge with in-memory (and remove duplicates)
      const combinedHistory = [...history, ...inMemoryMessages];
      const uniqueHistory = Array.from(new Map(combinedHistory.map(m => [m.id, m])).values())
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Filter for the specific user
      const filteredHistory = uniqueHistory.filter(m => 
        userData.role === 'admin' || m.from.cnpj === userData.cnpj || m.to?.cnpj === userData.cnpj
      );

      socket.emit("message:history", filteredHistory);
    });

    socket.on("message:send", async (messageData) => {
      const fullMessage = {
        ...messageData,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      };

      console.log(`Message from ${messageData.from.username} (${messageData.from.role}) to ${messageData.to?.cnpj || 'All'}`);

      // Store in-memory
      inMemoryMessages.push(fullMessage);
      if (inMemoryMessages.length > 500) inMemoryMessages.shift();

      // Store in Supabase
      if (supabase) {
        try {
          let { error } = await supabase
            .from('chat_messages')
            .insert([{
              id: fullMessage.id,
              from_cnpj: fullMessage.from.cnpj,
              from_username: fullMessage.from.username,
              from_role: fullMessage.from.role,
              to_cnpj: fullMessage.to?.cnpj || null,
              to_username: fullMessage.to?.username || null,
              text: fullMessage.text,
              attachment: fullMessage.attachment || null,
              attachment_type: fullMessage.attachmentType || null,
              created_at: fullMessage.timestamp
            }]);

          // Fallback to 'chat_messagens'
          if (error && (error.code === '42P01' || error.message?.includes('not found'))) {
            const { error: retryError } = await supabase
              .from('chat_messagens')
              .insert([{
                id: fullMessage.id,
                from_cnpj: fullMessage.from.cnpj,
                from_username: fullMessage.from.username,
                from_role: fullMessage.from.role,
                to_cnpj: fullMessage.to?.cnpj || null,
                to_username: fullMessage.to?.username || null,
                text: fullMessage.text,
                attachment: fullMessage.attachment || null,
                attachment_type: fullMessage.attachmentType || null,
                created_at: fullMessage.timestamp
              }]);
            error = retryError;
          }

          if (error) console.error('Supabase insert error:', error.message);
        } catch (err) {
          console.error('Supabase insert exception:', err);
        }
      }

      // Route message
      const targetCnpj = messageData.to?.cnpj ? String(messageData.to.cnpj) : null;
      const fromCnpj = String(messageData.from.cnpj || '');

      if (messageData.from.role === 'admin') {
        if (targetCnpj) {
          // Send to user and all admins
          console.log(`[CHAT] Admin message to user_${targetCnpj}`);
          io.to(`user_${targetCnpj}`).emit("message:receive", fullMessage);
          io.to("admin_room").emit("message:receive", fullMessage);
        } else {
          // Broadcast to everyone if no target
          console.log(`[CHAT] Admin broadcast message`);
          io.emit("message:receive", fullMessage);
        }
      } else {
        // Send to all admins and back to the user's rooms
        console.log(`[CHAT] User message from user_${fromCnpj} to admin_room`);
        io.to("admin_room").emit("message:receive", fullMessage);
        io.to(`user_${fromCnpj}`).emit("message:receive", fullMessage);
      }
    });

    socket.on("message:clear", async (data) => {
      const { cnpj, role } = data;
      console.log(`Clearing messages for CNPJ: ${cnpj} (Requested by ${role})`);

      // Clear in-memory
      inMemoryMessages = inMemoryMessages.filter(m => 
        m.from.cnpj !== cnpj && m.to?.cnpj !== cnpj
      );

      // Clear Supabase
      if (supabase) {
        try {
          let { error } = await supabase
            .from('chat_messages')
            .delete()
            .or(`from_cnpj.eq.${cnpj},to_cnpj.eq.${cnpj}`);
          
          // Fallback to 'chat_messagens'
          if (error && (error.code === '42P01' || error.message?.includes('not found'))) {
            const { error: retryError } = await supabase
              .from('chat_messagens')
              .delete()
              .or(`from_cnpj.eq.${cnpj},to_cnpj.eq.${cnpj}`);
            error = retryError;
          }

          if (error) console.error('Supabase delete error:', error.message);
        } catch (err) {
          console.error('Supabase delete exception:', err);
        }
      }

      // Notify relevant rooms to refresh history
      if (role === 'admin') {
        io.to(`user_${cnpj}`).emit("message:history", []);
        io.to("admin_room").emit("message:history", inMemoryMessages.filter(m => 
          // Re-filter history for admins based on their current view if needed, 
          // but usually they just need to know it's cleared.
          // For simplicity, we just send empty to the specific user room.
          false 
        ));
        // Admins need to refresh their own view
        io.to("admin_room").emit("message:cleared", { cnpj });
      } else {
        socket.emit("message:history", []);
        io.to("admin_room").emit("message:cleared", { cnpj });
      }
    });

    socket.on("disconnect", () => {
      activeUsers.delete(socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
