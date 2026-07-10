#!/bin/bash
# ─────────────────────────────────────────
# Backup diário do Postgres do SmartPrice -> Google Drive (via rclone)
# Agendado por cron na VPS: 0 0 * * * (meia-noite America/Sao_Paulo)
#
# Requer na VPS:
#   - rclone configurado com o remote "gdrive" (rclone.conf em /root/.config/rclone/)
#   - container docker "smartprice_postgres" rodando
#   - .env do app em /var/www/smartprice/.env (para reportar status via API)
# ─────────────────────────────────────────

BACKUP_DIR="/root/smartprice-backups"
DRIVE_REMOTE="gdrive:SmartPriceBackups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILE="$BACKUP_DIR/smartprice_${TIMESTAMP}.sql.gz"
ENV_FILE="/var/www/smartprice/.env"
DB_CONTAINER="smartprice_postgres"
DB_USER="smartprice"
DB_NAME="smartprice"

mkdir -p "$BACKUP_DIR"

API_SECRET=""
if [ -f "$ENV_FILE" ]; then
  API_SECRET=$(grep -m1 '^API_SECRET=' "$ENV_FILE" | cut -d= -f2-)
fi

sanitize() {
  printf '%s' "$1" | tr '\n\r' '  ' | sed "s/\"/'/g" | cut -c1-300
}

report_status() {
  local status="$1" message="$2"
  [ -z "$API_SECRET" ] && return 0
  local msg_clean
  msg_clean=$(sanitize "$message")
  curl -s -m 15 -X POST "http://localhost:3000/api/settings/backup_status" \
    -H "x-api-token: $API_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"value\":{\"lastRunAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"status\":\"$status\",\"message\":\"$msg_clean\",\"fileName\":\"$(basename "$BACKUP_FILE")\"}}" \
    > /dev/null 2>&1
}

ERR_LOG=$(mktemp)

if ! docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" 2>"$ERR_LOG" | gzip > "$BACKUP_FILE"; then
  report_status "failed" "pg_dump falhou: $(cat "$ERR_LOG")"
  rm -f "$ERR_LOG" "$BACKUP_FILE"
  exit 1
fi

if [ ! -s "$BACKUP_FILE" ]; then
  report_status "failed" "Arquivo de backup ficou vazio"
  rm -f "$ERR_LOG" "$BACKUP_FILE"
  exit 1
fi

if ! rclone copy "$BACKUP_FILE" "$DRIVE_REMOTE" 2>"$ERR_LOG"; then
  report_status "failed" "Upload para o Google Drive falhou: $(cat "$ERR_LOG")"
  rm -f "$ERR_LOG"
  exit 1
fi

# Mantém só os últimos 7 dias em disco local — o histórico completo fica no Drive
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

SIZE_HUMAN=$(du -h "$BACKUP_FILE" | cut -f1)
report_status "success" "Backup concluído (${SIZE_HUMAN})"
rm -f "$ERR_LOG"
