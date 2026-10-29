#!/bin/sh
# Roda dentro do container "offsite": copia os dumps de /backups para um
# bucket fora do servidor (Cloudflare R2, Backblaze B2 ou outro S3), para que
# um backup não suma junto com o servidor. Só envia arquivos novos (das
# últimas 48 h) e nunca apaga nada no bucket: a retenção lá é uma regra de
# ciclo de vida do próprio bucket (ver DEPLOY.md).
set -eu

: "${OFFSITE_BUCKET:?defina OFFSITE_BUCKET no .env.neon}"
: "${RCLONE_CONFIG_OFFSITE_ENDPOINT:?defina OFFSITE_ENDPOINT no .env.neon}"
: "${RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID:?defina OFFSITE_ACCESS_KEY_ID no .env.neon}"
: "${RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY:?defina OFFSITE_SECRET_ACCESS_KEY no .env.neon}"

INTERVAL="${OFFSITE_INTERVAL_SECONDS:-21600}"
echo "Cópia externa a cada ${INTERVAL}s para o bucket ${OFFSITE_BUCKET}"

while true; do
  # Só arquivos completos: o backup grava em .partial e renomeia no fim.
  if rclone copy /backups "offsite:${OFFSITE_BUCKET}" \
    --include 'stock-*.dump' --max-age 48h; then
    echo "$(date -u +%FT%TZ) cópia externa ok"
  else
    echo "$(date -u +%FT%TZ) CÓPIA EXTERNA FALHOU" >&2
  fi
  sleep "$INTERVAL"
done
