#!/usr/bin/env node
/**
 * [P0-11] trace — FR/NFR ↔ test matrix builder
 *
 * Parses all FR-NNN and NFR-NN IDs from specs/01-REQUIREMENTS.md (the canonical
 * extraction regex), scans the repo for @satisfies and @characterizes annotations,
 * emits artifacts/trace/matrix.json, and gates per phase.
 *
 * Usage:
 *   node tools/trace.mjs [check|report]
 *     check   — exit 1 if any FR lacks @satisfies (after excluding phase filters)
 *     report  — print JSON matrix to stdout (default)
 *
 * Unknown FR id referenced by any annotation = error, not warning.
 *
 * Phase filter: --phase X gates FRs assigned to phases 0..X (cumulative).
 * Without --phase, all FRs/NFRs are checked.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Canonical FR/NFR extraction ──────────────────────────────────────
// FR table: | ID | Requirement | Acceptance criterion | Pri | Ph |
//   (6 columns including the leading |, so 5 cells)
// NFR table: | ID | Requirement | Acceptance criterion |
//   (3 columns, no phase — NFRs are cross-cutting, phase N/A)

const REQ_PATH = join(ROOT, 'specs', '01-REQUIREMENTS.md');

function parseRequirements() {
  const text = readFileSync(REQ_PATH, 'utf8');

  // Extract FR IDs from §3 tables: rows matching | FR-XXX-NNN |
  const frRegex = /^\|\s*(FR-[A-Z]+-\d{3})\b/gm;
  const nfrRegex = /^\|\s*(NFR-\d{2})\b/gm;

  const frIds = new Set();
  const nfrIds = new Set();

  // FR phase: skip ID column, Requirement column, Acceptance column, then read Pri|Ph
  // Columns: | FR-ID | Requirement... | Acceptance... | Pri | Ph |
  // Phase may be e.g. "1" or "1/5" (phase/item); extract just the phase digit.
  const frPhaseRe = /^\|\s*(FR-[A-Z]+-\d{3})\b[^|]*\|[^|]*\|[^|]*\|\s*P\d+\s*\|\s*(\d+)/gm;
  // NFRs: no phase column — all NFRs get phase=null (cross-cutting, not tied to a phase)
  const nfrPhaseRe = /^\|\s*(NFR-\d{2})\b/gm;

  let m;
  while ((m = frRegex.exec(text)) !== null) {
    frIds.add(m[1]);
  }
  while ((m = nfrRegex.exec(text)) !== null) {
    nfrIds.add(m[1]);
  }

  // Parse phase assignments for FRs
  const frPhases = new Map();
  while ((m = frPhaseRe.exec(text)) !== null) {
    frPhases.set(m[1], parseInt(m[2], 10));
  }
  // NFRs: all null (cross-cutting)
  const nfrPhases = new Map();
  while ((m = nfrPhaseRe.exec(text)) !== null) {
    nfrPhases.set(m[1], null);
  }

  return { frIds, nfrIds, frPhases, nfrPhases };
}

// ── Annotation scanning ──────────────────────────────────────────────

const SATISFIES_RE = /@satisfies\s+(FR-[A-Z]+-\d{3}|NFR-\d{2})/g;
const CHARACTERIZES_RE = /@characterizes\s+(\S+)/g; // freeform label, not FR-anchored

function findFiles(dir, exts) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    // Skip node_modules, .git, dist, build
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...findFiles(full, exts));
    } else if (e.isFile() && exts.includes(extname(e.name))) {
      results.push(full);
    }
  }
  return results;
}

function scanAnnotations() {
  const files = findFiles(ROOT, ['.ts', '.tsx', '.mjs', '.js', '.md', '.yaml', '.yml']);
  const satisfies = new Map(); // FR-ID -> [{file, line}]
  const characterizes = new Map(); // label -> [{file, line}]

  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      let m;
      SATISFIES_RE.lastIndex = 0;
      while ((m = SATISFIES_RE.exec(line)) !== null) {
        const id = m[1];
        if (!satisfies.has(id)) satisfies.set(id, []);
        satisfies.get(id).push({ file: rel, line: lineNum });
      }
      CHARACTERIZES_RE.lastIndex = 0;
      while ((m = CHARACTERIZES_RE.exec(line)) !== null) {
        const label = m[1];
        if (!characterizes.has(label)) characterizes.set(label, []);
        characterizes.get(label).push({ file: rel, line: lineNum });
      }
    }
  }

  return { satisfies, characterizes };
}

// ── Gate logic ───────────────────────────────────────────────────────

function gate(phaseFilter) {
  const { frIds, nfrIds, frPhases, nfrPhases } = parseRequirements();
  const { satisfies, characterizes } = scanAnnotations();

  const allReqIds = new Set([...frIds, ...nfrIds]);

  // Check for unknown FR ids referenced in annotations
  const errors = [];
  for (const [id] of satisfies) {
    if (!allReqIds.has(id)) {
      errors.push(`Unknown FR id "${id}" referenced in @satisfies at ${satisfies.get(id).map(r => `${r.file}:${r.line}`).join(', ')}`);
    }
  }

  // Determine which reqs are in scope for the phase.
  // --phase N gates phases 0..N (cumulative), not just the exact phase.
  // A completed FR losing its test annotation is a regression caught here.
  let inScope = allReqIds;
  if (phaseFilter !== null) {
    inScope = new Set();
    for (const id of allReqIds) {
      const reqPhase = id.startsWith('FR-') ? frPhases.get(id) : nfrPhases.get(id);
      // null phase = NFR (cross-cutting) or unassigned => not in any numbered phase scope
      if (reqPhase !== null && reqPhase !== undefined && reqPhase <= phaseFilter) {
        inScope.add(id);
      }
    }
  }

  // Find un-annotated reqs
  const missing = [];
  for (const id of inScope) {
    if (!satisfies.has(id) || satisfies.get(id).length === 0) {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    if (phaseFilter !== null) {
      errors.push(`Phase ${phaseFilter}: ${missing.length} requirement(s) lack @satisfies annotation: ${missing.join(', ')}`);
    } else {
      errors.push(`${missing.length} requirement(s) lack @satisfies annotation: ${missing.join(', ')}`);
    }
  }

  return { errors, missing, satisfies, characterizes, frIds, nfrIds, frPhases, nfrPhases, inScope };
}

// ── Matrix emission ──────────────────────────────────────────────────

function emitMatrix(gateResult) {
  const { satisfies, characterizes, frIds, nfrIds, missing, errors } = gateResult;
  const allIds = [...frIds, ...nfrIds].sort();

  const rows = allIds.map(id => ({
    id,
    satisfied: Boolean(satisfies.has(id) && satisfies.get(id).length > 0),
    locations: satisfies.has(id) ? satisfies.get(id) : [],
    missing: missing.includes(id),
  }));

  const matrix = {
    generated: new Date().toISOString(),
    tool: 'tools/trace.mjs',
    summary: {
      total: allIds.length,
      satisfied: rows.filter(r => r.satisfied).length,
      missing: rows.filter(r => r.missing).length,
      errors: errors.length,
    },
    errors,
    rows,
    characterizes: Object.fromEntries([...characterizes.entries()].map(([k, v]) => [k, v])),
  };

  const outDir = join(ROOT, 'artifacts', 'trace');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');

  return matrix;
}

// ── Main ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let cmd = 'report';
  let phaseFilter = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'check') cmd = 'check';
    else if (args[i] === 'report') cmd = 'report';
    else if (args[i] === '--phase' && i + 1 < args.length) {
      phaseFilter = parseInt(args[++i], 10);
    }
  }

  return { cmd, phaseFilter };
}

const { cmd, phaseFilter } = parseArgs();
const gateResult = gate(phaseFilter);
const matrix = emitMatrix(gateResult);

if (cmd === 'check') {
  if (matrix.errors.length > 0) {
    for (const err of matrix.errors) {
      console.error(`ERROR: ${err}`);
    }
    process.exit(1);
  }
  if (matrix.summary.missing > 0) {
    const scope = phaseFilter !== null ? ` (phase ${phaseFilter})` : '';
    console.error(`FAIL: ${matrix.summary.missing}/${matrix.summary.total} requirement(s) lack @satisfies annotation${scope}`);
    process.exit(1);
  }
  console.log(`OK: ${matrix.summary.satisfied}/${matrix.summary.total} requirements traced`);
  process.exit(0);
} else {
  process.stdout.write(JSON.stringify(matrix, null, 2) + '\n');
}