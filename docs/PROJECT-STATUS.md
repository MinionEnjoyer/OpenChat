# OpenChat — Canonical Project Status

**Canonical product-status document.** Last reconciled: **2026-08-09 PDT** from the production
health boundary, published GitHub release, repository source, CI workflow, and local test receipts.

## Current production snapshot

- **Published desktop/web UI release:** `desktop-v0.8.46`; GitHub publishes Windows NSIS, universal
  macOS DMG/app updater, Linux AppImage/deb, signatures, and `latest.json`.
- **Hosted web/API:** follows the latest CI-passing `main` through the systemd auto-deployer. Do not
  infer an exact deployed SHA from the client version; verify the deployer journal/active release
  pointer when SHA-level provenance is required.
- **Public health on 2026-08-08:** `https://chat.creeger.com/api/health` reported the API healthy
  with PostgreSQL and Redis up.
- **Core integrations:** Authentik OIDC; OpenShare service-key uploads and authenticated media
  proxy; LiveKit voice/video; optional Jellyfin, Giphy, and FCM/APNs.
- **Recent release behavior:** stickers, server-owned join/leave activity in the default general
  channel, centered option and server-action panels, multi-domain web/desktop switching, native
  YouTube shims, and synchronous per-channel message/offset capture before navigation.
- **Maintained automated baseline:** API 46 suites / 308 tests (74.86% statements / 76.86% lines),
  web 27 suites / 71 tests, and 11 passing Playwright desktop/mobile Chromium project runs at the
  last local receipt. CI also runs migration drift, characterization, web build, browser
  interactions, dependency audits,
  provider contracts, the blocking OpenChat/OpenShare boundary, LiveKit config/credential/ICE
  probes, and gate self-tests.
- **Probation/open evidence:** the Compose-backed API integration suite emits retained JSON but is
  not yet a trusted blocker. The deterministic browser harness uses an API/WebSocket test double;
  real browser OIDC, public-edge LiveKit, real-provider playback, and multi-client realtime flows
  still require deployment or acceptance evidence.

For maintained operator guidance, start at [docs/README.md](README.md). Update this section when
the release line, production deployment model, or verification baseline changes.

## Archived orchestration record

Everything below is the preserved 2026-07-27 multi-agent handoff and evidence record. It names old
branches, SHAs, suite thresholds, owners, and other repositories; those facts are historical and do
not override the current snapshot above.

Ephemeral agent/session tracking lives in `docs/AGENT-FLEET.md`. It is the
single fleet ledger for both native Codex agents and CodeWhale/DeepSeek
wrappers; it does not replace this canonical project-status document.

### 2026-07-27 handoff snapshot

The owner is returning orchestration to Claude. Codex automation
`openchat-continuous-execution-monitor` is **PAUSED**; it will not wake or poll.
Running CodeWhale jobs were intentionally left alive and must be reconciled by
session ID or log before re-dispatch.

### Updated owner split

The owner subsequently assigned Claude all primary OpenChat/product
specification work. Codex owns only:

1. the CodeWhale Observer implementation, GUI, and agent-session failure-mode
   verification; and
2. the device scheduler backlog, local control dashboard, and scheduler/device
   failure-mode verification.

Claude has exclusive use of Android emulators for product device tests. Codex
may use only the physical Android device for final scheduler validation, and
only after all device-free scheduler gates are green. Never persist or send its
raw identifier; use a local ephemeral variable and pseudonymous evidence label.

The paused heartbeat remains paused. Completion is announced only by creating:

- `/Users/williambsexton/work/CODEWHALE-OBSERVER-READY.md`; or
- `/Users/williambsexton/work/DEVICE-SCHEDULER-READY.md`.

Do not create either marker for partial progress. A marker requires independent
acceptance evidence, adversarial failure modes, merged-result gates, and (for
the scheduler) physical-device success/failure evidence without emulator use.

### Owner direction and economics

- Use Codex/premium reasoning for architecture, precise work orders,
  adjudication, merge decisions, and trusted merged gates.
- DeepSeek through CodeWhale is effectively free and should be fanned out to
  the maximum safe parallelism, commonly 20–30 independent worktrees.
- Do not confuse a small queue with economic execution: if work is
  dependency-ready, isolated, project-scoped, and non-contentious, dispatch it.
- Preserve the standing DeepSeek authorization and exclusions below.
- Do not run device tests until the scheduler is green.

### OpenChat integration

- Branch/worktree: `integration` at `04f876c`.
- Dirty pre-existing mobile/trace/readiness artifacts remain; preserve them.
- Canonical fleet updates from this Codex session:
  - `52cf9d5` — scheduler fixes and observer review gate;
  - `df01ca0` — active fleet reconciliation;
  - `04f876c` — capacity integration and verifier remediation.
