#!/bin/sh

echo "[backend] Entrypoint started (AUTORUN_MIGRATIONS=${AUTORUN_MIGRATIONS:-})"

AUTORUN="${AUTORUN_MIGRATIONS:-false}"
if [ "$AUTORUN" = "true" ]; then
  if command -v npx >/dev/null 2>&1; then
    echo "[backend] Running Prisma migrations..."
    if npx prisma migrate deploy; then
      echo "[backend] Migrations OK"
    else
      echo "[backend] MIGRATIONS FAILED" >&2
      exit 1
    fi
  else
    echo "[backend] npx not found" >&2
    exit 1
  fi
else
  echo "[backend] Auto migrations disabled"
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[backend] Running DB seed..."
  npm run db:seed || echo "[backend] Seed failed (continuing)"
fi

echo "[backend] Starting application"
exec node dist/src/main.js
