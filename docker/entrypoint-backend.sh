#!/usr/bin/env sh
set -e

echo "[backend] Entrypoint démarré (AUTORUN_MIGRATIONS=${AUTORUN_MIGRATIONS})"

if [ "${AUTORUN_MIGRATIONS}" = "true" ]; then
  if command -v npx >/dev/null 2>&1; then
    echo "[backend] Exécution des migrations Prisma..."
    npx prisma migrate deploy || { echo "[backend] ECHEC migrations" >&2; exit 1; }
  else
    echo "[backend] npx introuvable" >&2
    exit 1
  fi
else
  echo "[backend] Migrations automatiques désactivées"
fi

# Option: seed si variable SEED_ON_START=true
if [ "${SEED_ON_START}" = "true" ]; then
  echo "[backend] Seed initial..."
  npm run db:seed || echo "[backend] Seed a échoué (continuation)"
fi

echo "[backend] Lancement de l'application"
exec node dist/main.js
