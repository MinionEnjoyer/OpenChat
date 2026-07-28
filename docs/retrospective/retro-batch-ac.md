tool: File (path: /tmp/retro/batches/batch-ac.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_HtEGbKIL0ekU7qKZnnBP0047`]

<file path="/tmp/retro/batches/batch-ac.md" total_lines="335" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-25T02:23:33-07:00 — [P2-07] Markdown pars...
tool: File (path: /tmp/retro/batches/batch-ac.md)
tool File completed: [Exact evidence retained · 8 KB · inspect with `retrieve_tool_result ref=art_call_00_yjYx8hY3p9TBy5TqydP79887`]

<file path="/tmp/retro/batches/batch-ac.md" total_lines="335" shown_lines="201-335" truncated="false">
   201│  docs/LOG.md                                        |  44 ++++
   202│  9...
## WINDOW
First: `2026-07-25T02:23:33-07:00` — Last: `2026-07-25T03:18:12-07:00`
Span: **54 minutes 39 seconds**, all on a single calendar day.

## WHAT WAS BUILT
1. **Mobile messaging feature suite** (P2): markdown parser, emoji reactions with picker + reactor list sheet, message edit/delete with optimistic sync, pins panel, typing indicators — five features landing in under an hour.
2. **Server moderation infrastructure** (P7): timeout enforcement (REST + WS guarded, 28-day cap, owner-immune, Prisma migration `20260725091229_add_timeout`) and a ban system (separate migration `20260725091254_add_ban`, invite-service gating, permission bitfield addition).
3. **Jump-to-message pagination** (P2-16): `?around` query param on the messages endpoint with 173 lines of integration tests and OpenAPI contract addition.
4. **Gateway wire-shape correction** (P2-CONTRACT): `gateway-events.yaml` fixed so `message.updated` carries `{message}`, with codegen regeneration and compensating-cast removal — authored by agent O.
5. **Phone drawer a11y** (P3-T1): accessibility-correct open/closed state exposure on the mobile shell screen, including e2e flow updates.
6. **Test harness portability** (INFRA): `CHAR_WS_BASE` propagated everywhere so characterization and integration tests are not hardcoded to a single port.

## FAILURES AND THEIR COST
- **Merge kept duplicate `applyUpdated` implementations** (FIX commit, `03:06:24`): "The merge kept both applyUpdated implementations (lines ~96 and ~126), causing TS2323 + TS2393 duplicate function errors. The second definition silently shadowed the first at runtime (Jest transpiles without typechecking), so one features behaviour was dead code." Cost: one feature's behavior was **dead code at runtime** while 158 tests passed green. TypeScript errors were invisible to Jest. Resolved by delegating to `domain/reactions.mergeMessageUpdate` — 7.5-minute diagnosis window between the faulty merge (`02:58:42`) and the fix.
- **Escalation E-01** (markdown merge, `02:25:22`): "apps/web has no markdown renderer, so FR-MSG-007's 'matches web client semantics' criterion is unsatisfiable as written." No hours figure given; cost is a **blocked acceptance criterion** requiring an escalation document and LOG.md union-resolution.
- **Agent O hit step cap** (P2-CONTRACT, `03:11:13`): "Authored by agent O as Part 2 of its work order; it hit the step cap before committing." Cost: work was **uncommitted at termination** — had to be recovered and committed externally. No hours figure.

## RECURRING THEMES
- **LOG.md is a persistent merge-conflict hotspot**: nearly every merge commit note says "LOG.md union-resolved" or "resolve LOG conflicts." The file is touched in 15 of 22 commits and requires manual resolution on every integration merge.
- **ChatPane.tsx and ShellScreen.tsx are the other two conflict magnets**: they appear in merge resolution notes for reactions, editdelete, pins, typing, and drawer a11y — these two files are the shared UI surface that every mobile feature modifies.
- **Tests passed while code was broken**: "Jest transpiles without typechecking" — the duplicate-`applyUpdated` bug produced TS2323/TS2393 errors at compile time but zero test failures. The test suite gave a clean bill of health to dead code.
- **Every feature lands as at least two commits**: a substantive commit followed by a separate LOG.md append or a merge resolution. The pattern is uniform.

## PROCESS SIGNALS
- **Agent fan-out with recovery**: agent O authored the P2-CONTRACT fix as "Part 2 of its work order" but hit its step cap; the work was salvaged and committed externally, with the commit body explicitly noting the uncommitted-at-cap state.
- **Perturb-and-restore verification** ("break-proof"): the FIX commit documents: "removing `...incoming` from mergeMessageUpdate caused 3 failures across both suites (2 edit/delete + 1 reactions); restoring returned all 158 to green." This is a deliberate break-and-restore cycle used as a correctness gate.
- **Explicit gate citations**: commits name `tsc --noEmit`, `eslint --max-warnings=0`, and Jest pass/fail counts as verification evidence in the body, not just in CI.
- **Escalation as a formal artifact**: E-01 is filed as `docs/escalations/E-01-markdown-web-parity.md` — a named, traceable document rather than an inline comment.
- **Codegen discipline**: the contract-correction commit regenerated `events.d.ts` and `schema.d.ts` and verified "no codegen drift" during integration gate run.
- **Merge density**: 11 of 22 commits are merges — the merge cascade from `02:34:17` to `02:40:16` packs 6 merges into 6 minutes.

## PACE
- **22 commits** on a single calendar day (`2026-07-25`), across **55 minutes**.
- Burst 1: `02:23:33` → `02:25:46` — three commits in 2m13s (markdown + merge + around-pagination).
- Burst 2: `02:31:30` → `02:31:53` — timeout system + infra harness in 23s.
- Burst 3 (merge cascade): `02:34:17` → `02:40:16` — six merges in 5m59s.
- Burst 4: `02:51:31` → `02:58:42` — reactions landed + merged, then editdelete landed + merged (two feature integrations in 7m11s).
- Gap: `02:58:42` → `03:06:24` — 7m42s between editdelete merge and the duplicate-applyUpdated fix (diagnosis window).
- Burst 5: `03:09:37` → `03:18:12` — a11y drawer, contract fix, pins, typing, and their merges in 8m35s.

No commit gap exceeds 8 minutes. The entire window is a sustained sprint.
