#!/usr/bin/env python3
"""MUT1: Add @HttpCode(200) to dev-login endpoint"""
p = 'apps/api/src/auth/auth.controller.ts'
with open(p) as f:
    src = f.read()

# Add HttpCode to import list (after UseGuards, before NotFoundException)
src = src.replace(
    'UseGuards, NotFoundException,',
    'UseGuards, HttpCode, NotFoundException,')

# Add @HttpCode(200) before @Post('dev-login')
src = src.replace(
    "@Post('dev-login')",
    "@HttpCode(200)\n  @Post('dev-login')")

with open(p, 'w') as f:
    f.write(src)
print('MUT1 applied successfully')