#!/bin/bash
# ─────────────────────────────────────────
# Backup diário do SmartPrice (Postgres + imagens da galeria/MinIO) -> Google Drive (via rclone)
# Agendado por cron na VPS: 0 0 * * * (meia-noite America/Sao_Paulo)
#
# Requer na VPS:
#   - rclone configurado com o remote "gdrive" (rclone.conf em /root/.config/rclone/)
#   - containers docker "smartprice_postgres" e "smartprice_minio" rodando
#   - .env do app em /var/www/smartprice/.env (para reportar status via API)
#
# Retenção: mantém sempre no máximo 7 arquivos de cada tipo (banco e imagens),
# tanto localmente quanto no Google Drive — ao gerar o 8º, o mais antigo é
# apagado (rotação em loop), pra nunca acumular backups demais mas sempre ter
# até 7 pontos de restauração recentes disponíveis.
# ─────────────────────────────────────────

set -o pipefail

BACKUP_DIR="/root/smartprice-backups"
DRIVE_REMOTE="gdrive:SmartPriceBackups"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DB_BACKUP_FILE="$BACKUP_DIR/smartprice_db_${TIMESTAMP}.sql.gz"
IMAGES_BACKUP_FILE="$BACKUP_DIR/smartprice_images_${TIMESTAMP}.tar.gz"
ENV_FILE="/var/www/smartprice/.env"
DB_CONTAINER="smartprice_postgres"
MINIO_CONTAINER="smartprice_minio"
DB_USER="smartprice"
DB_NAME="smartprice"
MAX_BACKUPS=7

mkdir -p "$BACKUP_DIR"

API_SECRET=""
if [ -f "$ENV_FILE" ]; then
  API_SECRET=$(grep -m1 '^API_SECRET=' "$ENV_FILE" | cut -d= -f2-)
fi

sanitize() {
  printf '%s' "$1" | tr '\n\r' '  ' | sed "s/\"/'/g" | cut -c1-300
}

report_status() {
  local status="$1" message="$2" file_name="$3"
  [ -z "$API_SECRET" ] && return 0
  local msg_clean
  msg_clean=$(sanitize "$message")
  curl -s -m 15 -X POST "http://localhost:3000/api/settings/backup_status" \
    -H "x-api-token: $API_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"value\":{\"lastRunAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"status\":\"$status\",\"message\":\"$msg_clean\",\"fileName\":\"$file_name\"}}" \
    > /dev/null 2>&1
}

# Mantém só os $MAX_BACKUPS arquivos mais recentes que casam com o prefixo,
# tanto em disco local quanto no Drive — apaga os mais antigos em excesso.
# Os nomes têm timestamp no formato YYYY-MM-DD_HH-MM-SS, então ordenar por
# nome (alfabético) já equivale a ordenar por data.
rotate_local() {
  local prefix="$1"
  local files excess
  files=$(cd "$BACKUP_DIR" && ls -1 2>/dev/null | grep "^${prefix}" | sort)
  excess=$(( $(printf '%s\n' "$files" | grep -c .) - MAX_BACKUPS ))
  if [ "$excess" -gt 0 ]; then
    printf '%s\n' "$files" | head -n "$excess" | while IFS= read -r f; do
      [ -n "$f" ] && rm -f "$BACKUP_DIR/$f"
    done
  fi
}

rotate_remote() {
  local prefix="$1"
  local files excess
  files=$(rclone lsf "$DRIVE_REMOTE" --files-only 2>/dev/null | grep "^${prefix}" | sort)
  excess=$(( $(printf '%s\n' "$files" | grep -c .) - MAX_BACKUPS ))
  if [ "$excess" -gt 0 ]; then
    printf '%s\n' "$files" | head -n "$excess" | while IFS= read -r f; do
      [ -n "$f" ] && rclone deletefile "$DRIVE_REMOTE/$f"
    done
  fi
}

ERR_LOG=$(mktemp)

# ── 1. Backup do banco (pg_dump) ──────────
if ! docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" 2>"$ERR_LOG" | gzip > "$DB_BACKUP_FILE"; then
  report_status "failed" "pg_dump falhou: $(cat "$ERR_LOG")" "$(basename "$DB_BACKUP_FILE")"
  rm -f "$ERR_LOG" "$DB_BACKUP_FILE"
  exit 1
fi

if [ ! -s "$DB_BACKUP_FILE" ]; then
  report_status "failed" "Arquivo de backup do banco ficou vazio" "$(basename "$DB_BACKUP_FILE")"
  rm -f "$ERR_LOG" "$DB_BACKUP_FILE"
  exit 1
fi

# ── 2. Backup das imagens (volume do MinIO) ──────────
# Usa um container descartável com --volumes-from pra ler o mesmo volume do
# MinIO e compactar tudo, sem precisar de credenciais do MinIO nem depender
# do bucket estar público.
if ! docker run --rm --volumes-from "$MINIO_CONTAINER" alpine tar czf - \
  --exclude='./.minio.sys/tmp' --exclude='./.minio.sys/tmp/*' \
  --exclude='./.minio.sys/buckets/*/.metacache' --exclude='./.minio.sys/buckets/*/.metacache/*' \
  -C /data . > "$IMAGES_BACKUP_FILE" 2>"$ERR_LOG"; then
  report_status "failed" "Backup das imagens falhou: $(cat "$ERR_LOG")" "$(basename "$IMAGES_BACKUP_FILE")"
  rm -f "$ERR_LOG" "$IMAGES_BACKUP_FILE"
  exit 1
fi

if [ ! -s "$IMAGES_BACKUP_FILE" ]; then
  report_status "failed" "Arquivo de backup das imagens ficou vazio" "$(basename "$IMAGES_BACKUP_FILE")"
  rm -f "$ERR_LOG" "$IMAGES_BACKUP_FILE"
  exit 1
fi

# ── 3. Envia os dois para o Google Drive ──────────
if ! rclone copy "$DB_BACKUP_FILE" "$DRIVE_REMOTE" 2>"$ERR_LOG"; then
  report_status "failed" "Upload do banco para o Google Drive falhou: $(cat "$ERR_LOG")" "$(basename "$DB_BACKUP_FILE")"
  rm -f "$ERR_LOG"
  exit 1
fi

if ! rclone copy "$IMAGES_BACKUP_FILE" "$DRIVE_REMOTE" 2>"$ERR_LOG"; then
  report_status "failed" "Upload das imagens para o Google Drive falhou: $(cat "$ERR_LOG")" "$(basename "$IMAGES_BACKUP_FILE")"
  rm -f "$ERR_LOG"
  exit 1
fi

# ── 4. Rotaciona — mantém só os $MAX_BACKUPS mais recentes de cada tipo ──────────
rotate_local "smartprice_db_"
rotate_local "smartprice_images_"
rotate_remote "smartprice_db_"
rotate_remote "smartprice_images_"

DB_SIZE_HUMAN=$(du -h "$DB_BACKUP_FILE" | cut -f1)
IMAGES_SIZE_HUMAN=$(du -h "$IMAGES_BACKUP_FILE" | cut -f1)
report_status "success" "Backup concluído (banco ${DB_SIZE_HUMAN} · imagens ${IMAGES_SIZE_HUMAN})" "$(basename "$DB_BACKUP_FILE"), $(basename "$IMAGES_BACKUP_FILE")"
rm -f "$ERR_LOG"
