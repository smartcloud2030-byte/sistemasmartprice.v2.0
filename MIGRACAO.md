# SmartPrice — Guia Completo de Migração

## Arquitetura Final

```
[GitHub] ──push──► [GitHub Actions] ──SSH──► [VPS Ubuntu]
                                                   │
                              ┌────────────────────┼────────────────────┐
                              │                    │                    │
                         [Nginx + SSL]      [Docker Network]           │
                              │                    │                    │
                    ┌─────────┴──────┐    ┌───────┴──────┐    ┌───────┴──────┐
                    │  App Express   │    │  PostgreSQL   │    │    MinIO     │
                    │  React + Vite  │    │  (banco DB)   │    │  (imagens)   │
                    │  Socket.io     │    │  porta 5432   │    │  porta 9000  │
                    │  porta 3000    │    └───────────────┘    │  admin 9001  │
                    └────────────────┘                         └──────────────┘
                              │
                    [Cloudflare CDN]
                    (na frente de tudo)
```

---

## Passo 1 — Subdomínios DNS

No seu painel de DNS (Cloudflare ou registrador), crie:

| Subdomínio | Tipo | Valor |
|---|---|---|
| `seudominio.com.br` | A | IP da VPS |
| `www.seudominio.com.br` | A | IP da VPS |
| `imagens.seudominio.com.br` | A | IP da VPS |
| `minio-admin.seudominio.com.br` | A | IP da VPS |

> No Cloudflare: deixe `imagens.` com proxy laranja (CDN ativa).
> `minio-admin.` deixe cinza (direto, sem CDN — mais seguro para painel admin).

---

## Passo 2 — Instalar na VPS

```bash
# Conectar na VPS
ssh root@IP_DA_VPS

# Baixar e rodar o script de setup
wget https://raw.githubusercontent.com/SEU_USUARIO/smartprice/main/setup-vps.sh
chmod +x setup-vps.sh
sudo bash setup-vps.sh
```

---

## Passo 3 — Subir o código

```bash
su - deploy
git clone https://github.com/SEU_USUARIO/smartprice.git /var/www/smartprice
cd /var/www/smartprice
cp .env.example .env
nano .env   # preencher as variáveis
```

---

## Passo 4 — Configurar Nginx

```bash
# Como root
sudo cp /var/www/smartprice/nginx.conf /etc/nginx/sites-available/smartprice

# Editar domínio no arquivo
sudo nano /etc/nginx/sites-available/smartprice
# Substituir "seudominio.com.br" pelo seu domínio real

# Ativar site
sudo ln -s /etc/nginx/sites-available/smartprice /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Passo 5 — SSL (HTTPS grátis)

```bash
# App principal
sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br

# Galeria de imagens
sudo certbot --nginx -d imagens.seudominio.com.br

# Painel MinIO
sudo certbot --nginx -d minio-admin.seudominio.com.br
```

---

## Passo 6 — Subir containers

```bash
cd /var/www/smartprice
docker compose up -d --build

# Acompanhar logs
docker compose logs -f app
docker compose logs -f postgres
docker compose logs -f minio
```

---

## Passo 7 — Migrar dados do Supabase

```bash
# No seu computador local, exportar dados do Supabase:
pg_dump "postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres" \
  --data-only \
  --table=chat_messages \
  -f supabase_backup.sql

# Copiar para a VPS
scp supabase_backup.sql deploy@IP_VPS:/var/www/smartprice/

# Na VPS, importar
docker exec -i smartprice_postgres psql -U smartprice -d smartprice < supabase_backup.sql
```

---

## Passo 8 — Deploy automático (GitHub Actions)

No GitHub do repositório, vá em **Settings → Secrets and variables → Actions** e crie:

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP da sua VPS |
| `VPS_SSH_KEY` | Chave SSH privada do usuário deploy |

Para gerar a chave SSH:
```bash
# Na VPS, como usuário deploy
ssh-keygen -t ed25519 -C "deploy@smartprice" -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/deploy_key  # copiar este conteúdo para o secret VPS_SSH_KEY
```

Depois disso, qualquer `git push` para `main` faz o deploy automático!

---

## Cloudflare (fase final)

1. Mover nameservers do domínio para o Cloudflare
2. Em **SSL/TLS** → modo **Full (strict)**
3. Em **Speed → Optimization** → ativar **Auto Minify**
4. Em **Caching → Cache Rules** → criar regra:
   - URL: `imagens.seudominio.com.br/*`
   - Cache Level: Cache Everything
   - Edge TTL: 1 month

Isso faz as imagens carregarem do servidor do Cloudflare mais próximo do usuário — zero latência.

---

## Verificar se tudo está rodando

```bash
# Status dos containers
docker compose ps

# Logs em tempo real
docker compose logs -f

# Testar banco
docker exec -it smartprice_postgres psql -U smartprice -d smartprice -c "\dt"

# Testar MinIO
curl http://localhost:9000/minio/health/live
```

---

## URLs finais

| Serviço | URL |
|---|---|
| App SmartPrice | https://seudominio.com.br |
| Galeria de imagens | https://imagens.seudominio.com.br |
| Painel MinIO | https://minio-admin.seudominio.com.br |
