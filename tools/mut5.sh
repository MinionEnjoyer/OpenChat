#!/bin/bash
# MUT5: BigInt permissions .toString() → Number() in PERMISSION_LIST catalog
# This changes the /servers/permissions endpoint 'bit' field from string to number
set -e
cd /Users/williambsexton/work/OpenChat

echo "=== MUT5: BigInt→Number in PERMISSION_LIST ==="
# Replace each .toString() call on Permission constants with Number() wrapper
sed -i '' 's/Permission\.\([A-Z_]*\)\.toString()/Number(Permission.\1)/g' apps/api/src/permissions/permissions.ts
grep -n 'Number(' apps/api/src/permissions/permissions.ts | head -5

docker compose -f docker-compose.dev.yml build --no-cache api 2>&1 | tail -3
docker compose -f docker-compose.dev.yml up -d api --force-recreate 2>&1 | tail -2
sleep 15

echo "--- Running tests ---"
cd apps/api
npx jest --config jest-char.config.js --forceExit 2>&1 | grep -E '(Test Suites|Tests:|●|BigInt|bit.*string|bit.*number|typeof|permissions)'
cd ../..

echo "--- Reverting ---"
git checkout apps/api/src/permissions/permissions.ts
echo "MUT5 DONE"