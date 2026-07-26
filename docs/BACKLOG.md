# BACKLOG — Frozen Bugs from Characterization Suite

Each entry records a behavior frozen by the P0-04 characterization suite that is
either incorrect, incomplete, or merely tolerated. All entries include evidence
(test name + file:line), user-visible impact, priority, and the phase where the
fix should be applied.

**Rule:** When fixing any entry below, the characterization test that froze it
must be updated in the same commit (with the spec work-item ID in the commit
message) per `02-PHASE0-DISCOVERY.md §P0-04`. Never silently edit a
characterization test to match new behavior.

---

## BUG-001: 500 Internal Server Error on server leave

- **Evidence:** `servers.spec.ts:112` — `expect([200, 500]).toContain(res.status)`
  with comment `// characterizes: leave returns 200 or 500 (freeze whichever)`
- **User-visible impact:** Users see an error when leaving a server. This is a
  common user action and a 500 is never acceptable.
- **Priority:** HIGH — shipping a 500 on an ordinary user action is not
  acceptable parity.
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps). The root cause is likely
  in the `ServersService.leave()` method.
- **Fix note:** When fixed, update `servers.spec.ts:112` to `expect(res.status).toBe(200)`
  in the same commit, with `[P0-04]` in the commit message.

## BUG-002: 500 Internal Server Error on member kick

- **Evidence:** `servers.spec.ts:122` — `expect([200, 500]).toContain(res.status)`
  with comment `// characterizes: kick returns 200 or 500 (freeze whichever)`
- **User-visible impact:** Server owners see errors when kicking members.
  Same as BUG-001 — not acceptable parity.
- **Priority:** HIGH
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps).
- **Fix note:** When fixed, update `servers.spec.ts:122` to `expect(res.status).toBe(200)`
  in the same commit.

## BUG-003: 403 Forbidden on DM creation between non-friends (no happy path)

- **Evidence:** `dms-friends.spec.ts:16-17` — `expect(res.status).toBe(403)`
  with comment `// characterizes: DM creation between non-friends returns 403`
- **User-visible impact:** Users cannot create DMs with anyone who is not already
  a friend. The DM system is gated on friendship, which is the current design,
  but the 403 error path is characterized; the happy path (DM between friends)
  has no characterization test.
- **Priority:** MEDIUM — design decision, not a bug in the strict sense, but
  needs a happy-path characterization test.
- **Phase:** Phase4 (Social) — implement DM happy-path test.

## BUG-004: null friendCode (lazy backfill)

- **Evidence:** `auth.spec.ts:16-18` — `if (res.body.friendCode !== null) { ... }`
  with comment `// characterizes: friendCode may be null (lazy backfill in getCurrentUser)`
- **User-visible impact:** New users created via dev-login may have a null
  friendCode until `GET /auth/me` is called (which triggers lazy backfill).
  This is a minor UX issue — friend codes may briefly appear null.
- **Priority:** LOW — the backfill runs on next `/me` request, so this is
  self-healing. Tighten if needed.
- **Phase:** Phase7 (Parity Gaps) or any later phase.

## BUG-005: member-role assignment status <500 (too permissive)

- **Evidence:** `roles.spec.ts:40` — `expect(res.status).toBeLessThan(500)`
  with comment `// characterizes: role assignment behavior — freeze whichever status code`
- **User-visible impact:** Role assignment endpoint behavior is not pinned down.
  Could silently change from one 2xx/3xx/4xx to another.
- **Priority:** LOW — tighten to exact status code once behavior is stable.
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps).

## BUG-006: poll vote accepts [200, 201] range

- **Evidence:** `pins-polls.spec.ts:44` — `expect([200, 201]).toContain(res.status)`
  with comment `// characterizes: poll vote returns 200 or 201`
- **User-visible impact:** Poll voting behavior is not pinned down.
- **Priority:** LOW — tighten to exact status code.
- **Phase:** Phase4 (Social) or any later phase.

## BUG-007: logout accepts [200, 201] range

