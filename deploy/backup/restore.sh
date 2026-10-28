#!/bin/sh
# SUBSTITUI o banco de produção pelo conteúdo de um backup. Use só em caso de
# desastre, com a API parada:
#   docker compose -f docker-compose.prod.yml --env-file .env.production stop api web
#   docker compose -f docker-compose.prod.yml --env-file .env.production \
#     exec backup sh /scripts/restore.sh /backups/stock-AAAAMMDD-HHMMSS.dump SIM
#   docker compose -f docker-compose.prod.yml --env-file .env.production start api web
set -eu

file="${1:-}"
confirm="${2:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "Uso: restore.sh /backups/stock-....dump SIM" >&2
  exit 1
fi
if [ "$confirm" != "SIM" ]; then
  echo "Isto apaga os dados atuais de $PGDATABASE e restaura $file." >&2
  echo "Para confirmar, rode de novo com SIM como segundo argumento." >&2
  exit 1
fi

echo "Restaurando $file em $PGDATABASE..."
pg_restore --clean --if-exists --no-owner --single-transaction \
  --dbname="$PGDATABASE" "$file"
echo "Restauração concluída."
