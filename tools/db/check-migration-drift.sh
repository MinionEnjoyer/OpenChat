#!/usr/bin/env bash
# check-migration-drift.sh — Fail if Prisma migrations don't match schema.prisma
# Usage: bash tools/db/check-migration-drift.sh
# Requires: DATABASE_URL (or SHADOW_DATABASE_URL) pointing at a PostgreSQL server
#           where we can CREATE/DROP a temporary shadow database.
# Returns: 0 if no drift, nonzero if drift detected or setup failed.
#
# This catches `prisma db push` drift: when someone pushes schema changes
# without recording a migration, the diff is non-empty and this gate fails.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_DIR="$ROOT/apps/api"
MIGRATIONS_DIR="$API_DIR/prisma/migrations"
SCHEMA_FILE="$API_DIR/prisma/schema.prisma"

# Use a dedicated shadow DB URL so we never touch the dev database.
# In CI, supply SHADOW_DATABASE_URL. Locally, derive from DATABASE_URL.
if [ -n "${SHADOW_DATABASE_URL:-}" ]; then
  SHADOW_URL="$SHADOW_DATABASE_URL"
elif [ -n "${DATABASE_URL:-}" ]; then
  # Derive a shadow DB name: <dbname>_drift_check
  SHADOW_URL="${DATABASE_URL}_drift_check"
else
  echo "ERROR: Set DATABASE_URL or SHADOW_DATABASE_URL"
  exit 2
fi

echo "=== Migration drift check ==="
echo "  Migrations: $MIGRATIONS_DIR"
echo "  Schema:     $SCHEMA_FILE"

# We need a "postgres" DB URL for CREATE/DROP DATABASE.
# Derive it from SHADOW_URL by replacing the db name with 'postgres'.
POSTGRES_URL="$(echo "$SHADOW_URL" | sed 's|/[^/]*$|/postgres|')"

cleanup() {
  echo "  Cleaning up shadow database..."
  cd "$API_DIR"
  DATABASE_URL="$POSTGRES_URL" npx prisma db execute --stdin --schema="$SCHEMA_FILE" \
    <<<"DROP DATABASE IF EXISTS \"$(echo "$SHADOW_URL" | sed 's|.*/||')\";" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Create the shadow database
echo "  Creating shadow database..."
cd "$API_DIR"
DATABASE_URL="$POSTGRES_URL" npx prisma db execute --stdin --schema="$SCHEMA_FILE" \
  <<<"CREATE DATABASE \"$(echo "$SHADOW_URL" | sed 's|.*/||')\";" 2>/dev/null

echo "  Running prisma migrate diff..."
DIFF_OUTPUT=$(npx prisma migrate diff \
  --from-migrations "$MIGRATIONS_DIR" \
  --to-schema-datamodel "$SCHEMA_FILE" \
  --shadow-database-url "$SHADOW_URL" 2>&1)
DIFF_RC=$?

echo "$DIFF_OUTPUT"

if [ "$DIFF_RC" -ne 0 ]; then
  echo ""
  echo "=== FAIL: prisma migrate diff exited $DIFF_RC ==="
  exit 1
fi

if echo "$DIFF_OUTPUT" | grep -q "No difference detected"; then
  echo ""
  echo "=== PASS: No migration drift detected ==="
  exit 0
else
  echo ""
  echo "=== FAIL: Migration drift detected! ==="
  echo "  Schema has changes not recorded in any migration."
  echo "  Run: npx prisma migrate dev --create-only --name <description>"
  echo "  Do NOT use 'prisma db push' — it skips migration generation."
  exit 1
fi