- **Evidence:** `auth.spec.ts:113` — `expect([200, 201]).toContain(res.status)`
- **User-visible impact:** Minimal. Logout behavior is not precisely pinned.
- **Priority:** LOW.
- **Phase:** Phase1 (Auth) or any later phase.

## BUG-008: DM requires friendship — no happy path test

- **Evidence:** `dms-friends.spec.ts:12-18` — only the 403 error path is tested
  for `POST /dms`. No test currently verifies successful DM creation between
  friends.
- **User-visible impact:** The DM happy path is uncovered. A regression could
  break DM creation without a test failure.
- **Priority:** MEDIUM — coverage gap.
- **Phase:** Phase4 (Social) — add DM happy-path characterization test.

## BUG-009: Fixed waits in WS tests (potential flake)

- **Evidence:** `ws.spec.ts:44,58,60,64,76` — `setTimeout(r, 300-500)` fixed
  waits instead of polling-with-timeout.
- **User-visible impact:** WS tests may flake under CI load or on slower
  machines.
- **Priority:** LOW — hardening item. No user-visible bug.
- **Phase:** Phase2 (Messaging) or Phase8 (Notifications/Release) — convert
  fixed waits to polling loops.

## BUG-010: Inter-test coupling via shared seed state

- **Evidence:** `jest-char.config.js:13` `maxWorkers: 1` hides coupling.
  `pins-polls.spec.ts:14` references `s.messageIds[0]` which may have been
  modified by prior tests. `dms-friends.spec.ts:39` uses conditional logic
  based on prior test results.
- **User-visible impact:** A partial rerun (`--testNamePattern`) could behave
  differently than a full suite run.
- **Priority:** LOW — infrastructure hardening.
- **Phase:** Phase0 (Discovery) or Phase8 — isolate seed per-test or document
  ordering assumptions.

## BUG-011: P0-06 seed deviation undocumented in decision record

- **Evidence:** `docs/LOG.md:91` — "Seed strategy: API-driven seed in helpers.ts
  via seed(). No P0-06 dependency." No formal decision record exists.
- **User-visible impact:** The 1000-message `#volume` channel required for
  NFR-02 baselining and E6 has no home. P0-06's `fixture-ids.json` does not
  exist.
- **Priority:** MEDIUM — homeless requirement; P0-06 rescope needed.
- **Phase:** P0-06 (when rescoped) — write T3 decision record documenting the
  deviation.

## BUG-012: WS error handler silently swallows connection errors

- **Evidence:** `helpers.ts:97` — `ws.on('error', () => {})` — WS connection
  errors are silently dropped. Test failures manifest as timeouts, not
  descriptive errors.
- **User-visible impact:** Debugging test failures is harder than necessary.
- **Priority:** LOW — infrastructure hardening.
- **Phase:** Phase2 (Messaging) — log errors and surface in test failure output.

## BUG-013: Coverage thinner than claimed — several 03 §2 routes untested

- **Evidence:** `DELETE /friends/:userId`, `POST /friends/requests/:id/decline`,
  `POST /block/:userId`, `DELETE member-roles` have no tests. `POST /dms` has
  only error path, no happy path. `GET /friends/requests` and `GET /notifications`
  are only covered by the 401 matrix.
- **User-visible impact:** These endpoints have no characterization protection.
  A regression could silently change their behavior.
- **Priority:** MEDIUM — coverage gap.
- **Phase:** P0-04 extension or Phase7 (Parity Gaps) — add characterization
  tests for uncovered routes.

---

## BUG-014: Consumer contract tests should relocate to apps/mobile at P0-17

- **Evidence:** `apps/api/test/contract/consumer.spec.ts` currently lives under the API
  project. Consumer contract tests exercise the consumer's understanding of the
  contract — they belong in the consuming application (`apps/mobile`) where they
  describe the environment they execute in.
- **User-visible impact:** None. Organizational clarity.
- **Priority:** LOW — tests run correctly regardless of location. Move when the
  `apps/mobile` project struct exists (P0-17).
