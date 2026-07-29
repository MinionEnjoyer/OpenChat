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
import { join, extname, dirname, relative, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Evidence-type hierarchy ────────────────────────────────────────────
// Stronger evidence may satisfy a weaker criterion (E2E closes a Unit:
// requirement), never the reverse.  Numeric levels encode this ordering.
const EVIDENCE_LEVEL = { e2e: 3, integration: 2, unit: 1 };

/**
 * Classify an acceptance-criterion string into an evidence kind.
 * Returns one of 'e2e' | 'integration' | 'unit' | 'manual' | 'ci' | 'lint',
 * or null when no explicit type can be determined.
 *
 * Handles two forms:
 *   1. Explicit prefix — "E2E: …", "Integration: …", "Unit: …", "Manual: …",
 *      "Maestro …", "CI gate", "Lint rule"
 *   2. Multi-type / keyword — "Unit: …; E2E …" → returns the *highest* level
 *      mentioned (E2E > Integration > Unit).
 */
function classifyAcceptanceType(text) {
  const t = text.toLowerCase().trim();
  if (!t) return null;

  // ── explicit prefix at start of text ──
  if (/^e2e\b/.test(t)) return 'e2e';
  if (/^maestro\b/.test(t)) return 'e2e';
  if (/^integration\b/.test(t)) return 'integration';
  if (/^unit\b/.test(t)) return 'unit';
  if (/^manual\b/.test(t)) return 'manual';
  if (/^ci gate/i.test(t)) return 'ci';
  if (/^lint rule/i.test(t)) return 'lint';

  // ── multi-type / keyword fallback — pick the highest level mentioned ──
  let highest = null;
  let highestLevel = 0;

  const bump = (kind, regex) => {
    if (regex.test(t) && (EVIDENCE_LEVEL[kind] || 0) > highestLevel) {
      highest = kind;
      highestLevel = EVIDENCE_LEVEL[kind] || 0;
    }
  };

  bump('e2e', /\be2e\b/);
  bump('e2e', /\bmaestro\b/);
  bump('integration', /\bintegration\b/);
  bump('integration', /\bcontract test/);
  bump('unit', /\bunit\b/);
  bump('unit', /\bproperty test/);
  bump('unit', /\bsnapshot/);
  bump('unit', /\bgolden-table/);

  if (highest) return highest;

  if (/\bmanual\b/.test(t)) return 'manual';
  if (/\bci gate\b/i.test(t)) return 'ci';
  if (/\blint rule\b/i.test(t)) return 'lint';

  return null;
}

/**
 * Classify a file path by the kind of test it contains.
 *   apps/mobile/e2e/** / *.yaml                → e2e (Maestro flows)
 *   apps/api/test/integration/** / *.spec.ts   → integration
 *   *.integration.test.ts / *.integration.spec.ts → integration
 *   *.test.ts / *.spec.ts                      → unit
 *   anything else                              → null (not a test file)
 */
/**
 * A Maestro flow counts as e2e evidence only if it has actually been executed
 * and passed. Receipts live at artifacts/e2e/receipts/<flow>.json and follow the
 * shape of artifacts/e2e/last-run.json: {flow, device, result, timestamp, ...}.
 *
 * Without this, evidence level was decided purely by file path, so a requirement
 * demanding e2e proof could be satisfied by CREATING A YAML FILE THAT HAS NEVER
 * RUN. Three agents independently discovered that route on 2026-07-28 and each
 * closed its assigned violation by writing an unexecuted flow — all three
 * honestly reported the flow as unexecuted, and the gate would have gone green
 * anyway. A gate that a file creation can satisfy is not measuring evidence, it
 * is measuring filenames.
 */
function hasPassingReceipt(relPath) {
  const flow = basename(relPath).replace(/\.ya?ml$/, '');
  const receipt = join(ROOT, 'artifacts', 'e2e', 'receipts', `${flow}.json`);
  try {
    const data = JSON.parse(readFileSync(receipt, 'utf8'));
    if (String(data.result || '').toLowerCase() !== 'pass') return false;
    // The receipt must name the flow it claims to prove, so a passing receipt
    // cannot be copied to cover a different flow.
    return data.flow === flow;
  } catch {
    return false;
  }
}

function classifyFileEvidenceType(relPath) {
  if (relPath.startsWith('apps/mobile/e2e/flows/')) {
    // Unexecuted flows are not evidence of anything. Returning null rather than a
    // weaker level is deliberate: a flow that never ran does not demonstrate unit
    // or integration behaviour either.
    return hasPassingReceipt(relPath) ? 'e2e' : null;
  }
  if (relPath.startsWith('apps/mobile/e2e/')) return 'e2e';
  if (relPath.startsWith('apps/api/test/integration/')) return 'integration';
  if (/\.integration\.(test|spec)\.[jt]sx?$/.test(relPath)) return 'integration';
  if (/\.(test|spec)\.[jt]sx?$/.test(relPath)) return 'unit';
  return null;
}

/**
 * Split a markdown table row by '|', respecting backtick-quoted spans
 * (backtick-quoted '|' is not a column separator).
 */
function splitTableRow(line) {
  const cells = [];
  let current = '';
  let inBacktick = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '`') inBacktick = !inBacktick;
    if (ch === '|' && !inBacktick) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parse the acceptance-criterion TYPE for every FR from the canonical table.
 * Returns Map<FR-ID, { kind, level }>.  Entries with kind='manual' have level 0.
 */
function parseAcceptanceTypes() {
  const text = readFileSync(REQ_PATH, 'utf8');
  const frTypes = new Map();

  for (const line of text.split('\n')) {
    // Only process FR table rows (skip header/separator/NFR rows)
    if (!/^\|\s*FR-[A-Z]+-\d{3}\b/.test(line)) continue;

    const cells = splitTableRow(line);
    // cells: ['', FR-ID, Requirement, Acceptance, Pri, Ph, '']
    if (cells.length < 5) continue;

    const id = cells[1];
    const acceptance = cells[3]; // 0-indexed: [1]=ID, [2]=Requirement, [3]=Acceptance
    const kind = classifyAcceptanceType(acceptance);

    if (kind === 'manual') {
      frTypes.set(id, { kind, level: 0 }); // manual is tracked but never fails
    } else if (kind && EVIDENCE_LEVEL[kind]) {
      frTypes.set(id, { kind, level: EVIDENCE_LEVEL[kind] });
    }
    // null kind → not stored (no enforcement possible)
  }

  return frTypes;
}

// ── Infra-path exclusion rules ─────────────────────────────────────────
// Files under these paths do NOT exercise OpenChat/OpenShare product code.
// An @satisfies annotation in any of these paths is an error (trace gate
// would claim a requirement is met by a test that never touches the product).
const INFRA_PATHS = [
  'tools/',        // tooling, seed scripts, devctl, trace itself
  'scripts/',      // deployment helper scripts
  'specs/',        // spec documents (may narrate about @satisfies but never define it)
  '.husky/',       // git hooks
  '.github/',      // CI workflows
  'docs/',         // documentation
];

// E2E flows that target non-OpenChat packages (e.g., com.android.settings)
// are infrastructure, not product tests. We detect them by looking for
// appId values that aren't OpenChat package IDs.
const NON_PRODUCT_APP_IDS = [
  'com.android.settings',  // stock Android Settings, used for rig smoke
];

function isInfraPath(relPath) {
  for (const prefix of INFRA_PATHS) {
    if (relPath.startsWith(prefix)) return true;
  }
  return false;
}

function isNonProductFlow(relPath, content) {
  if (!relPath.startsWith('apps/mobile/e2e/flows/')) return false;
  for (const appId of NON_PRODUCT_APP_IDS) {
    if (content.includes(`appId: ${appId}`)) return true;
  }
  return false;
}

// ── Canonical FR/NFR extraction ──────────────────────────────────────
// FR table: | ID | Requirement | Acceptance criterion | Pri | Ph |
//   (6 columns including the leading |, so 5 cells)
// NFR table: | ID | Requirement | Acceptance criterion |
//   (3 columns, no phase — NFRs are cross-cutting, phase N/A)

const REQ_PATH = join(ROOT, 'specs', '01-REQUIREMENTS.md');
const EXPECTED_COUNT_PATH = join(ROOT, 'artifacts', 'trace', 'expected-count.json');

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

/**
 * Assert parsed counts match committed expected-count.json.
 * Any change in FR/NFR count that is not accompanied by an explicit update
 * to expected-count.json is an error — the intentional-change ritual.
 * Returns an array of error strings (empty if counts match).
 */
function assertExpectedCount(frIds, nfrIds) {
  const errors = [];
  if (!existsSync(EXPECTED_COUNT_PATH)) {
    errors.push(
      `Missing ${EXPECTED_COUNT_PATH} — run trace.mjs to auto-create it from the current parse, then commit it as the intentional-count baseline.`
    );
    // Auto-create for convenience, but still error — the file must be committed.
    const expected = { fr: frIds.size, nfr: nfrIds.size, total: frIds.size + nfrIds.size,
      canonical_source: 'specs/01-REQUIREMENTS.md',
      extraction_regex: { fr: '^\\\\|\\\\s*(FR-[A-Z]+-\\\\d{3})\\\\b', nfr: '^\\\\|\\\\s*(NFR-\\\\d{2})\\\\b' },
      last_verified: new Date().toISOString().split('T')[0],
      note: 'Changing this file is the intentional-change ritual for adding/removing requirements. trace.mjs asserts parsed counts match these values and FAILS if they drift without an update to this file.' };
    const outDir = dirname(EXPECTED_COUNT_PATH);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    writeFileSync(EXPECTED_COUNT_PATH, JSON.stringify(expected, null, 2) + '\n');
    return errors;
  }
  const expected = JSON.parse(readFileSync(EXPECTED_COUNT_PATH, 'utf8'));
  if (expected.fr !== frIds.size) {
    errors.push(
      `FR count mismatch: parsed ${frIds.size} from ${REQ_PATH}, expected ${expected.fr} per ${EXPECTED_COUNT_PATH}. ` +
      `If requirements were intentionally added or removed, update ${EXPECTED_COUNT_PATH} to match. ` +
      `Otherwise, the requirement table has been corrupted.`
    );
  }
  if (expected.nfr !== nfrIds.size) {
    errors.push(
      `NFR count mismatch: parsed ${nfrIds.size} from ${REQ_PATH}, expected ${expected.nfr} per ${EXPECTED_COUNT_PATH}. ` +
      `If requirements were intentionally added or removed, update ${EXPECTED_COUNT_PATH} to match. ` +
      `Otherwise, the requirement table has been corrupted.`
    );
  }
  return errors;
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

// @satisfies annotations are only meaningful in source and test files.
// Scanning markdown would collect quoted annotations from prose (e.g.,
// DRIFT-LOG.md quoting error messages containing @satisfies), producing
// false positives. Annotations in docs/ is already blocked by INFRA_PATHS,
// but .md files outside docs/ (e.g., README.md in root) would also be
// false positives — so we exclude .md here at the scan level.
function scanAnnotations() {
  const files = findFiles(ROOT, ['.ts', '.tsx', '.mjs', '.js', '.yaml', '.yml']);
  const satisfies = new Map(); // FR-ID -> [{file, line}]
  const characterizes = new Map(); // label -> [{file, line}]
  const infraErrors = []; // @satisfies in non-product paths

  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    // Check for @satisfies in infra paths before collecting
    const fileSatisfiesHits = [];
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      let m;
      SATISFIES_RE.lastIndex = 0;
      while ((m = SATISFIES_RE.exec(line)) !== null) {
        fileSatisfiesHits.push({ id: m[1], line: lineNum });
      }
    }

    // Enforce: @satisfies in infra path = error
    if (fileSatisfiesHits.length > 0) {
      if (isInfraPath(rel)) {
        for (const hit of fileSatisfiesHits) {
          infraErrors.push(
            `@satisfies ${hit.id} in infra path "${rel}" (line ${hit.line}) — this file does not exercise product code. Use @infra for infrastructure tests.`
          );
        }
        continue; // don't collect infra-path annotations
      }
      if (isNonProductFlow(rel, text)) {
        for (const hit of fileSatisfiesHits) {
          infraErrors.push(
            `@satisfies ${hit.id} in non-product e2e flow "${rel}" (line ${hit.line}) — targets a package that is not OpenChat. Use @infra for rig-validation flows.`
          );
        }
        continue; // don't collect non-product flow annotations
      }
    }

    // Reset for collection pass
    lineNum = 0;
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

  return { satisfies, characterizes, infraErrors };
}

// ── Gate logic ───────────────────────────────────────────────────────

function gate(phaseFilter) {
  const { frIds, nfrIds, frPhases, nfrPhases } = parseRequirements();
  const { satisfies, characterizes, infraErrors } = scanAnnotations();
  const frTypes = parseAcceptanceTypes();

  // Assert parsed counts match committed expected-count.json
  const countErrors = assertExpectedCount(frIds, nfrIds);

  const allReqIds = new Set([...frIds, ...nfrIds]);

  // Check for unknown FR ids referenced in annotations, plus infra-path violations
  const errors = [...countErrors, ...infraErrors];
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

  // ── Evidence-type checking ──────────────────────────────────────────
  const evidenceViolations = []; // { id, required, found, file, line }
  const manualList = [];         // { id, sites }

  for (const [id, sites] of satisfies) {
    // Only check FRs that have a typed acceptance criterion
    const typeInfo = frTypes.get(id);
    if (!typeInfo) continue; // NFR or unspecified criterion → skip

    // Manual criteria are tracked but never fail
    if (typeInfo.kind === 'manual') {
      manualList.push({ id, sites });
      continue;
    }

    // CI/lint gates can't be satisfied by test annotations → skip enforcement
    if (typeInfo.kind === 'ci' || typeInfo.kind === 'lint') continue;

    const requiredLevel = typeInfo.level;

    // Classify each site and find the strongest evidence type
    let bestLevel = 0;
    let bestSite = null;
    for (const s of sites) {
      const evidenceType = classifyFileEvidenceType(s.file);
      const level = EVIDENCE_LEVEL[evidenceType] || 0;
      if (level > bestLevel) {
        bestLevel = level;
        bestSite = { ...s, evidenceType };
      }
    }

    if (bestLevel < requiredLevel) {
      evidenceViolations.push({
        id,
        required: typeInfo.kind,
        found: bestSite?.evidenceType || null,
        file: bestSite?.file || sites[0].file,
        line: bestSite?.line || sites[0].line,
      });
    }
  }

  // Sort violations by FR id for stable output
  evidenceViolations.sort((a, b) => a.id.localeCompare(b.id));

  // Report evidence-type violations as errors
  for (const v of evidenceViolations) {
    // An unexecuted Maestro flow classifies as null, which previously printed the
    // same "not in a test file" as a genuine non-test. They need different fixes:
    // one wants a test written, the other wants the flow actually run.
    const claimedByFlow = (v.file || '').includes('apps/mobile/e2e/flows/');
    const foundLabel = v.found
      ? ` (found ${v.found})`
      : claimedByFlow
        ? ' (flow has no passing receipt in artifacts/e2e/receipts/ — it has never been run)'
        : ' (not in a test file)';
    errors.push(
      `EVIDENCE: ${v.id} requires ${v.required} evidence${foundLabel} — ` +
      `claimed by ${v.file}:${v.line}`
    );
  }

  if (manualList.length > 0) {
    const ids = manualList.map(m => m.id).sort().join(', ');
    console.error(`MANUAL: ${manualList.length} requirement(s) require manual validation (not gate-enforced): ${ids}`);
  }

  return { errors, missing, satisfies, characterizes, frIds, nfrIds, frPhases, nfrPhases, inScope, evidenceViolations, manualList };
}

// ── Matrix emission ──────────────────────────────────────────────────

function emitMatrix(gateResult) {
  const { satisfies, characterizes, frIds, nfrIds, missing, errors, evidenceViolations, manualList } = gateResult;
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
      evidence_violations: evidenceViolations ? evidenceViolations.length : 0,
      manual: manualList ? manualList.length : 0,
    },
    errors,
    evidence_violations: evidenceViolations || [],
    manual: (manualList || []).map(m => ({ id: m.id, sites: m.sites.map(s => `${s.file}:${s.line}`) })),
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