- Product-capabilities corrections: `4a93965`.
- Independent final capability audit: `5b7f2a7`, **37 PASS / 2 DRIFT**.
  All previously disputed substantive claims passed. Remaining drift:
  historical commit counts naturally advanced, and line 357 names
  `T4-phase2-audit.md` instead of `T4-phase3-audit.md`.
- Worktree inventory refresh: `86ab938`; final external verification was not
  dispatched because global process/worktree metadata may include unrelated
  repositories outside the DeepSeek authorization. Its prepared verifier
  worktree/order remains unexecuted.
- Build-ID extractor remediation `b4d689d` independently passed baseline 9/9
  and adversarial 18/18; integration still requires care around dirty
  `apps/mobile/app.json`.

### Device scheduler

Repository: `/Users/williambsexton/work/workflows/device-scheduler`

Current `main`: `638356d`. It is **RED and not releasable**.

Integrated during this session:

- P0 atomic multi-device/security specification: `a652a98`.
- Concurrent cold-start migration fix: `6ebfd5a`, merge `529b748`;
  independent 200×20 contention gate passed.
- Portable process identity: `fe37705`, merge `202f922`;
  independent unrestricted focused gate passed 80/80.
- Combined pre-bundle regression at `202f922`: 265 tests plus 18 subtests
  passed, excluding the then-known broken capacity verifier.
- Strict atomic-bundle schema: `2a7a7c5` plus remediation `2f427b5`, merge
  `2fe5bd4`. The isolated 36-test migration gate passed, but the merge exposed
  a real interaction with the concurrent migration runner:
  `sql.split(";")` misparses semicolons in migration comments and produces
  36/36 migration errors near `new`.
- Batch-capacity implementation: `928de8d`, merge `638356d`.
- Capacity verifier v2 was accidentally committed to `main` first as
  `dfae4ae`; this was not discarded because the tests belong on main, and the
  implementation was then merged. Combined gate reached 54/55. The only
  failure was a verifier-invented `ValueError` expectation for invalid count.
- Verifier remediation `06bf9aa` now asserts the frozen result-returning
  contract and passed 22/22 against `928de8d`. It has not yet been integrated
  into scheduler `main`.
- The remediated verifier reports two additional old-test regressions in
  `test_android.CapacityTest`: missing legacy measurement keys
  `per_emu_estimate_mb` and `headroom_mb`. Adjudicate compatibility before
  declaring capacity green.

Active scheduler job:

| Session | Worktree / branch | Scope |
|---:|---|---|
| `52594` | `device-scheduler-bundle-parser` / `fix/bundle-migration-parser` | Preserve lock/re-read concurrency and strict schema while replacing naive SQL splitting; running at handoff |

The parser fix completed at `f08c456`, independently passed 76 focused
migration/model/concurrency tests, and was integrated on scheduler main as
`fee5f65`. Capacity verifier remediation was integrated as `6df5e5f`.

Current scheduler fan-out:

| Session | Worktree / branch | Scope |
|---:|---|---|
| `18260` | `device-scheduler-v2-bundle-store` / `build/v2-bundle-store` | Atomic bundle store APIs |
| `42233` | `device-scheduler-v2-matching` / `build/v2-matching` | Pure complete bundle matching |
| `47262` | `device-scheduler-v2-process-boundary` / `build/v2-process-boundary` | G16 controlled subprocess boundary |
| `88753` | `device-scheduler-v2-transcript-output` / `build/v2-transcript-output` | G17 transcript-safe projections |
| `67830` | `device-scheduler-dashboard` / `build/local-dashboard` | Local loopback device/run dashboard with guarded cancel seam |
| `38158` | `device-scheduler-dashboard-verify` / `verify/local-dashboard` | Independent dashboard/security/cancel failure gates |

Do not build bundle store/runner/CLI on scheduler `main` until the parser fix is
gated and merged. Pure matching, process-boundary, transcript-safety, Android
hygiene, and isolated verifier work can proceed in parallel.

### CodeWhale Observer

Repository: `/Users/williambsexton/work/codewhale-observer`

- Original high-octane GPT design: `a350957`.
- DeepSeek distributed review: `504696c`, merged at `653c9c6`.
- DeepSeek GUI/security review: `908f232`, merged at `2aea540`.
- Root adjudication accepted all 32 findings with documented changes:
  `6144442`.
- Exact implementation baseline authorized at `f83f870`; normative spec commit
  is `61444420d77f21ad2d004e1b837c71a98b4a92a2`.
