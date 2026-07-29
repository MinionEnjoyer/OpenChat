# Phase 0 Signoff — Discovery, Characterization & Capability Matrix

Date: 2026-07-24 · Base tag: (none — first phase) · New tag: `phase0-signoff`
Work items: P0-01 … P0-17 · HEAD at signoff: `cc67af3`

## Deterministic gates

### `devctl verify`
```
✓ doctor pass — all required artifacts present
✓ health: postgres, redis, api, web, livekit, openshare, GET /api/health → 200
✓ codegen pass — generated types match committed files
✓ contract tests pass — 2 suites, 36 tests
✓ characterization tests pass — 11 suites, 89 tests
✓ trace pass
✓ NFR harness pass
✓ verify pass          (exit 0)
```

**Deviation from the template:** it asks for `devctl verify --json` output pasted
verbatim. `--json` does not work: `VERIFY_JSON` is set from the flag and never
read, and `devctl doctor --json` additionally crashes on `issues[@]: unbound
variable` under `set -u`. Text output is pasted instead and the defect is logged
to BACKLOG, to be fixed before the Phase 1 signoff needs it.

### `devctl e2e` — full suite ×2 (flake census)
```
run 1: p0-17-hello.yaml ✓ — all flows pass
run 2: p0-17-hello.yaml ✓ — all flows pass
```
Flake census: **0 flakes / 2 runs / 1 flow.** The suite is one flow because Phase 0
has no product surface; product flows carrying `@satisfies` begin in Phase 1.

Non-vacuity proven, not assumed: breaking `assertVisible: 'OpenChat'` produced
`Assertion failed` and exit 1; restoring it passed again.

**Retired this phase:** `probe-net.yaml`, which drove Chrome's UI to prove
emulator→host reachability. It could never pass reproducibly — `clearState: true`
resets Chrome to its `FirstRunActivity`, so its `assertVisible: "Chrome"` only
succeeded on an emulator where first-run had been dismissed by hand. Replaced by
`devctl netcheck` (deterministic: device ping to 10.0.2.2 + host-side
`/api/health`), recorded in `artifacts/e2e/netcheck.json`.

### `devctl trace check --phase 0`
```
OK: 0/86 requirements traced
```
Zero is the correct answer, not a hole: `01-REQUIREMENTS.md` assigns no FR to
Phase 0 — the earliest are Phase 1. The gate proves the tool runs and that no
`@satisfies` claims a requirement the phase does not own. Counts are pinned by
`artifacts/trace/expected-count.json` (74 FR + 12 NFR), so the table cannot
change without an explicit update.

### `devctl nfr`
```
{"total":12,"armed":2,"baseline":1,"blocked":9,"overdue":0,"error":0,"pass":2,"fail":0}
```
- **Armed and passing:** NFR-08 (api 0 + mobile 0 tsc errors, 0 explicit `any`),
  NFR-11 (0 literal JSX strings).
- **Baseline recorded:** NFR-03 — universal APK 66.8MB, est. per-ABI 26.6MB, JS
  bundle 1.1MB. Not gating until the delivery artifact is decided (BACKLOG).
- **Blocked:** 9, each naming the phase it must arm in. These cannot rot: the
  ratchet turns a blocked stub `overdue` once `.phase` passes its `ARM_AT_PHASE`,
  proven by bumping `.phase` to 9 (12 overdue, exit 1) and restoring.

### Web-smoke + characterization (NFR-10)
Characterization: **89/89 green.** Web-smoke was not run, and does not need to be:
```
git diff <upstream-base> HEAD -- apps/api/src apps/web/src   →  empty
```
Phase 0 changed **zero lines of product source** in either app. Everything added
is tests, tooling, contracts, docs, and the new `apps/mobile`. There is no backend
change for a web smoke to regress. Phase 1 (P1-01) is the first backend change and
NFR-10 arms there.

### Contracts
Regen diff clean (`codegen --check`: schema.d.ts 142 lines, events.d.ts 86 lines,
both matching committed files). CHANGELOG entries: P0-09 (initial), P0-10
(friends/requests shape correction).

## Judgment gates

**Demo script executed:** emulator boot → `adb install` release APK → `am start -W`
(COLD, TotalTime 329ms) → Maestro flow asserts the screen → `devctl screenshot`.
Artifacts: `artifacts/e2e/screens/hello.png` (44,235 bytes, visually reviewed),
`artifacts/e2e/netcheck.json`, `artifacts/nfr/<sha>.json`.

**Screenshot review:** one screen exists. Dark theme applied, title and subtitle
render from `ui/strings.ts`, no truncation. 1.3× font-scale and light-theme review
are deferred with the rest of NFR-09 to Phase 2, where there is real UI to walk.

**DRIFT-LOG retirement — all lines this phase triaged:**

| Entry | Disposition |
|---|---|
| Vacuous gates 1–4 (P0-04/05/09/12/13) | FIXED in their work items |
| Fabricated commit SHAs (P0-15/16 forensics) | FIXED — ground truth re-established; `expected-count.json` + count assertion added |
| 5th vacuous gate — NFR stubs that could never fail | FIXED (P0-16) — ARM_AT_PHASE ratchet |
| `apps/api` did not typecheck (11 errors) | FIXED (P0-16) |
| `devctl selftest` corrupted `tools/diag-provider.mjs` | FIXED (P0-16) |
| Pre-commit lint step has never run (no ESLint config in apps/api) | **OPEN → BACKLOG**, own work item under 04 §6 |
| `consumer.spec.ts` did not typecheck (5 errors) | FIXED (P0-17) |
| `probe-net.yaml` never reproducibly passable | FIXED (P0-17) — replaced by `devctl netcheck` |

**Open escalations:** zero (`docs/escalations/` is empty). No stop conditions were
hit this phase.

**Backlog additions this phase:** 6. Top 3 by cost of leaving them:
1. ESLint/Prettier config for `apps/api` — the pre-commit lint gate cannot run
   without it, and api TS commits currently require `--no-verify`.
2. APK delivery artifact undecided — blocks NFR-03 from gating at Phase 1.
3. `devctl verify --json` emits no JSON and `doctor --json` crashes.

## Deviations from spec

Decision Records accepted this phase:
- **DR-001** — read-auth
- **DR-002** — config/auth: `/api/config` does not expose OIDC; P1-03 must *create*
  the metadata endpoint
- **DR-003** — iOS Simulator lane (blocked on Xcode install, a human action)
- **DR-004** — toolchain versions: `apps/mobile` uses TypeScript 6.0.3 against
  00 §0.6's `^5.4` pin, because 06 §1 mandates latest-stable Expo whose types
  require it. Node 24 locally, Node 20 pinned in CI.

Also recorded: P0-06 was rescoped mid-phase (P0-04 chose API-driven fixtures,
obsoleting its original role).

## Known-not-done, carried into Phase 1

- **iOS lane is not exercised.** Xcode is not installed (Command Line Tools only),
  so `expo prebuild --platform ios` has never run. Android is the only proven
  platform. One-time human action, per DR-003 and 00 §0.7.
- **CI has never executed.** The workflow exists; no push has run it. NFR-10 and
  the release-APK-in-CI half of the 06 §7 DoD are therefore proven locally only.
  This is the honest gap in this signoff.

## Product-owner note

Phase 0 ran long: 17 work items over five days, ending with one screen on an
emulator. The infrastructure is real and several genuine defects were caught by
it — but a large share of the elapsed effort went into the verification apparatus
auditing itself, and the product owner has flagged the pace. Phase 1 delivers the
first user-visible functionality (native auth, gateway, app shell) and is where
that investment either pays back or does not.
