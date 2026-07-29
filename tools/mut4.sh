#!/bin/bash
# MUT4: orderBy createdAt desc → asc
set -e
cd /Users/williambsexton/work/OpenChat

echo "=== MUT4: orderBy desc → asc ==="
sed -i '' "s/orderBy: { createdAt: 'desc' }/orderBy: { createdAt: 'asc' }/g" apps/api/src/messages/messages.service.ts
grep -n "orderBy" apps/api/src/messages/messages.service.ts

docker compose -f docker-compose.dev.yml build --no-cache api 2>&1 | tail -3
docker compose -f docker-compose.dev.yml up -d api --force-recreate 2>&1 | tail -2
sleep 15

echo "--- Running tests ---"
cd apps/api
npx jest --config jest-char.config.js --forceExit 2>&1 | grep -E '(Test Suites|Tests:|●|messages.*list|newest|ordering)'
cd ../..

echo "--- Reverting ---"
git checkout apps/api/src/messages/messages.service.ts
echo "MUT4 DONE"