- Premium implementation agents were stopped before edits after the owner
  corrected the economics. Equivalent DeepSeek jobs are active:

| Session | Worktree / branch | Scope |
|---:|---|---|
| `78728` | `codewhale-observer-phase0` / `build/phase0-calibration` | Calibration, fake CodeWhale, legacy goldens, prompt-transport canary |
| `64030` | `codewhale-observer-phase1` / `build/phase1-domain` | Rust domain model, schemas, projections, property tests |
| `15522` | `codewhale-observer-verify-phase0` / `verify/phase0-contract` | Independent AC-01–04 and Phase 0 adversarial gates |

Phase 0 builder completed at `fec3b75`; Codex independently ran its complete
contract script: 60/60 passed. Phase 1 and verifier hit the step cap and were
continued as sessions `20550` and `54887` after checkpoint-first orders.

Observer must not be adopted into live fanout workflows until implementer output
is merged and the independent verifier passes the combined result.

### Immediate resume order

1. Poll sessions `52594`, `78728`, `64030`, and `15522`; inspect commits and
   dirty state. Do not infer completion from exit code alone.
2. Gate and merge the scheduler parser repair. Re-run strict migration/model,
   concurrent cold-start, and the full device-free suite.
3. Integrate capacity verifier remediation `06bf9aa`; adjudicate the two legacy
   measurement-key regressions and run the combined capacity suite.
4. Merge capability audit `5b7f2a7`; correct the Phase 3 audit path. Treat
   moving commit counts as timestamped measurements, not a product defect.
5. Gate observer Phase 0 and Phase 1 separately, then merge and run the
   independent Phase 0 verifier against the combined state.
6. Restore broad DeepSeek fan-out. Dependency-ready tracks include pure bundle
   matching, G16 process boundary, G17 transcript-safe output, Android provider
   hygiene, generic-driver removal regate, schema-hardening regate, readiness
   and provenance verification, store stress, and Build-ID integration.

## Authority and truth

When sources disagree, use this order:

1. The project owner's latest explicit instruction.
2. This file for current state, active work, and the next action.
3. `docs/PRIORITIES.md` for standing owner priorities and scope decisions.
4. The frozen specifications and accepted decision records.
5. `docs/archive/HANDOFF.md` and `docs/archive/HANDOFF-P3-P4.md` as historical context only.
6. Agent reports and chat summaries as unverified leads.

Evidence labels used here:

- **VERIFIED** — independently executed or inspected during reconciliation.
- **OBSERVED** — directly present on disk, but not necessarily acceptance-tested.
- **REPORTED** — inherited from a prior session and not independently rerun.
- **NOT RUN** — no claim is being made.

## Cold-start protocol

Before changing or dispatching anything:

1. Read this file and `docs/PRIORITIES.md`.
   Then read `docs/AGENT-FLEET.md` before dispatching or continuing agents.
2. Read the operating contract and verification rules:
   - `~/work/workflows/codewhale-fanout/ARCHITECT.md`
   - `~/work/workflows/codewhale-fanout/VERIFICATION.md`
   - `~/work/workflows/codewhale-fanout/TRAPS.md`
   - `~/work/workflows/codewhale-fanout/common-rules.md`
3. Reconcile live state with:

   ```bash
   git -C /Users/williambsexton/work/oc-integration status --short --branch
   git -C /Users/williambsexton/work/oc-integration log -1 --oneline
   git -C /Users/williambsexton/work/OpenChat worktree list
   bash /Users/williambsexton/work/workflows/codewhale-fanout/scripts/fleet-health.sh
   ```

4. Preserve dirty work. Never bulk-clean, reset, or delete worktrees from the
   counts in this document.
5. Report any difference from this snapshot before proceeding.

## Operating role

The primary model is the **architect/orchestrator**:

- Write work orders and dispatch CodeWhale agents into isolated worktrees.
- Do not write product code or product tests; agents do that.
- Independently run gates and treat every agent report as a hypothesis.
- Inspect forbidden-path changes, adjudicate findings, merge verified work into
  `integration`, and gate the merged result again.
- Manage environment setup, native builds, device verification, merge-conflict
  resolution, decisions, drift records, and signoffs when needed.
- Use tracked dispatches through
  `workflows/codewhale-fanout/scripts/dispatch.sh`.

The invariant is: **nothing is done until the appropriate acceptance evidence
was executed by someone other than the author.**

## Current repository snapshot