- **Phase:** P0-17 (mobile project setup).
- **Fix note:** Move `consumer.spec.ts` (and its supporting schema types) to
  `apps/mobile/src/api/__tests__/contract/`. Keep a symlink or CI step in the
  API project until migration is complete.

---

## BUG-015: Provider coverage — Phase 1-4 routes without provider contract tests

**What:** The provider contract test suite (36/36, `additionalProperties:false`) covers 18
operations across auth, servers, messages, reactions, pins, invites, voice, DMs, friends,
notifications, and health/config. The following Phase 1-4 mobile-consumed routes lack provider
coverage:

| Route | Phase | Reason excluded |
|-------|-------|----------------|
| `PUT /auth/server-layout` | 1 | No response schema in contract; body is arbitrary layout JSON |
| `GET /servers/:id/sounds` | 3 | Happy-path only in characterization; no contract schema |
| `POST /servers/:id/sounds` | 3 | Happy-path only; no contract schema |
| `DELETE /servers/:id/sounds` | 3 | Happy-path only; no contract schema |
| `PATCH /servers/:id/sounds` | 3 | Route exists in controller; no characterization test; no schema |
| `GET /servers/:id/members` | 3 | Characterization only; no contract schema |
| `POST /servers/:id/members` | 3 | Implicit in seed; no contract schema |
| `GET /servers/:id/roles` | 3 | Characterization only; no contract schema |
| `POST /servers/:id/roles` | 3 | Characterization only; no contract schema |
| `PATCH /servers/:id/roles/:roleId` | 3 | Characterization only; no contract schema |
| `DELETE /servers/:id/roles/:roleId` | 3 | Characterization only; no contract schema |
| `PUT member-roles` | 3 | Characterization only; no contract schema |
| `DELETE member-roles` | 3 | Not tested at all; no contract schema |
| `GET /dms` | 4 | Asserted as array only (no schema validator) |
| `POST /dms` | 4 | Accepts 200/201/403 range; no schema validator |
| `GET /friends` | 4 | Asserted as array only (no schema validator) |
| `POST /friends/requests/:id/decline` | 4 | Characterization only; no contract schema |
| `DELETE /friends/:userId` | 4 | Characterization only; no contract schema |
| `POST /block/:userId` | 4 | Characterization only; no contract schema |
| `POST /server-invitations/:id/accept` | 4 | Characterization only; no contract schema |
| `POST /server-invitations/:id/decline` | 4 | Characterization only; no contract schema |
| `GET /voice/:channelId/participants` | 4 | Characterization only; no contract schema |
| `GET /gifs/search` | 5 | Requires external API key; no contract schema |
| Watchparty routes | 7 | Deferred; no contract schema |

This is honest thinness: 18 routes with strict provider validation + 24 with named reasons for
exclusion. None are silently missing. Characterization coverage provides a backstop for routes
without provider schemas, but future phases adding schemas for these routes should add ajv
validators in `provider.spec.ts`.

**Disposition:** Not a defect. This is the stated state of Phase 0 coverage. The provider
suite covers every route with a contract schema. Routes without schemas are tracked here.

---

*Last updated: 2026-07-21 (P0-04 remediation, P0-09 provider rebuild, P0-10); updated 2026-07-25 (P3 Task 0)*

---

## UNBUILT-001: FR-AUTH-001 client half unbuilt (OIDC PKCE)

- **Evidence:** `bearer-auth.spec.ts:27` (before P3 fix) carried
  `@satisfies FR-AUTH-001` on a test that only proves bearer tokens work via
  **dev-login**. FR-AUTH-001 requires native OIDC login via the system browser
  with PKCE — `expo-auth-session` is not installed, the client PKCE flow is
  not implemented, and no E2E test exercises system-browser OIDC login.
  The annotation was corrected to `@satisfies FR-AUTH-005` (ws-ticket via
  bearer) which the test genuinely proves.
