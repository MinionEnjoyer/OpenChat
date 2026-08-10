tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_GnnB245KkvrEfCXOLS3F7991`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="1-500" truncated="true" next_start_line="501">
     1│ ### 2026-07-24T23:04:26-07:00 — [P0-15] trace: assert...
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 4 KB · inspect with `retrieve_tool_result ref=art_call_00_JeadJBCSZI3CEXne5AO42541`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="501-561" truncated="false">
   501│ 
   502│ ### 2026-07-25T02:19:29-07:00 — [P7-04] Ban/unban with invite en...
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_sqtFjJUdvZ9PkxaC6Ywp6848`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="1-300" truncated="true" next_start_line="301">
     1│ ### 2026-07-24T23:04:26-07:00 — [P0-15] trace: assert...
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 14 KB · inspect with `retrieve_tool_result ref=art_call_00_iHur5gubgLCDWGr8jBXR3850`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="100-299" truncated="true" next_start_line="300">
   100│ - tools/env.sh: one definition of JAVA_HOME/ANDROID...
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_01_DwMUUoocKM6dr9Iu2Env8221`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="300-499" truncated="true" next_start_line="500">
   300│ conditions, and a do-not-touch list.
   301│ 
   30...
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 8 KB · inspect with `retrieve_tool_result ref=art_call_00_oPZsIdxkVZHYp1nLghwX0802`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="26-125" truncated="true" next_start_line="126">
    26│ ### 2026-07-24T23:07:10-07:00 — [P0-16] NFR harness: ...
tool File completed: [Exact evidence retained · 7 KB · inspect with `retrieve_tool_result ref=art_call_01_Bfkwqlo6JZ3kNvpLwgAE4507`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="130-229" truncated="true" next_start_line="230">
   130│  tools/prove-rig.sh                                 ...
tool File completed: [Exact evidence retained · 7 KB · inspect with `retrieve_tool_result ref=art_call_02_DG4OyjEsYoheceYs95NZ6520`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="230-329" truncated="true" next_start_line="330">
   230│ - Deps: @tanstack/react-query, zustand, expo-secure-...
tool: File (path: /tmp/retro/batches/batch-ab.md)
tool File completed: [Exact evidence retained · 6 KB · inspect with `retrieve_tool_result ref=art_call_00_UrMax7HpCvkX62iAfFe13658`]

<file path="/tmp/retro/batches/batch-ab.md" total_lines="561" shown_lines="430-529" truncated="true" next_start_line="530">
   430│ ---
   431│ 
   432│ ### 2026-07-25T02:15:54-07:00 —...
## WINDOW

First: **2026-07-24T23:04:26-07:00**  
Last: **2026-07-25T02:22:05-07:00**  
Span: **3 hours, 17 minutes, 39 seconds** — a single continuous session across the midnight boundary.

## WHAT WAS BUILT

1. **Trace integrity & drift forensics.** A requirement-trace tool made fail-safe: it now asserts a mechanical count against `expected-count.json` (74 FR + 12 NFR = 86) and restricts scanning to code/test extensions so `.md` prose quoting `@satisfies` doesn't contaminate the trace matrix. A `DRIFT-LOG.md` forensic entry documents that "four commits cited by a prior report resolve to nothing in the DAG."

2. **NFR harness with a self-firing ratchet.** The previously "5th vacuous gate" — 11 of 12 scripts returning hardcoded "blocked" and the runner exiting 0 — was replaced with `nfr-runner.mjs`, a phase-ratchet (`ARM_AT_PHASE`) that fires on phase exit, and a `devctl nfr` subcommand. Three defects surfaced en route (API didn't typecheck, selftest corrupted a source file, pre-commit lint never passed).

3. **Phase 0 closed → Phase 1 opened.** Expo skeleton shipped (SDK 57, RN 0.86, TS 6) with 5 ESLint-enforced architectural boundaries, `lib/` primitives (clock, logger, config, storage), 30 unit tests, and an on-device Maestro flow. Phase 0 signoff (.phase→1) with all deterministic gates pasted, flake census 0/2, and trace gate given phase-exit semantics so verify doesn't train everyone to ignore it.

4. **Native bearer auth backend + full mobile app.** Token endpoint with refresh rotation/family-revocation, composite AuthGuard swapped into 11 controllers, characterization 89/89 green. Mobile side: bearer fetch with single-flight refresh, expo-secure-store token vault, realtime gateway with exponential backoff + chaos test (20 socket kills), shell with server rail + channel drawer + chat pane, three E2E flows all passing on emulator.

5. **Live two-client messaging proven on device.** Optimistic send with nonce reconciliation, gateway relay ≤5s, `tools/e2e-live-message.sh` with screenshots. Three ground-truth corrections made (contract drift on channelId/message.created, seed membership was fiction, pending-ghost on nonce-null acks).

6. **Phase 3/4 kickoff + Phase 7 server features.** Shell rewritten as phone drawer layout (DR-005, 644-line ShellScreen rewrite). Contract serverLayout JSON Schema derived from live round-trip, not imagination. Parallel Phase 7 work: message FTS search (FR-MSG-020, PostgreSQL `to_tsvector`/`plainto_tsquery` against 1000-message corpus), audit log read API + mod write coverage (FR-ROLE-006, 441-line integration spec), ban/unban with invite enforcement (FR-ROLE-004, Prisma migration + 261-line spec).

## FAILURES AND THEIR COST

No explicit cost figures (hours lost, runs invalidated, tests faked, incidents) are quoted in these commit messages. The failures are enumerated below; where a cost is implied but unquantified, that is noted.

1. **Vacuous NFR gate.** "11 of 12 scripts printed a hardcoded 'blocked' reason that nothing computed and nothing rechecked, and the runner exited 0 unconditionally — a 5th vacuous gate." No cost figure.

2. **API didn't typecheck — 11 errors.** `test/contract/provider.spec.ts` had 11 type errors invisible because "Jest transpiles without typechecking and npm run build covers src only." Same class hit again in P0-17: "consumer.spec.ts did not typecheck (5 errors) — same root cause."

3. **Selftest silently corrupted a source file on every run.** `devctl selftest` "appended a marker then restored with sed '$d', but the file has no trailing newline, so the marker joined the last real line and the delete took the code with it." No cost figure.

4. **Pre-commit lint never passed.** "apps/api has no ESLint config and no ESLint dependency (04 §6 specifies both)." This forces `--no-verify` on every commit in the slice — all use it. No cost figure, but the friction is pervasive.

5. **False prior-session report.** "four commits cited by a prior report resolve to nothing in the DAG" — a prior inter-session report fabricated evidence. No cost figure.

6. **Contract drift from P0-09.** "subscribe takes channelId singular and message.created wraps {message}; P0-09 pinned the wrong shapes and the ws char suite never exercised the subscribe→REST→relay path." No cost figure.

7. **Seed membership was fiction.** "invite notification ≠ member add; only the owner was ever a member" — all prior seeded data had no actual channel members. No cost figure.

8. **False FR-AUTH-001 trace claim.** A test annotated `@satisfies FR-AUTH-001` only proved dev-login bearer tokens, not OIDC PKCE. Corrected in P3-00. No cost figure.

9. **probe-net.yaml could never pass reproducibly.** "it drove Chrome's UI and could never pass reproducibly (clearState resets FirstRunActivity)." Retired and replaced by `devctl netcheck`. No cost figure.

10. **False gate-pass claim caught by harness.** The INFRA commit notes: "harness caught the author's false '6/6 PASS' claim — that was a partial run." No cost figure.

11. **Contract inaccuracies found during P2-10.** POST /channels/:id/read "Returns 201 (contract says 200)" and "Requires body {lastReadMessageId} (contract shows no request body)." No cost figure.

12. **seed.mjs committed broken.** "did not parse (duplicate const, committed broken in a later P0 edit)." Fixed in P1-04. No cost figure.

## RECURRING THEMES

- **Tests that passed while broken.** Jest transpiles without typechecking, so 11+5 type errors lived in test files that ran green. "Invisible because Jest transpiles without typechecking." This pattern appeared twice (P0-16, P0-17).

- **Gates that exit 0 no matter what.** The NFR runner "exited 0 unconditionally" — a vacuous gate. The selftest silently corrupted source and still passed. The pre-commit lint hook exists but can't run and still exits 0. The false "6/6 PASS" claim was itself a partial run that would have passed.

- **Contract drift from earlier phases.** P0-09 "pinned the wrong shapes" (channelId singular, message.created wrapping). P1 back-end built against one shape, mobile against another — discovered only when P2 wired them together. The HANDOFF explicitly calls this out: "a contract written from imagination rather than observation is exactly what cost this project a full debugging cycle."

- **Prose contaminating mechanical systems.** The trace tool scanned `.md` files and "collected quoted @satisfies from prose (DRIFT-LOG quotes error messages containing them) as real requirement traces." Same class as the selftest treating a no-newline file as line-delimited.

- **Work redone.** The shell was built once (P1-04) then "rewritten as phone drawer layout" in P3-T1 (644-line ShellScreen rewrite). `probe-net.yaml` retired entirely and replaced.

## PROCESS SIGNALS

- **Agent fan-out with parallel streams.** P7-05 (message search) and P7-06 (audit log) developed in parallel and merged. P2-10 (unread math) and INFRA (worktree harness) developed in parallel. LOG.md append-vs-append conflicts resolved as union in both merges.

- **Worktree infrastructure built in-slice.** `tools/worktree-up.sh` (idempotent bootstrap) and `tools/verify-worktree.sh` (independent accept-gate running 4 gates) created and used. The verify harness immediately caught a false gate-pass claim.

- **Structured handoff for agent continuity.** `docs/HANDOFF-P3-P4.md` (180 lines): "the traps that cost real time this session (rebuild-after-JS-change, gateway channelId singular, message.created wrapping, invite-accept for membership, Maestro extendedWaitUntil, --no-verify), the two blocking corrections (false FR-AUTH-001 trace claim, phone layout violating FR-APP-001), per-item DoD requiring proof a test can fail, stop conditions, and a do-not-touch list."

- **Merges.** 4 merge commits: P7-05 merge, P7-06 merge, base repair merge (gateway + NFR-11), final merge. All resolve append-vs-append LOG.md conflicts as union.

- **Perturb-and-restore.** `devctl selftest` contamination was "both contamination targets also pointed at the same file." Fixed with "byte-exact backup/restore with a post-restore git-diff assertion." P2-01's chaos test "kills the socket 20× — reconnects every time."

- **--no-verify on every commit.** The missing apps/api ESLint config forces `--no-verify` universally. "tsc and the mobile gates were run manually."

- **Work salvaged, not discarded.** P0-17 "merged around the generated types and E2E flows that already lived there." probe-net.yaml retired but replaced by `devctl netcheck`. The HANDOFF explicitly transfers knowledge rather than requiring rediscovery.

## PACE

- **24 commits** in this slice.
- **2 distinct calendar days** (July 24 and 25, 2026, in -07:00).
- **Continuous burst:** from 23:04 to 02:22 — roughly 3.3 hours with no gaps longer than ~20 minutes. Commit density is highest in the first hour (5 commits 23:04–23:45, then 3 more by 00:19) and again in the final 20 minutes (7 commits 02:14–02:22).
- The quietest stretch is 01:05 to 02:01 (~56 minutes with one commit), likely a parallel-agent window where P7-05 and P7-06 were executing concurrently, producing single commits on completion rather than granular checkpoints.
