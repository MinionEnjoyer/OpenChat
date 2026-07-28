tool: File (path: /tmp/retro/batches/batch-ai.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_6suQh4HVdZex3dtVR4X64974`]

<file path="/tmp/retro/batches/batch-ai.md" total_lines="291" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-25T13:36:42-07:00 — merge: med-compress (...
tool: File (path: /tmp/retro/batches/batch-ai.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_Dpt4pmuUQMcE3rq20q841754`]

<file path="/tmp/retro/batches/batch-ai.md" total_lines="291" shown_lines="201-291" truncated="false">
   201│ ### 2026-07-25T13:24:10-07:00 — FR-SOC-004: integration test — PATCH/GET ...
## WINDOW
**First**: 2026-07-25T13:19:13-07:00 (FR-SOC-004: Live presence dots)  
**Last**: 2026-07-25T13:47:33-07:00 (merge: soc-inbox)  
**Span**: 28 minutes 20 seconds, one calendar day (2026-07-25)

## WHAT WAS BUILT
1. **Live presence with OFFLINE fallback (FR-SOC-004)** — Backend INVISIBLE→OFFLINE masking in gateway relay; frontend `PresenceDot` reusable component, `StatusPicker` sending `presence.update` via gateway, zustand presence store fed by live gateway ops, `MemberList` + `MemberProfileSheet` migrated from static REST to live dots. Integration tests for `PATCH /me` → `GET /me` persistence covering all four statuses.

2. **Notification subsystem (three merges)** — Foreground notification handler with 214-line test suite; notification settings screen (`notif-levels`) adding 1,159 lines across mobile UI, API integration tests, OpenAPI contract, and codegen; notifications inbox (`soc-inbox`) with 345-line `InboxScreen`, helpers, and 160-line test suite.

3. **Friends + blocked messages (soc-friends)** — Blocked/revealed zustand stores with tests, `ChatPane` integration for blocked-message display, `PinsPanel` updates, backend `friends.service.ts` changes, and a 111-line `soc-007-blocked` integration spec.

4. **Role mention system (odds-rolementions)** — Database migration adding role-mention fields, service-layer logic in `messages.service.ts`, server controller/service updates, and a 236-line integration spec.

5. **Permission property-test hardening (FR-ROLE-002)** — Rewrote the role-permission property test that previously only validated against server-side constants, making client-side bit drift invisible. Added cross-table constant-by-constant comparison and key-set equality tests. "MANAGE_ROLES 1<<3 → 1<<13: 'every permission constant' correctly fails with 'server=8 (0x8) client=8192 (0x2000)'."

6. **Media asset contracts + service (med-assets)** — `share-assets.yaml` contract expanded by 226 lines, `share.service.ts` grew 173 lines, and a 170-line integration spec landed.

## FAILURES AND THEIR COST
1. **Permission bit drift went completely undetected by the property test** — The test "imported only `clientHasPermission`, never `ClientPermission` constants. All test cases generated perms/flags from server-side constants only — so changing a client bit value (e.g. MANAGE_ROLES 1<<3 → 1<<13) had zero effect on any assertion." The test passed while providing zero protection. No cost in hours is stated, but the falsification proof shows previously-silent failures: "Delete BAN_MEMBERS from client: 'every permission constant' + 'key sets' + behavioral test all fail" — meaning these would have passed green before the fix.

2. **Node_modules symlink tracking churn** — Three identical chore commits (13:37:11, 13:39:24, 13:40:53) each removing `apps/api/node_modules` and `apps/mobile/node_modules` symlinks from tracking. Repeated cleanup of the same artifact suggests the merge workflow kept re-adding them.

3. **Merge conflict between med-compress and notif-foreground** — Required a dedicated conflict-resolution commit for `strings.ts` ("resolve strings.ts conflicts for med-compress + notif-foreground merges").

4. **Rebase conflict requiring architect ruling** — StatusPicker (FR-AUTH-007) and PresenceDot (FR-SOC-004) collided during rebase onto integration. Resolution: "Take integration's StatusPicker.tsx (FR-AUTH-007) per architect ruling." Required manual union of exports and removal of duplicate bottom-sheet code.

## RECURRING THEMES
- **Prove-it-can-fail as standard practice** — Two commits explicitly perturb assertions, confirm the test fails, then restore: presence dot ("perturbed isOnline threshold → 4 failures, restored → green") and presence integration ("Perturbed DND assertion → 'Expected ONLINE, Received DND' → restored green"). The FR-ROLE-002 fix also includes a PROOF falsification section that does the same.

- **Branch-merge integration pattern** — Every feature arrives as a merge of a named branch into `integration`: `med-compress`, `notif-foreground`, `twodevice-rig`, `med-assets`, `odds-rolementions`, `notif-levels`, `soc-friends`, `soc-inbox`.

- **WIP checkpoint commits as resilience** — Three `wip: checkpoint before continuation` commits in ~6 minutes (13:29:50, 13:32:08, 13:35:27), suggesting an agent that snapshots state frequently before proceeding to the next step.

- **Silent test degradation caught only by deliberate hardening** — The permission property test was "green" while blind to client-side bit drift, mirroring a broader class of false-negative risk.

- **Strings.ts as a recurring conflict hotspot** — Two separate conflict resolutions touch `strings.ts`, suggesting it accumulates merge pressure when multiple feature branches add UI strings concurrently.

## PROCESS SIGNALS
- **Multi-agent fan-out** — 8 feature branches merged plus 3 WIP checkpoints plus a gate report in 28 minutes is incompatible with single-threaded sequential work. The structure strongly suggests parallel agents landing into `integration`.

- **Batched verification gate** — A single gate commit at 13:42:45 ("gate: wave4 batch-1 GREEN") with a `REPORT.md` artifact verifies mobile 34/446 tests and codegen, suggesting accumulation-then-verify rather than per-merge gating.

- **Perturb-and-restore embedded in commits** — Tests ship with proof they can fail, not just proof they pass. The perturbation is committed as part of the test design, not a one-time manual check.

- **Requirement traceability** — Commits carry `@trace` and `@satisfies` markers (FR-SOC-004, FR-ROLE-007, FR-AUTH-007), linking implementation to specification identifiers.

- **Architect governance on conflicts** — The rebase resolution cites "architect ruling" as the decision mechanism for which code to keep when two features collide, rather than leaving it to the merging agent.

## PACE
- **24 commits** in 28 minutes 20 seconds
- **1 calendar day** (2026-07-25)
- **Bursts**:
  - 13:19–13:35 (16 min): FR-SOC-004 implementation, 2 integration test commits, 3 WIP checkpoints — 6 commits
  - 13:36–13:43 (7 min): 5 feature merges, 3 chore untracks, 1 fix, 1 role-merge, 1 conflict resolution, 1 gate report — 12 commits in ~7 minutes (~1.7/min)
  - 13:45–13:47 (2 min): rebase resolution + soc-inbox merge — 2 commits
- **No gaps** — continuous, accelerating work
