#!/bin/sh
# Roda dentro do container "backup": dump do banco em intervalos fixos.
set -eu

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups

echo "Backups a cada ${INTERVAL}s, guardando ${KEEP_DAYS} dias em /backups"

while true; do
  file="/backups/stock-$(date -u +%Y%m%d-%H%M%S).dump"

  # Grava num arquivo temporário e só renomeia no fim: um backup pela metade
  # nunca fica parecendo um backup válido.
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    mv "$file.partial" "$file"
    echo "$(date -u +%FT%TZ) backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "$(date -u +%FT%TZ) BACKUP FALHOU" >&2
  fi

  find /backups -name 'stock-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep "$INTERVAL"
done
