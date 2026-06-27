# ─────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências nativas (canvas, better-sqlite3 precisam de compilação)
RUN apk add --no-cache python3 make g++ sqlite-dev

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─────────────────────────────────────────
# Stage 2: Production
# ─────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

RUN apt-get update && apt-get install -y python3 python3-pip libsqlite3-0 --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN pip3 install rembg flask pillow numpy onnxruntime --break-system-packages --ignore-installed

# Copiar apenas o necessário
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/api.ts ./api.ts
COPY tsconfig.json ./

# Instalar tsx para rodar TypeScript em produção
RUN npm install -g tsx

# Criar diretório para uploads locais
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["tsx", "server.ts"]