- **User-visible impact:** There is no OIDC login path. Users cannot log in
  via Authentik or any IdP. The backend exchange endpoint (`POST /api/auth/token`
  with grant `authorization_code`) exists and is tested, but the client half
  is missing.
- **Priority:** HIGH — this is a Phase 1 requirement that blocks real auth.
- **Phase:** Phase 1 (Auth) — needs `expo-auth-session` PKCE against
  `GET /api/auth/oidc-metadata`.

---

## Tooling debt (P0-16)

- **`devctl commit` is unusable.** It aborts when `git diff-index --quiet HEAD`
  reports differences, which is true of every commit that has something to
  commit. Either make it stage-aware (compare against the index, not HEAD) or
  drop the subcommand. Found during P0-16; commits currently use plain `git`.
- **NFR-08 measures the wrong subject.** 01 §4 scopes it to `apps/mobile/src`;
  the script arms over `apps/api` because no mobile TS project exists yet. It
  declares `scope_complete:false` and ratchets at Phase 1 — extend it to the
  mobile package at P0-17 rather than leaving the partial measurement.
- **`artifacts/nfr/<sha>.json` archives are gitignored** (regenerated per run and
  always named for the previous commit). `report.json` is the tracked pointer.
- **ESLint/Prettier config for `apps/api` does not exist** (04 §6 specifies both
  plus a zero-warnings policy). The pre-commit lint step invokes `npx eslint`
  against a package with no config and no eslint dependency, so it has never
  passed and blocks any commit touching `apps/api/**/*.ts`. Needs its own work
  item: add the configs, install pinned deps, and triage the first run over
  upstream source. Until then, api TS changes require `--no-verify` (log it).
- **APK delivery artifact is undecided (NFR-03).** `assembleRelease` produces a
  *universal* APK carrying four ABIs: 66.8MB total, of which ~56MB is native libs
  (arm64-v8a 14.8, x86 15.8, x86_64 15.2, armeabi-v7a 10.2). No device installs
  all four; estimated per-ABI size is 26.6MB, comfortably inside the 60MB budget.
  Before NFR-03 can gate (Phase 1, per its ARM_AT_PHASE), decide the delivery
  artifact — Play App Bundle, or ABI-split APKs via a config plugin, since
  `android/` is regenerated by prebuild and cannot hold the setting. JS bundle is
  1.1MB against a 12MB budget.
- **`devctl verify --json` emits no JSON.** `VERIFY_JSON` is set from the flag and
  never read; the README documents a JSON shape that is never produced, and
  `devctl doctor --json` crashes on `issues[@]: unbound variable` under `set -u`
  when the array is empty. T4 signoff asks for pasted JSON, so this needs fixing
  before the Phase 1 signoff.
