#!/bin/sh
# Prova que o backup mais recente restaura: carrega o dump num banco
# temporário, compara a contagem de linhas com o banco de produção e apaga o
# banco temporário. Não altera o banco de produção.
#   docker compose -f docker-compose.prod.yml --env-file .env.production \
#     exec backup sh /scripts/verify-latest.sh
set -eu

latest="$(ls -1t /backups/stock-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$latest" ]; then
  echo "Nenhum backup encontrado em /backups" >&2
  exit 1
fi

check_db="restore_check_$(date +%s)"
echo "Restaurando $latest em $check_db..."
createdb "$check_db"
trap 'dropdb --if-exists "$check_db"' EXIT

pg_restore --no-owner --dbname="$check_db" "$latest"

status=0
for table in organizations users categories products stock_movements; do
  restored="$(psql -d "$check_db" -Atc "SELECT count(*) FROM $table")"
  live="$(psql -Atc "SELECT count(*) FROM $table")"
  echo "$table: backup=$restored produção=$live"
  # O backup pode ser mais antigo que o banco, mas nunca ter mais linhas.
  if [ "$restored" -gt "$live" ]; then status=1; fi
done

if [ "$status" -eq 0 ]; then
  echo "OK: o backup restaura corretamente."
else
  echo "ATENÇÃO: contagens inconsistentes." >&2
fi
exit "$status"
