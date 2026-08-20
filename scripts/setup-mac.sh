#!/bin/bash
# ─────────────────────────────────────────
# Setup do ambiente de dev local do SmartPrice num Mac novo.
#
# Pré-requisito manual (o script não faz isso por você):
#   - Ter copiado pro Mac, ANTES de rodar este script:
#       ~/.ssh/smartprice_vps, smartprice_vps.pub
#       ~/.ssh/smartprice_vps2, smartprice_vps2.pub
#       ~/.ssh/smartprice_ci, smartprice_ci.pub
#       .env (raiz do projeto)
#       backups/ (raiz do projeto)
#   - Docker Desktop instalado e aberto pelo menos uma vez (daemon rodando)
#
# Uso: rodar da raiz do repo -> ./scripts/setup-mac.sh
# ─────────────────────────────────────────

set -euo pipefail

ok()   { echo "✅ $1"; }
warn() { echo "⚠️  $1"; }
fail() { echo "❌ $1"; exit 1; }

echo "=== 1. Pré-requisitos (Homebrew, git, node, docker) ==="

if ! command -v brew >/dev/null 2>&1; then
  echo "Instalando Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
ok "Homebrew presente"

command -v git  >/dev/null 2>&1 || brew install git
command -v node >/dev/null 2>&1 || brew install node
ok "git $(git --version | awk '{print $3}') / node $(node -v 2>/dev/null || echo 'instalando...')"

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker não encontrado. Instale com: brew install --cask docker"
  warn "Abra o Docker Desktop manualmente e rode este script de novo."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  fail "Docker Desktop instalado mas não está rodando. Abra o app e tente de novo."
fi
ok "Docker rodando"

echo ""
echo "=== 2. Checando arquivos transferidos manualmente ==="

MISSING=0
for f in ~/.ssh/smartprice_vps ~/.ssh/smartprice_vps2 ~/.ssh/smartprice_ci; do
  if [ ! -f "$f" ]; then
    warn "Faltando: $f"
    MISSING=1
  fi
done
[ -f .env ] || { warn "Faltando .env na raiz do projeto"; MISSING=1; }
[ -d backups ] || warn "Pasta backups/ não encontrada (opcional, mas confere se não esqueceu)"

if [ "$MISSING" = "1" ]; then
  fail "Copie os arquivos que faltam (chaves SSH / .env) antes de continuar. Veja o cabeçalho deste script."
fi
ok "Chaves SSH e .env encontrados"

echo ""
echo "=== 3. Ajustando permissões das chaves SSH ==="
chmod 600 ~/.ssh/smartprice_vps ~/.ssh/smartprice_vps2 ~/.ssh/smartprice_ci
chmod 644 ~/.ssh/smartprice_vps.pub ~/.ssh/smartprice_vps2.pub ~/.ssh/smartprice_ci.pub 2>/dev/null || true
ok "Permissões ajustadas (600 nas privadas)"

echo ""
echo "=== 4. Testando acesso às VPS ==="
if timeout 10 ssh -i ~/.ssh/smartprice_vps2 -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new root@177.153.66.16 "echo ok" >/dev/null 2>&1; then
  ok "VPS2 (principal, 177.153.66.16) acessível"
else
  warn "Não consegui acessar a VPS2 por SSH — confere a chave/rede"
fi
if timeout 10 ssh -i ~/.ssh/smartprice_vps -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new root@191.252.60.15 "echo ok" >/dev/null 2>&1; then
  ok "VPS1 (standby, 191.252.60.15) acessível"
else
  warn "Não consegui acessar a VPS1 por SSH — confere a chave/rede"
fi

echo ""
echo "=== 5. Subindo Postgres e MinIO locais (Docker) ==="

if [ "$(docker ps -aq -f name=smartprice_pg_test)" ]; then
  warn "Container smartprice_pg_test já existe, pulando criação"
else
  docker run -d --name smartprice_pg_test \
    -e POSTGRES_DB=smartprice -e POSTGRES_USER=smartprice -e POSTGRES_PASSWORD=local123 \
    -p 5433:5432 postgres:16-alpine
  ok "smartprice_pg_test criado"
fi

if [ "$(docker ps -aq -f name=smartprice_minio_test)" ]; then
  warn "Container smartprice_minio_test já existe, pulando criação"
else
  docker run -d --name smartprice_minio_test \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin123 \
    -p 9000:9000 -p 9001:9001 \
    minio/minio server /data --console-address ":9001"
  ok "smartprice_minio_test criado"
fi

echo "Aguardando Postgres ficar pronto..."
for i in $(seq 1 30); do
  if docker exec smartprice_pg_test pg_isready -U smartprice -d smartprice >/dev/null 2>&1; then
    ok "Postgres pronto"
    break
  fi
  sleep 1
  [ "$i" = "30" ] && fail "Postgres não ficou pronto a tempo"
done

echo ""
echo "=== 6. Carregando schema (init.sql + migration.sql) ==="
cat init.sql | docker exec -i smartprice_pg_test psql -U smartprice -d smartprice -q
cat migration.sql | docker exec -i smartprice_pg_test psql -U smartprice -d smartprice -q
ok "Schema carregado"
warn "import_settings.sql não foi rodado (opcional) — rode manualmente se precisar dos settings de exemplo"

echo ""
echo "=== 7. Instalando dependências do projeto ==="
npm install
ok "npm install concluído"

echo ""
echo "=== Tudo pronto! ==="
echo "Rode: npm run dev"
