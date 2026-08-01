#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = process.cwd();
const patterns = [
  ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/],
  ['github-fine-token', /\bgithub_pat_[A-Za-z0-9_]{30,255}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['stripe-live-secret', /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/],
];
const assignment = /(?:secret|token|password|api[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']([^"']{16,})["']/i;
const envAssignment = /\b(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)=([A-Za-z0-9_./+\-=]{16,})\b/;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g;
const pemPattern = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----\n(?:[A-Za-z0-9+/=]{40,}\n){3,}-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g;
const safeMarkers = /change_me|placeholder|example|dummy|sample|not[-_]?for[-_]?prod|do[-_]?not[-_]?use|test|unused|secretsecret|your[-_]|<|\$\{|process\.env/i;

function entropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / value.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

function safeJwt(value) {
  try {
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
    return payload.iss === 'devkey';
  } catch {
    return false;
  }
}

function safeValue(value) {
  // Explicit inert fixtures used by tests and documentation.
  return safeMarkers.test(value)
    || value === '0123456789abcdef'
    || /^fcm-.*-sdk$/i.test(value)
    || (value.startsWith('eyJ') && safeJwt(value));
}

const history = execFileSync(
  'git',
  ['log', '--all', '--full-history', '--no-renames', '--no-ext-diff', '--unified=0', '--format=commit %H', '-p'],
  { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);

const findings = new Map();
let commit = '';
let file = '';
let lineNumber = 0;
let commits = 0;

function record(kind, value, location = {}) {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 12);
  const findingFile = location.file ?? file;
  const key = `${kind}:${digest}:${findingFile}`;
  if (!findings.has(key)) {
    findings.set(key, {
      kind,
      digest,
      file: findingFile,
      commit: (location.commit ?? commit).slice(0, 12),
      lineNumber: location.lineNumber ?? lineNumber,
    });
  }
}

for (const line of history.split('\n')) {
  if (line.startsWith('commit ')) {
    commit = line.slice(7);
    commits += 1;
    continue;
  }
  if (line.startsWith('+++ b/')) {
    file = line.slice(6);
    continue;
  }
  if (line.startsWith('@@ ')) {
    const match = line.match(/\+(\d+)/);
    lineNumber = match ? Number(match[1]) : 0;
    continue;
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;

  const content = line.slice(1);
  for (const [kind, pattern] of patterns) {
    const match = content.match(pattern);
    if (match) record(kind, match[0]);
  }
  const generic = content.match(assignment);
  if (generic && !safeValue(generic[1]) && entropy(generic[1]) >= 3.8) {
    record('credential-assignment', generic[1]);
  }
  const envGeneric = content.match(envAssignment);
  if (envGeneric && !safeValue(envGeneric[1]) && entropy(envGeneric[1]) >= 3.8) {
    record('credential-assignment', envGeneric[1]);
  }
  for (const jwt of content.matchAll(jwtPattern)) {
    if (!safeJwt(jwt[0])) record('jwt', jwt[0]);
  }
  lineNumber += 1;
}

const addedText = history
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n');
for (const pem of addedText.matchAll(pemPattern)) {
  record('private-key', pem[0], { file: '(history)', commit: '', lineNumber: 0 });
}

const sensitivePaths = execFileSync(
  'git',
  ['log', '--all', '--name-only', '--pretty=format:', '--'],
  { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
).split('\n').filter((name) => {
  if (!name || /\.example$/.test(name)) return false;
  return /(^|\/)(\.env(?:\.[^/]+)?|livekit\.yaml|google-services\.json|GoogleService-Info\.plist|[^/]+\.(?:pem|key|p12)|id_rsa)$/.test(name);
});
const uniqueSensitivePaths = [...new Set(sensitivePaths)];

if (uniqueSensitivePaths.length) {
  console.error(`sensitive paths appeared in history: ${uniqueSensitivePaths.join(', ')}`);
}
if (findings.size) {
  console.error(`credential candidates=${findings.size}`);
  for (const finding of findings.values()) {
    console.error(`${finding.kind} digest=${finding.digest} commit=${finding.commit || '-'} path=${finding.file} line=${finding.lineNumber}`);
  }
}

console.log(`history scan commits=${commits} candidates=${findings.size} sensitive_paths=${uniqueSensitivePaths.length}`);
if (findings.size || uniqueSensitivePaths.length) process.exit(1);
