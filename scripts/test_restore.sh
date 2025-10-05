#!/usr/bin/env bash
# Test de restauration SANS impacter la prod.
# Usage: ./scripts/test_restore.sh /opt/stratum_backups/stratum_2025-10-05_01-00.dump
set -euo pipefail
DUMP_FILE=${1:-}
if [ -z "$DUMP_FILE" ]; then
  echo "Usage: $0 <dump_file>" >&2
  exit 1
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "Fichier dump introuvable: $DUMP_FILE" >&2
  exit 1
fi

VOL=test_restore_pg_$(date +%s)
CTR=pg-restore-check
DB=stratum_restore

echo "[INFO] Création volume temporaire: $VOL"
docker volume create $VOL >/dev/null

echo "[INFO] Lancement container Postgres de test"
docker run -d --rm --name $CTR -e POSTGRES_PASSWORD=tmp -e POSTGRES_DB=$DB -v $VOL:/var/lib/postgresql/data postgres:16-alpine >/dev/null

# Attendre readiness
for i in {1..20}; do
  if docker exec $CTR pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [ $i -eq 20 ]; then
    echo "[ERREUR] Postgres test ne démarre pas" >&2
    docker rm -f $CTR >/dev/null || true
    docker volume rm $VOL >/dev/null || true
    exit 1
  fi
done

echo "[INFO] Restauration du dump dans $DB"
set +e
cat "$DUMP_FILE" | docker exec -i $CTR pg_restore -U postgres -d $DB -c
RC=$?
set -e
if [ $RC -ne 0 ]; then
  echo "[ERREUR] Restauration échouée (code $RC)" >&2
  docker rm -f $CTR >/dev/null || true
  docker volume rm $VOL >/dev/null || true
  exit 2
fi

# Vérifications minimales
COUNT=$(docker exec $CTR psql -U postgres -d $DB -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d '[:space:]')
if [ -z "$COUNT" ] || [ "$COUNT" -lt 10 ]; then
  echo "[ALERTE] Nombre de tables inattendu: $COUNT" >&2
else
  echo "[OK] Nombre de tables: $COUNT"
fi

MIG_LAST=$(docker exec $CTR psql -U postgres -d $DB -t -c "SELECT max(id) FROM _prisma_migrations;" | tr -d '[:space:]') || true
if [ -n "$MIG_LAST" ]; then
  echo "[OK] Dernière migration id: $MIG_LAST"
else
  echo "[WARN] Table _prisma_migrations absente ?"
fi

echo "[INFO] Nettoyage"
docker rm -f $CTR >/dev/null
# Volume gardé pour inspection manuelle -> décommenter si suppression voulue
# docker volume rm $VOL >/dev/null

echo "[SUCCESS] Test de restauration terminé sans erreur critique"
