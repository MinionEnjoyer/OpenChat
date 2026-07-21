# 04 — TEST & VERIFICATION INFRASTRUCTURE (The Trust Pyramid, Instantiated)

Goal: make good behavior the path of least resistance. Every layer below is a **mechanism** —
a command with a pass/fail exit code and JSON output — not a guideline. Inference is reserved
for judgment (the agent-validation layer); everything else here runs deterministically without
tokens.

## 1. The stack (bottom → top) and its gate commands

| Layer | Scope | Gate |
|-------|-------|------|
| Type system | all TS strict; mobile bans `any` | `devctl verify --only types` |
| Static analysis | ESLint (zero warnings), Prettier check, ruff (OpenShare), `expo-doctor`, secret scan (`scripts/check-secrets.sh`) | `--only lint` |
| Unit tests | Jest everywhere; RTL for RN components; pytest for OpenShare units | `--only unit` |
| Contract tests | provider + consumer (03 §5) vs dev stack / schema mocks | `--only contract` |
| Build | api `nest build`, web `vite build`, mobile `expo prebuild -p android && gradle assembleRelease` (+`-p ios` config check on Linux) | `--only build` |
| Integration/E2E | Maestro flows on Android emulator against seeded dev stack | `devctl e2e` |
| Perf/NFR harness | §8 budgets | `devctl nfr` |
| Traceability | FR↔test matrix | `devctl trace check` |
| Agent validation | judgment checklists + screenshot review (05 §4) | manual/agent, logged |
| Acceptance | product-owner demo scripts per phase signoff | T4 |

`devctl verify` (no flags) = types+lint+unit+contract+build. All CI jobs call devctl — the
agent and CI run the identical entrypoints, so "works locally" is definitionally "works in CI".

## 2. Dev/test stack
`docker-compose.dev.yml` per `02 §P0-02`. Test invariants: DB reset = drop+migrate+seed
(`devctl stack reset`, ≤60s); every integration/E2E run starts from reset unless the flow is
explicitly marked `@stateful`. Postgres on tmpfs in CI for speed.

## 3. `tools/devctl` (Node 20, zero heavy deps, committed)
Subcommands (all support `--json`; exit 0/1):
`stack up|down|reset|seed|logs <svc> --since|health` · `verify [--only <layer>] [--changed]` ·
`e2e [--flow <name>] [--record]` · `nfr [--only <id>]` · `trace check|report` ·
`screenshot --flow <name>|--screen <route>` (boots app on emulator, captures PNGs to
`artifacts/screens/<git-sha>/`) · `logsnap` (bundle api+openshare+livekit logs + adb logcat
for the last run into one artifact dir) · `device pair` (spins the two-emulator rig, §6).
Every subcommand prints machine-parsable results, e.g.
`{"cmd":"verify","status":"fail","failures":[{"layer":"unit","file":"…","name":"…"}]}` — this
is the agent's primary sensor; never parse raw tool output when devctl can wrap it.

## 4. Repo hooks (husky, installed by `npm ci` at repo root)
- pre-commit: prettier+eslint on staged, `tsc --noEmit` on affected packages, forbid
  `console.log` in `apps/mobile/src` (use the logger), forbid literal JSX strings (NFR-11).
- pre-push: `scripts/check-secrets.sh` + `devctl verify --changed`.
- commit-msg: enforce `[<ITEM-ID>] …` prefix (regex `^\[(P\d-\d{2}[a-z]?|OPS|FIX-\d+)\]`).

## 5. CI (GitHub Actions, `.github/workflows/ci.yml`)
Jobs (all on push/PR): `verify` (devctl verify, matrix: api/web/mobile) → `contract`
(needs services: compose) → `e2e-android` (ubuntu + KVM, `reactivecircus/android-emulator-runner`,
API 34, Pixel 6a profile; uploads Maestro videos+screens+logsnap on failure) → `nfr` (nightly +
release branches) → `web-smoke` (existing web client login+send-message flow — the NFR-10
canary, runs whenever `apps/api` or `contracts/` changed). Branch protection: `verify`,
`contract`, `e2e-android`, `trace`, `web-smoke` required. No merges on red. Ever.

