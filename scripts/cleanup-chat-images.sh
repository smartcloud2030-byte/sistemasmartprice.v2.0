#!/bin/bash
# ─────────────────────────────────────────
# Limpeza diária das imagens do chat de suporte (retenção de 7 dias)
# Agendado por cron na VPS: 0 1 * * * (1h da manhã America/Sao_Paulo)
#
# Só apaga arquivos dentro da pasta "chat/" no MinIO — nenhuma outra
# galeria (produtos, layouts, etc.) é afetada.
# ─────────────────────────────────────────

ENV_FILE="/var/www/smartprice/.env"

GALLERY_PASSWORD=""
if [ -f "$ENV_FILE" ]; then
  GALLERY_PASSWORD=$(grep -m1 '^GALLERY_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
fi

if [ -z "$GALLERY_PASSWORD" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ERRO: GALLERY_PASSWORD não encontrado em $ENV_FILE"
  exit 1
fi

RESPONSE=$(curl -s -m 30 -X POST "http://localhost:3000/gallery/cleanup-chat" -H "x-gallery-token: $GALLERY_PASSWORD")
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESPONSE"