| Item | State |
|---|---|
| Canonical integration worktree | `/Users/williambsexton/work/oc-integration` |
| Integration branch | `integration` |
| Integration HEAD | Resolve live with `git rev-parse HEAD`; last pre-status audit HEAD was `70908d7` |
| Integration cleanliness | **DIRTY — preserve** |
| Linked OpenChat worktrees | 188 |
| Dirty `openchat-*` worktrees | 59 |
| Running agents | 2 trusted Wave 1 builders + 2 CodeWhale research agents at reconciliation |
| Devices available to `adb` | No device serial observed during reconciliation |
| Current integration gates | **NOT RUN** at `70908d7` by this reconciler |

### Pre-existing integration changes — do not discard

The following were present before this status document was created:

```text
 M apps/mobile/app.json
 M artifacts/trace/matrix.json
?? .fanout/config.sh
?? artifacts/readiness/emulator-5554/create-server.png
?? artifacts/readiness/emulator-5554/create-server.xml
?? artifacts/readiness/emulator-5554/friends.png
?? artifacts/readiness/emulator-5554/friends.xml
?? artifacts/readiness/emulator-5554/invite-preview.png
?? artifacts/readiness/emulator-5554/invite-preview.xml
?? artifacts/readiness/emulator-5554/left-drawer.png
?? artifacts/readiness/emulator-5554/left-drawer.xml
?? artifacts/readiness/emulator-5554/roles-editor.png
?? artifacts/readiness/emulator-5554/roles-editor.xml
?? artifacts/readiness/emulator-5554/server-settings.png
?? artifacts/readiness/emulator-5554/server-settings.xml
?? artifacts/readiness/emulator-5556/join-server.png
?? artifacts/readiness/emulator-5556/join-server.xml
```

Ownership and final disposition of these changes have not been adjudicated.

## Project state

### Phase signoffs

- Phase 0: signed off.
- Phase 1: **NOT GRANTED**; audit identifies three P0 evidence blockers.
- Phase 2: **NOT GRANTED**; audit/signoff are merged.
- Phase 3: **NOT GRANTED**; three P0 blockers and five weak-evidence findings.

The Phase 1–3 audits were desk audits. Their signoff documents explicitly say
that current deterministic/device gates were not run as part of the audit.
`@satisfies` coverage is therefore not proof of acceptance.

### Seven requirement investigations

Claude dispatched seven device-free investigations immediately before its
session ended. All produced reports. **All seven reports are now merged into
`integration`** at merge HEAD `90b5ef7`.

| Requirement | Verdict | Worktree state |
|---|---|---|
| FR-AUTH-001 | A — built, required E2E missing | Merged |
| FR-AUTH-006 | A — built, required two-client E2E missing | Merged |
| FR-MSG-014 | A — built, required evidence missing | Merged |
| FR-ROLE-001 | B — partially built | Merged with backlog entry |
| FR-SRV-006 | A — built, invite deep-link E2E missing | Merged |
| FR-SRV-008 | A — built, existing E2E is non-destructive | Merged |
| FR-SRV-009 | B — partially built | Merged with backlog entry |

Important product finding: FR-SRV-009's server publishes granular guild events,
but the mobile `applyEvent` path silently drops them. FR-ROLE-001 also requires
product work, not merely a stronger test.

### CodeWhale workflow smoke test

**VERIFIED 2026-07-26:** three isolated CodeWhale agents ran concurrently in
`cw-smoke-5`, `cw-smoke-10`, and `cw-smoke-15`. They executed 5-, 10-, and
15-second sleeps, returned exit code 0, reported the correct worktree, and left
clean trees. External provider access requires the approved network escalation.

The smoke-test worktrees and `.fanout-logs/cw-smoke-*.log` remain as evidence.

### External CodeWhale authorization

On 2026-07-26 the owner authorized Codex to send OpenChat and device-scheduler
source code, specifications, tests, and scoped work orders to DeepSeek through
CodeWhale for this project until revoked.

Exclusions remain absolute: do not send credentials, `.env` contents, API keys,
tokens, private user data, or unrelated files. Every CodeWhale order must repeat
these exclusions when its read scope includes repository content.

## Device scheduler — active objective

The owner explicitly paused further device fan-out until a scheduler prevents
the contention, stale-build, orphan, silent-target, and resource-exhaustion
failures observed on 2026-07-26.

Repository: `/Users/williambsexton/work/workflows/device-scheduler`

### Owner directive — scope and platform boundary

The scheduler owns three capabilities:

1. **Device leasing** — exclusive allocation, holder identity, release, reap,
   and observability.
2. **Device lifecycle** — discovery and health for every device; start/stop for
   device kinds that support it.
3. **App installation** — install the caller-supplied build artifact and verify
   that the intended build is present before a test runs.