## 6. E2E harness (Maestro)
- `apps/mobile/e2e/flows/*.yaml`; naming `p<phase>-<nn>-<slug>.yaml`; each flow header comment
  lists `# @satisfies FR-…`.
- Determinism rules: all data from seed fixtures (`fixture-ids.json`); no sleeps — use
  Maestro `assertVisible` with timeouts ≤10s; network chaos via `adb shell svc wifi|data` and
  a devctl `netem` helper; time-dependent UI (timestamps) rendered from a frozen clock in
  E2E builds (`E2E=1` env → `Date.now` shim).
- Two-device tests (FR-MSG-002 etc.): `devctl device pair` boots emulators `:5554/:5556`, runs
  paired flows with a driver script asserting cross-device convergence via the second
  device's UI (not via API peeking).
- Auth in E2E uses `dev-login` token path (Phase 1 adds bearer to dev-login). Full
  Authentik-browser login has ONE dedicated flow (`p1-01-oidc-login`) run against a
  containerized Authentik (`goauthentik/server` with a fixture blueprint) nightly, not per-PR.

## 7. Test taxonomy & thresholds
- Unit: pure logic (permission calc, markdown AST, pagination merge, backoff, stores). Target:
  new/changed files ≥80% line coverage (`devctl verify` enforces via jest `--changedSince`
  vs phase base tag; global ratchet recorded in `tools/coverage-baseline.json`, may only rise).
- Component: RTL render tests for every screen's states (loading/empty/error/populated) — the
  four-state rule is lint-enforced by a screen test stub generator (`devctl gen screen-test`).
- Contract/integration: per 03; plus service-level integration specs in `apps/api/test/int/`.
- E2E: only user-visible flows; keep ≤90 flows total; runtime budget 25min CI.
- Property tests (fast-check): permission calculator (FR-ROLE-002), markdown round-trip,
  pagination merge, mention parser. Seeds fixed; failures minimize + commit the counterexample
  as a regression case.

## 8. NFR harness (`tools/nfr/*`)
Each NFR-xx from `01 §4` has one script emitting `{id, value, budget, pass}`:
startup via `adb shell am start -W` + `reportFullyDrawn` marker; jank via
`dumpsys gfxinfo <pkg> framestats` while a Maestro scroll flow runs; sizes from gradle
outputs; PSS via `dumpsys meminfo` sampled in-call; offline/queue/reconnect as flows; a11y
scale via Maestro `--font-scale 1.3` re-run of 5 core flows. Results archived to
`artifacts/nfr/<sha>.json`; `devctl nfr` fails on any budget breach.

## 9. Traceability tool (`tools/trace/`)
Extract requirement IDs from `specs/01-REQUIREMENTS.md` (per its §5) → scan repo for
`@satisfies` / `@characterizes` annotations → matrix `artifacts/trace/matrix.json` + human
`report.md`. `trace check --phase <n>` fails if any FR listed for that phase in the phase
spec lacks ≥1 green test at the required layer (E2E-marked criteria need an E2E or
integration test, not unit-only). Phase 8 gate: 100% of P0+P1 FRs traced; any `@satisfies`
citing an unknown FR is an error (kills stale-claim drift).

## 10. Logging & observability (system legibility for the agent)
- api/openshare: structured JSON logs (pino / uvicorn-json), request-id propagated from a
  `x-request-id` the mobile client generates per API call and logs locally.
- mobile: `src/lib/logger.ts` — ring buffer (last 2000 events) + logcat sink; `devctl logsnap`
  correlates by request-id across app/api/share. Debugging without this correlation is
  guesswork; build it before Phase 1 features.

## 11. Build/deliver order for this spec
Work items P0-10..P0-16 (after 03): devctl skeleton+stack cmds → hooks → CI verify job →
trace tool → seed integration → Maestro harness with one hello-world flow on a blank Expo app
→ NFR harness stubs (fail-as-not-implemented until Phase 8 wires budgets that need the real
app). DoD: CI fully green on a trivial mobile skeleton; `devctl trace report` runs; one
recorded E2E video artifact produced.
