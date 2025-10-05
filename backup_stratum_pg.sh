#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F_%H-%M)
BACKUP_DIR=${BACKUP_DIR:-/opt/stratum_backups}
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/stratum_${STAMP}.dump"

# Vérifie container postgres
if ! docker compose ps postgres >/dev/null 2>&1; then
  echo "[ERREUR] Le service postgres ne semble pas actif dans docker compose." >&2
  exit 1
fi

echo "[INFO] Sauvegarde vers $OUT"
docker compose exec -T postgres pg_dump -U stratum -d stratum_db -Fc > "$OUT"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[INFO] Dump terminé ($SIZE)"

# Rétention 14 jours
find "$BACKUP_DIR" -type f -name 'stratum_*.dump' -mtime +14 -print -delete | sed 's/^/[INFO] Suppression ancienne sauvegarde /'

echo "[OK] Sauvegarde terminée"
