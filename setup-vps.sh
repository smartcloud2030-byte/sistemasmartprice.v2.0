#!/bin/bash
# ─────────────────────────────────────────
# SmartPrice — Script de Instalação na VPS
# Ubuntu 24.04 LTS
# Rodar como root: sudo bash setup-vps.sh
# ─────────────────────────────────────────

set -e  # Para em caso de erro

echo "========================================"
echo "  SmartPrice — Setup VPS"
echo "========================================"

# ─── 1. Atualizar sistema ───
echo ""
echo "[1/8] Atualizando sistema..."
apt update && apt upgrade -y
apt install -y curl git ufw nginx certbot python3-certbot-nginx

# ─── 2. Instalar Docker ───
echo ""
echo "[2/8] Instalando Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Docker Compose plugin
apt install -y docker-compose-plugin
docker compose version

# ─── 3. Instalar Node.js 20 ───
echo ""
echo "[3/8] Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version

# ─── 4. Configurar Firewall ───
echo ""
echo "[4/8] Configurando firewall (UFW)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status

# ─── 5. Criar usuário deploy ───
echo ""
echo "[5/8] Criando usuário deploy..."
if ! id "deploy" &>/dev/null; then
    adduser --disabled-password --gecos "" deploy
    usermod -aG docker deploy
    usermod -aG sudo deploy
    mkdir -p /home/deploy/.ssh
    cp ~/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || true
    chown -R deploy:deploy /home/deploy/.ssh
    echo "Usuário deploy criado"
else
    echo "Usuário deploy já existe"
fi

# ─── 6. Clonar repositório ───
echo ""
echo "[6/8] Configurando diretório do projeto..."
mkdir -p /var/www/smartprice
chown -R deploy:deploy /var/www/smartprice
echo "Diretório /var/www/smartprice criado"
echo ""
echo ">>> Execute manualmente como usuário deploy:"
echo "    su - deploy"
echo "    git clone https://github.com/SEU_USUARIO/smartprice.git /var/www/smartprice"

# ─── 7. Configurar Nginx ───
echo ""
echo "[7/8] Configurando Nginx..."
systemctl enable nginx
systemctl start nginx
echo "Nginx ativo"
echo ""
echo ">>> Copie o nginx.conf para /etc/nginx/sites-available/smartprice"
echo "    e ajuste o domínio antes de continuar"

# ─── 8. Instruções finais ───
echo ""
echo "[8/8] ========================================"
echo "  Setup concluído!"
echo "========================================"
echo ""
echo "Próximos passos:"
echo ""
echo "1. Copiar o projeto para a VPS:"
echo "   git clone https://github.com/SEU_USUARIO/smartprice.git /var/www/smartprice"
echo ""
echo "2. Criar o arquivo .env:"
echo "   cp /var/www/smartprice/.env.example /var/www/smartprice/.env"
echo "   nano /var/www/smartprice/.env"
echo ""
echo "3. Configurar Nginx:"
echo "   cp nginx.conf /etc/nginx/sites-available/smartprice"
echo "   ln -s /etc/nginx/sites-available/smartprice /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo ""
echo "4. Gerar SSL com Certbot:"
echo "   certbot --nginx -d seudominio.com.br -d www.seudominio.com.br"
echo "   certbot --nginx -d imagens.seudominio.com.br"
echo "   certbot --nginx -d minio-admin.seudominio.com.br"
echo ""
echo "5. Subir os containers:"
echo "   cd /var/www/smartprice"
echo "   docker compose up -d --build"
echo ""
echo "6. Ver logs:"
echo "   docker compose logs -f app"
echo ""