- **`usesCleartextTraffic: true` is set for dev builds** (release APKs must reach
  the dev stack at http://10.0.2.2). Phase 8 release hardening must remove it or
  scope it with a networkSecurityConfig allowing only 10.0.2.2 in dev flavors.

## Test-oracle portability (P7-03)

- **Exact-ID oracles are database-specific and block isolated-DB branches.**
  `test/integration/p7-05-message-search.spec.ts` and `p2-16-around.spec.ts`
  assert exact message IDs read from `artifacts/trace/expected-*.txt`, captured
  against the shared dev database. Any branch carrying a Prisma migration must run
  its own isolated database (correctly), and therefore generates different UUIDs —
  so those suites fail on such branches by construction, producing false
  regressions. Two good rules in collision.
  Fix options: (a) derive expected IDs at test time from the seed's own
  deterministic content rather than a captured file, or (b) key the expected-file
  by database identity and regenerate on seed. (a) is preferable — it removes the
  captured artifact entirely and makes the oracle portable.

## Core API types are hardcoded inside the generator, not derived from the contract

`tools/codegen/gen.mjs` emits `Server`, `Channel`, `Category` and `Role` from a hardcoded
template literal (~line 85-110) rather than deriving them from `contracts/openapi.yaml`.
`Role` was added there during the S2 rebase, consistent with the existing pattern.

Consequence: for these types the generator IS the source of truth, so `openapi.yaml` can
drift from what the client actually uses and nothing will notice. The codegen gate only
proves `schema.ts` matches `gen.mjs` output — it does not prove either matches the contract
or the wire.

Not a regression (pre-existing design) and not currently causing a defect: the hardcoded
shapes were checked against the Prisma models and match. Recorded because it is the same
class of problem as DD-018 — a gate that verifies a weaker property than it appears to.

Fix when convenient: declare these under `components/schemas` in `openapi.yaml` and generate
them like everything else, so the drift gate covers contract→client for all types.
   captured artifact entirely and makes the oracle portable.

---

## `no-explicit-any` debt (L1b lint gate, 2026-07-25)

48 sites use `any`. The lint rule is set to `'warn'` — they are visible and
countable but do not block the gate. They must not grow. Incrementally type
each site; when the count reaches 0, promote the rule to `'error'`.

### Breakdown by file

| File | Count |
|---|---|
| `src/realtime/events.gateway.ts` | 13 |
| `src/messages/messages.service.ts` | 9 |
| `src/watchparty/watchparty.service.ts` | 7 |
| `src/friends/friends.service.ts` | 4 |
| `src/share/share.service.ts` | 2 |
| `src/gifs/gifs.module.ts` | 2 |
| `src/auth/auth.service.ts` | 2 |
| `src/audit-log/audit-log.service.ts` | 2 |
| `src/voice/voice.service.ts` | 1 |
| `src/servers/servers.service.ts` | 1 |
| `src/redis/redis.service.ts` | 1 |
| `src/overwrites/overwrites.service.ts` | 1 |
| `src/messages/messages.controller.ts` | 1 |
| `src/invites/invites.service.ts` | 1 |
| `src/dms/dms.service.ts` | 1 |

- **Priority:** MEDIUM — the top 3 files account for 29/48 (60%) and are the
  highest-value targets.
- **Phase:** Continuous. Each typed site is a self-contained improvement; no
  orchestrated cutover required.

## Mobile integration tests fail silently against a default unreachable port

`apps/mobile` tests that talk to the API (e.g. the FR-SOC-004 presence suite) default to
`localhost:3104` when `API_BASE` is unset. If no API is listening there they fail with a
bare `AggregateError` — no indication that the cause is "nothing is serving at this URL".

This has cost investigation time three separate times in one session, twice being
mistaken for a real regression (once attributed to a schema bug, once to a LiveKit
dependency install). Each time the tests passed immediately once `API_BASE` was set.

Fix: fail fast with a clear message. In the shared test setup, probe the configured base
URL once and, if unreachable, throw something like
`API unreachable at <url> — set API_BASE to a running API` rather than letting each
individual request produce an opaque AggregateError.

---

# Tooling wants — recorded 2026-07-26 (Will)

Explicitly NOT current priorities. Parked so they are not lost. None block
priorities 1–5 in PRIORITIES.md.

## B-01 — GUI for CodeWhale fleet observability

**Want:** a separate window showing, per running agent: live log tail, current
task, **step count consumed vs cap as a progress bar**, elapsed time, and a
clear stalled/orphaned indicator.

**Why — measured pain this session:**
- An orphaned `zsh` wrapper (parent agent killed; its `sleep && kill` watchdog
  child reparented to launchd) sat for **38 minutes** looking like live work.
  Will spotted it, the architect did not — because the architect counts
  `codewhale exec` processes and that misses orphans entirely.
- **Five separate agents** step-capped with good work uncommitted. Nothing ever
  surfaced "this agent is near its step budget" until after it died.
- The architect detects trouble by waiting for completion notifications. A hung
  agent never sends one, so the fleet can be dead while appearing busy. This is
  the single biggest risk when Will is away for hours.

**Stopgap already built:** `tools/fleet-health.sh` — flags stalled agents (log
silent > N min), orphaned wrappers (ppid == 1), device count, and uncommitted
work per worktree. First run found **35 worktrees** with uncommitted files,
including a *completed* refresh fix nobody had committed. It is polling, not a
live view, and still depends on the architect remembering to run it.

**Sketch:** codewhale would need to emit structured step/status events (JSONL per
run) rather than only free-text logs; the GUI is then tail + parse. The step-count
progress bar is the highest-value single element — it turns "is it stuck?" into a
glance instead of an investigation.

## B-02 — Test scheduler / device broker

**Want:** a service owning the 4 devices that accepts run requests from agents and
the architect, queues them, and keeps a durable record independent of the
requesting process.

**Why — measured pain this session:**
- **Contention corrupts results.** `e2e-run-only.sh` writes verdicts to
  `/tmp/e2e-verdicts-$DEV.txt`, keyed by device only. Two concurrent runs on
  emulator-5556 interleaved into one file, and one run's deliberate abort tests
  were read as the other's product failures. An entire voice-flow run was void.
- **Results die with the process.** Evicted agents left logs only in orphaned
  process output; 158 artifact files survived only because they had been written
  to disk first.
- **Manual device budgeting does not scale.** The architect hand-writes "use
  emulator-5554 ONLY" into each work order and got it wrong twice today.
- **Stale-build runs, three times.** Results measured against an APK that did not
  contain the code under test (stale APK; wrong `EXPO_PUBLIC_API_HOST` inlined;
  then stale again). A broker could refuse any run whose APK predates the commit
  under test — centrally, instead of per-caller preconditions.

**Minimum viable shape:** lease/release per device so requests block or fail fast
rather than silently colliding; persisted run records (device, commit sha, APK
mtime, flow list, verdicts, artifact paths, exit reason incl. TIMEOUT); refusal on
failed build-freshness or debuggable-build preconditions; and a query interface —
"what ran on the tablet today, and what happened".

## B-03 — Bottle the validation model for future projects

**Want:** extract the verification methodology into a reusable kit, separate from
this app, once OpenChat Mobile is in a good state.
`~/workspace/workflows/codewhale-fanout/` is the seed.

**Why:** the patterns that caught real defects here are project-independent, and
rediscovering them cost real time.

**The load-bearing ones, all earned:**
- **Verify the verifier.** A gate is not a control until watched failing;
  perturb-then-restore. Caught: a codegen gate comparing against a deleted file;
  an API-host precondition that passed on *any* host because the bundle contains
  both; a readiness sweep reporting "18 screens, 0 violations" having visited 3.
- **The oracle must be independent of the code under test.** Caught: search tests
  deriving expectations from the search endpoint itself; invalidation tests that
  *reimplemented* the mutation and asserted against the copy.
- **Absence of evidence renders as evidence of absence.** Unreached screens,
  dropped timeout verdicts and skipped flows all report clean. Every gate needs an
  explicit reached/total denominator.
- **Split roles by capability, both directions.** Images to the vision-capable
  reviewer (agents cannot see and must not claim to); text — uiautomator dumps,
  logcat, Maestro logs — to the cheap text agents, who read them and report in
  words. Violating this in *either* direction produced wrong conclusions today.
- **Separate run / diagnose / fix into different dispatches.** Combining them
  burned 4h22m and two step caps on a nine-line change.
- **When fixing a pattern, demand the inventory** — "list every other place this
  occurs, even if you only fix one". Turned a single modal bug into a ranked list
  of 7 more latent races. Cheapest instruction of the day.
- **Commit-first as step 1**, never as a closing line. Five agents lost work.
- **Gate the merged result, not the branch.**

**Also worth extracting:** `tools/check-unreachable.sh` (built-but-unreachable
components — this project shipped 14), the screen-readiness sweep concept
(zero-bounds / off-screen / keyboard-occluded / placeholder assertions across
device densities), `tools/fleet-health.sh`, and
`docs/AGENT-PREAMBLE-NOTES.md` (dispatcher failure modes).
