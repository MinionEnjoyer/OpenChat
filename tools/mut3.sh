#!/bin/bash
# MUT3: extraSpyField in serializeMessage return — additive wire change
set -e
cd /Users/williambsexton/work/OpenChat

echo "=== MUT3: extraSpyField ==="
python3 -c "
p='apps/api/src/messages/messages.service.ts'
with open(p) as f: src=f.read()
# Insert extraSpyField right after id in the serializeMessage return object
src=src.replace(
    'return {\n      id: msg.id,\n      channelId: msg.channelId,',
    'return {\n      id: msg.id,\n      extraSpyField: \"HELLO_WORLD\",\n      channelId: msg.channelId,')
with open(p,'w') as f: f.write(src)
print('Mutation applied')
with open(p) as f:
    for i,line in enumerate(f,1):
        if 'HELLO_WORLD' in line: print(f'  verified: line {i}: {line.strip()}')
"

docker compose -f docker-compose.dev.yml build --no-cache api 2>&1 | tail -3
docker compose -f docker-compose.dev.yml up -d api --force-recreate 2>&1 | tail -2
sleep 15

echo "--- Running tests ---"
cd apps/api
npx jest --config jest-char.config.js --forceExit 2>&1 | grep -E '(Test Suites|Tests:|●|extraSpy|HELLO_WORLD|unexpected keys|missing keys)'
cd ../..

echo "--- Reverting ---"
git checkout apps/api/src/messages/messages.service.ts
echo "MUT3 DONE"