Android is the essential v1 implementation and must work end to end. The design
must not make Android identifiers, `adb`, APKs, AVD lifecycle, Android package
names, or Android permission semantics part of the platform-neutral lease core.
iOS execution is deferred, but future iOS simulators and physical devices must
fit through provider interfaces without replacing the lease database, scheduler
state machine, CLI contract, or run-record model.

The platform-neutral model must distinguish at least:

- platform (`android`, future `ios`);
- device kind (`emulator`/`simulator`, physical);
- opaque device identifier (`serial`, future `UDID`);
- lifecycle capabilities (discover, boot, shutdown, reset);
- installation capabilities and artifact type;
- app identity and installed-build provenance;
- provider-specific preparation such as permissions or signing.

Physical devices are discoverable, leasable, health-checkable, and installable,
but are not assumed to support programmatic boot, shutdown, or reset.

| Artifact | State |
|---|---|
| `SPEC.md` | Reviews reconciled; approved v1 committed at `63e04a6` |
| `REVIEW-A.md` | Committed at `e4f3d85`; adversarial review |
| `REVIEW-B.md` | Committed at `dcf5158`; implementability review |
| Implementation | Wave 1 core/store and provider/fakes in progress |
| Validation | None |

Reviewer A's blockers were reconciled into the approved v1. Two trusted
in-workspace builders own disjoint Wave 1 packages. Two scoped CodeWhale agents
are concurrently deriving the Android-provider ground truth and the executable
G1–G11 validation plan.

The revised v1 must resolve at least:

- Atomic lease acquisition and crash-safe state, preferably SQLite.
- A platform-neutral lease/state machine with provider-owned Android behavior.
- Android provider support for discovery, lifecycle, APK installation, and
  installed-build verification.
- Provider contracts and fake fixtures proving a future iOS provider can use
  the same core without schema or CLI redesign.
- PID reuse/process-identity handling.
- A concrete owner/lifetime model for emulators.
- Separate physical-device and emulator lifecycle rules.
- Safe capacity decisions from measured host resources.
- Explicit APK provenance/freshness semantics.
- Runtime proof of explicit device targeting; no grep-only gate.
- A fake-device registry seam for device-free concurrency testing.
- Concrete heartbeat/stall semantics or explicit deferral.
- Report-only orphan detection by default; destructive killing opt-in.
- Clear treatment of worktree collision as out of scheduler scope.

## Ordered next actions

Do these in order:

1. **Complete and gate scheduler Wave 1.**
   Merge the atomic store and provider/fake packages, then run their combined
   tests independently. Adjudicate the Android and validation research reports.

2. **Build the remaining scheduler waves through agent fan-out.**
   Suggested dependency waves:
   - acquire/run lifecycle and status/observability in parallel;
   - CLI integration;
   - independent adversarial verifier on the assembled result.

3. **Validate trivial scenarios before product use.**
   Demonstrate both failure and success for concurrent acquisition, holder
   death, lease recovery, failing-command cleanup, stale APK rejection,
   explicit serial targeting, memory refusal, and physical-device safety.

4. **Resume product closure only through the scheduler.**
   Fix the partial FR-ROLE-001 and FR-SRV-009 implementations, then assign one
   leased device per agent to close required E2E evidence.

5. **Gate and re-audit.**
   Gate every accepted branch, gate the merged `integration`, then re-run Phase
   1–3 audits and grant only the signoffs supported by executed acceptance
   evidence.

## Verification cautions

- The prior `docs/archive/HANDOFF.md` baseline of 30/405 mobile tests is obsolete.
- A prior Claude report said the merged tree was green at 92 suites / 887 tests,
  but this reconciler did not reproduce that run. Treat it as **REPORTED**, not
  current gate evidence.
- `.fanout/gates.sh` currently permits minimums of 25 suites / 342 tests and may
  be stale. Re-establish real full-run counts before trusting it.
- Always gate the merged result, verify the verifier, use independent oracles,
  and treat a lower suite/test count as a failed partial run.
- Do not run device tests directly while the scheduler objective remains open.

## Update protocol

At every meaningful transition, update:

1. Timestamp, integration HEAD, dirty-state summary, agent count, and devices.
2. Active objective and ordered next action.
3. Branch/worktree disposition for newly completed or interrupted work.
4. Gate commands, real exit codes, and exact suite/test counts.
5. New owner decisions, accepted deviations, blockers, and signoff changes.

Keep detailed history in `docs/LOG.md`, `docs/DRIFT-LOG.md`, audits, and signoff
records. Keep this file compact and current: it is an operational snapshot, not
an append-only diary.
