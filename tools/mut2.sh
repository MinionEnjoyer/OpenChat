#!/bin/bash
# MUT2: thumbnailUrl → thumbUrl in serializeMessage
set -e
cd /Users/williambsexton/work/OpenChat

echo "=== MUT2: thumbnailUrl → thumbUrl ==="
sed -i '' 's/thumbnailUrl/thumbUrl/g' apps/api/src/messages/messages.service.ts
grep -c 'thumbUrl' apps/api/src/messages/messages.service.ts

docker compose -f docker-compose.dev.yml build --no-cache api 2>&1 | tail -3
docker compose -f docker-compose.dev.yml up -d api --force-recreate 2>&1 | tail -2
sleep 15

echo "--- Running tests ---"
cd apps/api
npx jest --config jest-char.config.js --forceExit 2>&1 | grep -E '(Test Suites|Tests:|●|Attachment|thumbUrl|thumbnailUrl|unexpected keys|missing keys)'
cd ../..

echo "--- Reverting ---"
git checkout apps/api/src/messages/messages.service.ts
echo "MUT2 DONE"