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
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache sqlite-libs

# Copiar apenas o necessário
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY tsconfig.json ./

# Instalar tsx para rodar TypeScript em produção
RUN npm install -g tsx

# Criar diretório para uploads locais
RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["tsx", "server.ts"]
