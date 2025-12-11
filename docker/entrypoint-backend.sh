#!/bin/sh

echo "[backend] Entrypoint started (AUTORUN_MIGRATIONS=${AUTORUN_MIGRATIONS:-})"

baseline_migrations_if_requested() {
  if [ "${PRISMA_BASELINE_ON_P3005:-false}" != "true" ]; then
    return 1
  fi

  echo "[backend] P3005 detected; baselining existing schema (marking migrations as applied)"
  for migration in prisma/migrations/*; do
    [ -d "$migration" ] || continue
    name=$(basename "$migration")
    echo "[backend] Marking migration as applied: $name"
    if ! npx prisma migrate resolve --applied "$name"; then
      echo "[backend] Failed to mark migration $name as applied" >&2
      return 1
    fi
  done
  return 0
}

reset_database_if_requested() {
  if [ "${PRISMA_RESET_ON_P3005:-false}" != "true" ]; then
    return 1
  fi
  echo "[backend] P3005 detected; resetting database (destructive)"
  npx prisma migrate reset --force --skip-seed
}

AUTORUN="${AUTORUN_MIGRATIONS:-false}"
if [ "$AUTORUN" = "true" ]; then
  if command -v npx >/dev/null 2>&1; then
    echo "[backend] Running Prisma migrations..."
    if npx prisma migrate deploy; then
      echo "[backend] Migrations OK"
    else
      echo "[backend] MIGRATIONS FAILED" >&2

      # Handle P3005 (non-empty schema without recorded migrations)
      if baseline_migrations_if_requested; then
        echo "[backend] Retrying migrations after baseline"
        if npx prisma migrate deploy; then
          echo "[backend] Migrations OK after baseline"
        else
          echo "[backend] MIGRATIONS FAILED after baseline" >&2
          exit 1
        fi
      elif reset_database_if_requested; then
        echo "[backend] Retrying migrations after reset"
        if npx prisma migrate deploy; then
          echo "[backend] Migrations OK after reset"
        else
          echo "[backend] MIGRATIONS FAILED after reset" >&2
          exit 1
        fi
      else
        echo "[backend] Set PRISMA_BASELINE_ON_P3005=true to mark existing schema as migrated,"
        echo "[backend] or PRISMA_RESET_ON_P3005=true to wipe and re-run migrations (destructive)." >&2
        exit 1
      fi
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
