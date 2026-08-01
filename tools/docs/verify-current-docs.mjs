#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const requireText = (file, pattern, description) => {
  const body = read(file);
  if (!pattern.test(body)) throw new Error(`${file}: missing ${description}`);
};

const maintainedDocs = [
  'README.md',
  'docs/README.md',
  'docs/SETUP.md',
  'docs/DEPLOY.md',
  'docs/ARCHITECTURE.md',
  'docs/PROJECT-STATUS.md',
  'docs/AUTH-PRODUCTION-READINESS.md',
  'docs/PRODUCTION-PUSH-ENABLEMENT.md',
  'docs/ANDROID-INSTALL.md',
  'docs/TESTFLIGHT-INSTALL.md',
  'apps/desktop/README.md',
  'tools/devctl-README.md',
  'tools/probe/README.md',
];

const webPackage = JSON.parse(read('apps/web/package.json'));
const desktopPackage = JSON.parse(read('apps/desktop/package.json'));
if (webPackage.version !== desktopPackage.version) {
  throw new Error(`web/desktop version drift: ${webPackage.version} != ${desktopPackage.version}`);
}

const version = webPackage.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
requireText('README.md', new RegExp(`desktop/web UI \\*\\*${version}\\*\\*`), 'current release version');
requireText('apps/desktop/README.md', new RegExp(`desktop-v${version}`), 'current desktop tag');
requireText('docs/ARCHITECTURE.md', /NestJS 11/, 'NestJS major version');
requireText('docs/SETUP.md', /localhost:3000/, 'current Vite development port');
requireText('docs/ARCHITECTURE.md', /limits are opt-in/, 'operator-controlled upload limits');
requireText('docs/ARCHITECTURE.md', /\/api\/assets/, 'OpenShare asset contract');
requireText('docs/ARCHITECTURE.md', /\/api\/media\/<id>\/raw/, 'authenticated media proxy');
requireText('docs/AUTH-PRODUCTION-READINESS.md', /Production mobile[\s\S]{0,24}code uses `expo-web-browser`/, 'mobile PKCE client');
requireText('tools/probe/README.md', /TCP 7880[\s\S]*7881[\s\S]*UDP media port 50000/, 'LiveKit production ports');

requireText('apps/api/package.json', /"@nestjs\/core": "\^11\./, 'NestJS 11 dependency');
requireText('apps/web/vite.config.ts', /port: 3000/, 'Vite port source');
requireText('apps/api/src/config/configuration.ts', /UPLOAD_MAX_FILES:[^\n]+optional\(\)/, 'optional upload-count limit');
requireText('apps/api/src/config/configuration.ts', /UPLOAD_MAX_FILE_BYTES:[^\n]+optional\(\)/, 'optional upload-size limit');
requireText('apps/api/src/share/share.service.ts', /\/api\/assets/, 'OpenShare upload implementation');
requireText('apps/api/src/share/share.service.ts', /\/api\/media\/\$\{asset\.id\}\/raw/, 'media proxy response path');
requireText('apps/api/src/uploads/uploads.controller.ts', /@Post\('waveform'\)/, 'waveform broker route');
requireText('livekit.yaml.tmpl', /udp_port: 50000/, 'LiveKit UDP port');
requireText('livekit.yaml.tmpl', /tcp_port: 7881/, 'LiveKit TCP fallback port');

const staleClaims = [
  /NestJS 10/,
  /localhost:5173/,
  /browser fetches media[^\n]*direct/i,
  /desktop-v0\.8\.2/,
  /not yet implemented in the shipped mobile code/i,
];

let localLinks = 0;
for (const file of maintainedDocs) {
  const body = read(file);
  for (const stale of staleClaims) {
    if (stale.test(body)) throw new Error(`${file}: stale claim matched ${stale}`);
  }
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target) || target.includes('<')) continue;
    localLinks += 1;
    const resolved = resolve(root, dirname(file), target);
    if (!existsSync(resolved)) throw new Error(`${file}: missing local link ${target}`);
  }
}

console.log(`current docs verified: version=${webPackage.version} files=${maintainedDocs.length} local_links=${localLinks}`);
