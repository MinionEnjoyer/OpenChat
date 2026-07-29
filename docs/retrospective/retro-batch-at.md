tool: File (path: /tmp/retro/batches/batch-at.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_hrqZR25eiPRIG09NHbFK2412`]

<file path="/tmp/retro/batches/batch-at.md" total_lines="423" shown_lines="1-423" truncated="true">
     1│ ### 2026-07-26T20:22:00-07:00 — fix(screen-readiness): notif-settings — use...
tool: File (path: /tmp/retro/batches/batch-at.md)
tool: File (path: /tmp/retro/batches/batch-at.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_EJIm68RPiGNMTQfsfc8r4278`]

<file path="/tmp/retro/batches/batch-at.md" total_lines="423" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T20:22:00-07:00 — fix(screen-readiness)...
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_01_1JVzi8XshHGc3qHsQtIi7371`]

<file path="/tmp/retro/batches/batch-at.md" total_lines="423" shown_lines="200-423" truncated="false">
   200│  8 files changed, 599 insertions(+), 24 deletions(-)
   201│ 
   202│ --...
tool: File (path: /tmp/retro/batches/batch-at.md)
tool: File (path: /tmp/retro/batches/batch-at.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_LQX2JYq4Wh4E6uYgP5uC8366`]

<file path="/tmp/retro/batches/batch-at.md" total_lines="423" shown_lines="139-338" truncated="true" next_start_line="339">
   139│ 
   140│ Flags gap: NATIVE_REDIRECT_URI not in Zod ...
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_01_KUIQCQc4a8yUY1urWt1v2955`]

<file path="/tmp/retro/batches/batch-at.md" total_lines="423" shown_lines="339-423" truncated="false">
   339│ ### 2026-07-26T21:30:19-07:00 — T4 Phase 2 audit and signoff draft — NOT ...
## WINDOW
First: `2026-07-26T20:22:00-07:00`  
Last: `2026-07-26T21:43:33-07:00`  
Span: **1 hour, 21 minutes, 33 seconds** (all within one evening, PDT)

## WHAT WAS BUILT
1. **Screen-readiness E2E hardening** — right-drawer scrim recovery and notif-settings env-var fix.
2. **Upstream merge (89 files, +4833/-2996)** — 4 conflict resolutions crossing schema, messages, share, and auth; post-merge swagger fix, mock additions.
3. **Mobile soundboard panel** — 583 lines recovered from a 235-commit-behind branch (task #40 previously marked complete); expo-audio dependency and jest mock added.
4. **Mobile OIDC PKCE login client** — closed UNBUILT-001; the app could now log into production (previously only dev-login worked). Server-side redirect URI added to Zod validation to fail-at-boot instead of at-first-login.
5. **Evidence gatework** — `trace.mjs` grew evidence-type enforcement (194 lines), `check-unbuilt.sh` created (207 lines), `@satisfies` → `@infra` relabeling on 4 infra paths, `matrix.json` regenerated with 19 violations surfaced.
6. **Phase 1, 2, 3 T4 audits** — all NOT GRANTED; three detailed FR investigations (MSG-014, SRV-006, SRV-008); 3 misleading `@satisfies` annotations removed; 17 unannotated requirements triaged into UNBUILT backlog entries.

## FAILURES AND THEIR COST
1. **FR-AUTH-001 — app could not log into production for months**
   - *"the app could not log into any production deployment"* (21:11:39). Client half never built; server half shipped in Phase 1. Found 2026-07-25, filed UNBUILT-001 as HIGH, *"never actioned."*

2. **`trace.mjs` never checked evidence type — months of false closures**
   - *"FR-AUTH-001 ('E2E: fresh install → login') was closed for months by a server integration test proving bearer tokens via dev-login — the app could not log into production at all"* (21:19:55). 19 evidence violations surfaced after fix.

3. **Vox soundboard — 583 lines stranded, never compiled**
   - *"Never previously merged despite task #40 being marked complete — 583 lines stranded on the branch, 235 commits behind"*; *"expo-audio was imported by SoundboardPanel but never declared in any package.json — this code had never compiled"* (20:57:58). 6 suites transitively failed until mock was added.

4. **FR-MSG-014 GIF provider test — trivially passing placeholder**
   - *"Backend provider.spec.ts:512 is a trivially-passing placeholder (expect(true).toBe(true))"* (21:42:35). Mobile test structural-only, no config-gating exercised.

5. **FR-SRV-008 E2E — non-destructive, never executes the action**
   - *"only verifies button presence — explicitly non-destructive, never executes kick or leave"* (21:43:33). Secondary: `member.left`/`member.kicked` realtime events not handled in mobile client; BUG-001/BUG-002 characterization tolerance `[200,500]` still open.

6. **FR-SRV-006 E2E — flows exist but don't execute acceptance**
   - *"Screen-readiness flows exist but do not execute acceptance"* (21:42:50).

7. **Phase 2: 9 P0 blockers — same defect class repeating**
   - *"unit tests carry @satisfies for criteria demanding integration or E2E — same class of defect as UNBUILT-001 in Phase 1"* (21:30:19). 11 of 18 FRs WEAK-EVIDENCE.

8. **Phase 3: 3 P0 blockers** (FR-SRV-006, FR-SRV-008, FR-ROLE-001) + 5 WEAK-EVIDENCE of 11 FRs.

9. **Phase 1: 3 P0 blockers** — FR-AUTH-001, FR-AUTH-006, FR-APP-003.

10. **3 misleading `@satisfies` annotations removed** — FR-APP-005 (invite half only), FR-SOC-006 (no avatar/actions) (21:22:05).

11. **Agent killed by host OOM** — trace gate work *"Salvaged from an agent killed by a host OOM before it could commit"* (21:19:55).

12. **Agent hit step cap** — PKCE client *"Salvaged from an agent that hit its step cap before committing"* (21:11:39).

No dollar or hour figures quoted; costs are stated as functional impacts (months of false evidence, never-compiled code, trivially-passing tests).

## RECURRING THEMES
- **Silent gate degradation**: `trace.mjs` exited 1 only for missing `@satisfies` — never checked whether evidence matched criterion type. Gates were green for months while the app couldn't log in. This repeats: *"same class of defect as UNBUILT-001"* across Phases 1, 2, and 3.
- **Work marked complete that wasn't**: Task #40 (soundboard) *"marked complete"* but *"never previously merged"* — *"this code had never compiled."* UNBUILT-001 filed 2026-07-25, *"never actioned."*
- **Trivially-passing / structural-only tests masquerading as evidence**: `expect(true).toBe(true)`, Modal DOM nesting tests that skip config-gating, E2E flows that *"never executes kick or leave."*
- **E2E flows as window-dressing**: Screen-readiness flows *"do not execute acceptance"* (SRV-006); *"explicitly non-destructive"* flows that verify button presence but not behavior (SRV-008).
- **Misleading annotations**: 3 `@satisfies` removed in one triage pass — each claiming coverage for requirements only partially fulfilled.

## PROCESS SIGNALS
- **Agent fan-out**: 8 feature branches merged within the 81-minute window (`sweep-b`, `vox-soundboard`, `auth-prod`, `mobile-pkce`, `unclaimed-triage`, `signoff-p1`, `signoff-p2`, `signoff-p3`). Co-Authored-By: Claude Opus 5 on 3 commits.
- **Work salvaged from failed agents**: 2 commits explicitly *"salvaged"* — one from OOM kill, one from step-cap exhaustion.
- **Perturb-and-restore**: Used on `check-unbuilt.sh` (*"fake UNBUILT-999 exits 1, removed exits 0"*).
- **Verification gates exercised**: Build (PASS), API jest (53/53), mobile typecheck (CLEAN), mobile tests (92 suites, 892 pass, 2 skipped), `check-orphans.sh` (EXIT 0), trace gate with new evidence-type enforcement, `check-unbuilt.sh` gate. API boot without FCM CONFIRMED.
- **Formal signoff process**: T4 audit + signoff documents for Phases 1–3, all NOT GRANTED, with cross-referenced FR investigations and P0 blocker enumeration.
- **Backlog discipline**: UNBUILT tracker with RESOLVED markers, automated gating via `check-unbuilt.sh`, trace matrix regenerated after each evidence change.

## PACE
- **Commits**: 22 (including merges)
- **Calendar days**: 1 (2026-07-26)
- **Bursts**: 5 commits in first 40 min (20:22–21:02); 12 commits in a 19-minute sprint (21:11–21:30, 8 of them merges); 3 investigation commits in final 13 min (21:42–21:43)
- **Longest gap**: ~9 minutes (21:30:44 → 21:42:35)
- No significant pauses — the entire window is one continuous high-intensity session
