#!/bin/bash
# MUT1: @HttpCode(200) on dev-login endpoint
set -e
cd /Users/williambsexton/work/OpenChat

echo "=== MUT1: @HttpCode(200) on dev-login ==="
python3 -c "
p='apps/api/src/auth/auth.controller.ts'
with open(p) as f: src=f.read()
# Add @HttpCode(200) and @nestjs/common HttpCode import
src = src.replace(
    \"import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';\",
    \"import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards, HttpCode } from '@nestjs/common';\")
src = src.replace(
    \"@Post('dev-login')\",
    \"@HttpCode(200)\n  @Post('dev-login')\")
with open(p,'w') as f: f.write(src)
print('Mutation applied')
"

docker compose -f docker-compose.dev.yml build --no-cache api 2>&1 | tail -3
docker compose -f docker-compose.dev.yml up -d api --force-recreate 2>&1 | tail -2
sleep 15

echo "--- Running tests ---"
cd apps/api
npx jest --config jest-char.config.js --forceExit 2>&1 | grep -E '(Test Suites|Tests:|●|Expected.*Received|auth.*dev-login)'
cd ../..

echo "--- Reverting ---"
git checkout apps/api/src/auth/auth.controller.ts
echo "MUT1 DONE"