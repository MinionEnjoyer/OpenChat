#!/usr/bin/env node
/**
 * NFR harness runner (P0-16) — executes nfr-*.sh, aggregates JSON, archives, gates.
 * Usage: node tools/nfr/nfr-runner.mjs [--json] [--only NFR-08]
 *
 * Each script emits one JSON object (see tools/nfr/lib.sh for the protocol):
 *   armed   — measured; `pass` decides the gate
 *   blocked — not measurable yet, and .phase has not reached arm_at_phase
 *   overdue — .phase reached arm_at_phase with no (or partial) measurement
 *   error   — the script itself failed; never silently downgraded to blocked
 *
 * Exit non-zero on any armed failure, any overdue entry, or any script error.
 * A blocked entry cannot keep the harness green forever: it becomes overdue on
 * its own the moment the project advances past the phase it named.
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const NFR_DIR = join(ROOT, 'tools', 'nfr');
const OUT_DIR = join(ROOT, 'artifacts', 'nfr');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const onlyId = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

function currentPhase() {
  const p = join(ROOT, '.phase');
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : '0';
}

function headSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

// Derive the NFR id from the filename (nfr-08-types.sh → NFR-08) so a script
// that dies before emitting anything is still attributable.
function idFromScript(script) {
  const m = script.match(/^nfr-(\d{2})/);
  return m ? `NFR-${m[1]}` : script;
}

function runAll() {
  const scripts = readdirSync(NFR_DIR)
    .filter(f => f.startsWith('nfr-') && f.endsWith('.sh'))
    .sort();

  const results = [];

  for (const script of scripts) {
    const id = idFromScript(script);
    if (onlyId && id !== onlyId && script !== `${onlyId}.sh`) continue;

    let entry;
    try {
      const stdout = execSync(`bash "${join(NFR_DIR, script)}"`, {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 300000,
      }).trim();
      entry = JSON.parse(stdout);
    } catch (e) {
      // A script that crashes or emits unparseable output is an error, not a
      // blocked measurement — recording it as blocked would let a broken gate
      // pass as a legitimate excuse.
      entry = {
        id,
        status: 'error',
        pass: false,
        reason: `script failed: ${(e.message || String(e)).split('\n')[0]}`,
      };
    }
    entry.script = script;
    results.push(entry);
  }

  const failing = results.filter(
    r => r.status === 'overdue' || r.status === 'error' || (r.status === 'armed' && r.pass === false),
  );

  const sha = headSha();
  const report = {
    generated: new Date().toISOString(),
    tool: 'tools/nfr/nfr-runner.mjs',
    sha,
    phase: currentPhase(),
    summary: {
      total: results.length,
      armed: results.filter(r => r.status === 'armed').length,
      baseline: results.filter(r => r.status === 'baseline').length,
      blocked: results.filter(r => r.status === 'blocked').length,
      overdue: results.filter(r => r.status === 'overdue').length,
      error: results.filter(r => r.status === 'error').length,
      pass: results.filter(r => r.pass === true).length,
      fail: failing.length,
    },
    results,
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const serialized = JSON.stringify(report, null, 2) + '\n';
  // 04 §8: results archived per-sha; report.json is the latest-run pointer.
  writeFileSync(join(OUT_DIR, `${sha}.json`), serialized);
  writeFileSync(join(OUT_DIR, 'report.json'), serialized);

  if (wantJson) {
    process.stdout.write(serialized);
  } else {
    const s = report.summary;
    console.log(
      `NFR harness @ phase ${report.phase} (${sha}): ` +
        `${s.armed} armed, ${s.baseline} baseline, ${s.blocked} blocked, ` +
        `${s.overdue} overdue, ${s.error} error`,
    );
    for (const r of results) {
      const mark =
        r.status === 'armed' ? (r.pass ? '✓' : '✗')
        : r.status === 'blocked' ? '—'
        : r.status === 'baseline' ? '·'
        : '✗';
      // An armed entry is described by its value and a baseline by the number it
      // recorded; for overdue/blocked/error the reason is the point.
      const detail =
        r.status === 'armed' ? r.value || ''
        : r.status === 'baseline' ? r.value || r.reason || ''
        : r.reason || '';
      console.log(`  ${mark} ${r.id} [${r.status}] ${detail}`);
    }
    if (failing.length > 0) {
      console.log(`  ✗ NFR harness: ${failing.length} failing — ${failing.map(f => f.id).join(', ')}`);
    } else {
      console.log('  ✓ NFR harness pass');
    }
  }

  process.exit(failing.length > 0 ? 1 : 0);
}

runAll();
