tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_5hfGMhsAns0OP2lxuJUo4328`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="1-479" truncated="true">
     1│ ### 2026-07-25T09:12:35-07:00 — merge: p2-polls
     2│ FR-MSG-012 Polls — ...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_vBUiuNQ4yUuWFRCKUPdD1309`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="270-469" truncated="true" next_start_line="470">
   270│  3 files changed, 82 insertions(+), 18 deletions(-)...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: <file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="469-479" truncated="false">
   469│ 
   470│ seed.mjs: support --ids-output flag for directed fixture-id output
   471│ 
   472│  .gitignore                                         |   1 +
   473│  apps/api/test/integratio...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 15 KB · inspect with `retrieve_tool_result ref=art_call_00_1K1AtLLipDqjBjVQxxSG1223`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="30-279" truncated="true" next_start_line="280">
    30│ 
    31│ ---
    32│ 
    33│ ### 2026-07-25T09:14:3...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 15 KB · inspect with `retrieve_tool_result ref=art_call_00_aJQZvRAMDICwr2oWyfGk5550`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="60-309" truncated="true" next_start_line="310">
    60│   golden precedence table  26/26 pass — ADMINISTRATO...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 15 KB · inspect with `retrieve_tool_result ref=art_call_00_46GIAB2MoszmKx7W8Aic9422`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="88-337" truncated="true" next_start_line="338">
    88│ ---
    89│ 
    90│ ### 2026-07-25T09:34:44-07:00 —...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 13 KB · inspect with `retrieve_tool_result ref=art_call_00_DsafJvIm7F3hHb8fuv3l9418`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="127-326" truncated="true" next_start_line="327">
   127│  apps/api/src/messages/messages.service.ts         ...
tool: File (path: /tmp/retro/batches/batch-ae.md)
tool File completed: [Exact evidence retained · 6 KB · inspect with `retrieve_tool_result ref=art_call_00_9GDY2Yqdh9MDPL23JKjn6682`]

<file path="/tmp/retro/batches/batch-ae.md" total_lines="479" shown_lines="390-479" truncated="false">
   390│ 
   391│ ---
   392│ 
   393│ ### 2026-07-25T10:18:37-07:00 — docs(backlo...
## WINDOW
- **First**: 2026-07-25T09:12:35-07:00
- **Last**: 2026-07-25T10:33:52-07:00
- **Span**: 1 hour 21 minutes

## WHAT WAS BUILT
1. **Polls + Replies** — PollCreate, PollCard, voteAction, optimisticVote (FR-MSG-012); reply preview with composer chip, tap-to-jump via `?around` (FR-MSG-005).
2. **Channel permission overwrites** — Golden-table effective-permission resolver (26/26 precedence tests), Prisma migration, overwrites actually gate behavior rather than just being stored (FR-ROLE-003).
3. **Server lifecycle** — Create server, rename (MANAGE_SERVER-gated), delete-with-confirmation (owner-only), shared permission lib mirroring API (FR-SRV-002/003).
4. **Invites + member management** — Full lifecycle (create → preview → accept via deep link + manual code), JoinServerOverlay with idempotent re-accept; member list drawer with role-grouped presence-sorted display, kick/leave with permission gating (FR-SRV-006/007/008).
5. **Channel list + CRUD** — Category-collapse with device-storage persistence, voice-channel participant polling, create/edit/delete text & voice channels, reorder endpoint (FR-SRV-004/005).
6. **Roles editor (BigInt-safe)** — Role list + editor with BigInt bitfield toggles, member assignment; stopped backend from silently truncating permission bits >2^53 at persist time (FR-ROLE-001).

## FAILURES AND THEIR COST

1. **Agent step-cap exhaustion** — P7-03 "Authored across four agent runs; committed by the architect after gating, since the work kept overrunning the step cap before it could commit." Cost: **4 agent runs consumed**; architect intervention required to land the branch.

2. **Vacuous codegen drift gate** — CG1 repair: "Remove committedApi !== null escape hatch in verifyGate / Gate now FAILS (rc=1) when target file is missing." The gate was returning rc=0 on every run regardless of drift. Cost: **unknown duration of silent drift** — the gate was lying.

