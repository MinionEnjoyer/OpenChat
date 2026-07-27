# OpenChat — Canonical Project Status

**Canonical live-status document.** Last reconciled: **2026-07-26 22:57 PDT**
by Codex, from repository state and the locally stored Claude transcript.

This file exists so work can move between Codex, Claude, or a fresh operator
without reconstructing the project from chat history. Update it whenever the
active objective, integration HEAD, blocker set, or verification state changes.
Do not create another competing current-status document.

Ephemeral agent/session tracking lives in `docs/AGENT-FLEET.md`. It is the
single fleet ledger for both native Codex agents and CodeWhale/DeepSeek
wrappers; it does not replace this canonical project-status document.

## Authority and truth

When sources disagree, use this order:

1. The project owner's latest explicit instruction.
2. This file for current state, active work, and the next action.
3. `docs/PRIORITIES.md` for standing owner priorities and scope decisions.
4. The frozen specifications and accepted decision records.
5. `docs/HANDOFF.md` and `docs/HANDOFF-P3-P4.md` as historical context only.
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

- The prior `docs/HANDOFF.md` baseline of 30/405 mobile tests is obsolete.
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