3. **Codegen truncated permission enum (DD-018)** — "gen.mjs now reads contracts/permissions.json and generates every permission entry instead of hardcoding only the first 8 (bits 0-7). The dropped bits — BAN_MEMBERS (8), SEND_MESSAGES (9), READ_MESSAGES (10) — are real permissions used by Phase 7 features." Cost: **3 permission bits missing from generated schema**; deviation formally logged to DRIFT-LOG.

4. **Stale schema.d.ts shadow (DD-018)** — Generator targeted deprecated `schema.d.ts` while live code used `schema.ts`. "core types hardcoded in generator, not contract-derived." Fix: 183 lines deleted (stale file), generator retargeted. Cost: **dual schema files in production**, divergence risk over unbounded duration.

5. **High-bit permissions silently masked at persist** — "servers.service.ts: stop masking permissions at persist time (was truncating to ALL_PERMISSIONS=8bits, losing high bits >2^53)." "shared API (pre-patch) returns permissions='0' for 1n<<60n input (masked by old ALL_PERMISSIONS)." Cost: **any permission bit >2^53 silently lost to 0 on write**, no error surfaced.

6. **Isolated-DB test oracles broken** — "exact-ID test oracles are DB-specific and block isolated-DB branches." P7-03's migration required an isolated DB, making "11 such failures are environmental." Later: "the hardcoded IDs in fixture-ids.json belong to a different seed run and cause 404s on other instances." Cost: **11 tests non-portable**; fixed by runtime name-based ID discovery + `--ids-output` seed flag.

7. **WS sender echo lost nonce (characterization regression)** — "Preserve nonce in WS sender echo (fixes characterization regression)." A P3-09 realtime-events change broke characterization. Cost: **regression introduced and fixed within same batch** — caught before merge to integration.

## RECURRING THEMES

- **Tests that passed while broken** — the codegen drift gate returned rc=0 with a missing target file. The `committedApi !== null` escape hatch made every run succeed regardless of state.
- **Schema duality** — two parallel schema artifacts (`schema.d.ts` / `schema.ts`) with the generator targeting the stale one. Discovered as drift, not caught by any automated gate.
- **Hardcoded magic IDs** — fixture-ids.json containing DB-specific primary keys that only match one seed run. Required two interventions: a BACKLOG entry logging the systemic issue, then a runtime name-based lookup rewrite for p7-05 and p2-16.
- **Silent data truncation** — permissions >2^53 masked to 0 at persist with no error, no warning. Pattern: a narrow constant (`ALL_PERMISSIONS=8bits`) silently capped values rather than rejecting them.

## PROCESS SIGNALS

- **Agent fan-out**: "Authored across four agent runs" (P7-03). Multiple parallel branches (p2-polls, p2-reply, p3-events, p7-overwrites, s1-server-crud, s3-invites, s4-members, cg2-permissions, s5-roles) all merging into integration in the same ~80-minute window.
- **Architect as gate-keeper**: "committed by the architect after gating" when agent step cap prevented self-commit.
- **Verification gates cited on most commits**: tsc rc=0, eslint rc=0, jest (26 suites/358 tests), codegen --check rc=0.
- **Perturb-and-restore tested** on codegen gate: "rc=0 on clean tree; rc=1 on perturbation; rc=1 on missing file" — gate was verified to actually fail when it should.
- **Merge conflicts** on shared hot-files: `strings.ts`, `ChatPane.tsx`, `ShellScreen.tsx`, `LOG.md`, `eslint.config.js` — expected in a high-fan-out merge window.
- **Drift formally logged**: DD-018 recorded to `docs/DRIFT-LOG.md`; two BACKLOG entries created for systemic issues (exact-ID oracles, hardcoded generator types).
- **Stale artifact cleanup**: `schema.d.ts` deleted (183 lines).

## PACE

24 commits. Single calendar day (2026-07-25). Intense merge burst from 10:03 to 10:10 — 7 merges/commits in 7 minutes. No gaps: continuous stream from 09:12 to 10:33.
