tool: File (path: /tmp/retro/batches/batch-as.md)
tool File completed: [Exact evidence retained · 10 KB · inspect with `retrieve_tool_result ref=art_call_00_RIk0FccNVZqrmgU9yUpG9684`]

<file path="/tmp/retro/batches/batch-as.md" total_lines="295" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T19:40:24-07:00 — fix(presence): hardco...
tool: File (path: /tmp/retro/batches/batch-as.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_KBtnIpQeTD25bBthfAM86933`]

<file path="/tmp/retro/batches/batch-as.md" total_lines="295" shown_lines="201-295" truncated="false">
   201│ 
   202│ ---
   203│ 
   204│ ### 2026-07-26T20:06:45-07:00 — fix: replac...
## WINDOW
2026-07-26T19:40:24-07:00 → 2026-07-26T20:15:58-07:00. Span: **35 minutes 34 seconds**, all on a single calendar day.

## WHAT WAS BUILT
1. **Upstream alignment assessment** — divergence report (27 routes added, 1 collision, 0 breaks), merge plan with conflict inventory and auth UNION assessment, drift triage (28 buckets: A=0, B=4, C=24, D=1), upstream proposal for 4 Bucket-B items, and an adoption guide documenting 11 features with request/response shapes derived from actual controller code.
2. **Message search contract adoption** — retired the project's custom `/channels/{id}/search` and `/servers/{id}/search` endpoints; adopted upstream `GET /channels/:id/messages/search`; removed 347 lines, added 74 across controller, service, tests, and OpenAPI.
3. **Verification gate hardening** — wired `check-orphans.sh` as gate 8 in `devctl verify`; fixed `check-unreachable.sh` barrel-import false-positive that had left 15/16 features unguarded.
4. **E2E runner reliability** — fixed `$?` clobber in both `e2e-run-only.sh` and `e2e-shard.sh` where shell arithmetic silently swallowed maestro exit codes, causing all non-timeout flows to report PASS regardless of actual outcome.
5. **E2E flow fixes** — attach-picker cold-start invite overlay dismissal; right-drawer left-drawer scrim dismissal before members-toggle.

## FAILURES AND THEIR COST
- **E2E runner exit-code clobber**: "Every non-timeout flow was therefore always reported as PASS — actual maestro failures vanished silently." Root cause: commit `a46874f`. No explicit hour figure; the cost is that *all* non-timeout E2E verdicts were fabricated for the entire period since that commit landed.
- **Unreachable gate barrel-import false-positive**: "15 of 16 features were completely unguarded. Only channels/ (the sole feature without an index.ts) was actually checked." The `\bindex\b` grep matched "everywhere" — import paths, variable names, comments — marking every barrel-bearing feature's entire export surface as reachable through a bogus bridge. No explicit hour figure; cost is that the unreachable-code gate was a no-op for 93% of features for its entire lifetime.
- **Stale port default in presence integration test**: no cost figure stated; described as "no product bug, no missing state" — a config drift with no runtime impact.
- **Wasted commit**: right-drawer `_login.yaml` prepend committed at 20:06:45, reverted at 20:07:59 — wrong fix, promptly discarded.

No cost figures in hours, runs invalidated, tests faked, or incidents are quoted in any commit message. All cost is described qualitatively.

## RECURRING THEMES
- **Silently broken verification infrastructure**: two independent gates (E2E runner, unreachable check) both produced confident "all clear" signals while failing at their actual purpose. In both cases the root cause was a trivial shell-scripting error (`$?` clobber, `\bindex\b` over-match) that went undetected.
- **Work redone**: the right-drawer readiness flow was fixed, reverted, then fixed differently 8 minutes later with a different approach (scrim dismissal instead of login prepend).
- **Doc-authoring as first-class output**: four substantial doc commits (divergence, merge plan, drift triage + proposal, adoption guide) totaling ~2,000 lines in 35 minutes, all produced before code changes to align with upstream.

## PROCESS SIGNALS
- **Branch-per-task merges**: 10 named branches merged: `presence-fix`, `search-path`, `drift-triage`, `divergence-report`, `merge-dryrun`, `gatewire2`, `runner-timeouts`, `adoption-guide`, `unreachable-fix`, `sweep-a`.
- **Agent co-authorship**: Claude Opus 5 credited on merge plan and adoption guide schema resolution.
- **Perturb-and-restore verification**: both `check-unreachable` and `check-orphans` gates proven by removing an import/screen reference, confirming exit 1, then restoring and confirming exit 0.
- **Synthetic E2E testing**: the runner fix was verified with a 3-state test ("fixed", "reverted", "restored") that required no device — just shell-assertion validation.
- **Revert workflow**: commit `7c86630` reverted cleanly within ~2 minutes of landing.
- **Schema verification against origin/main**: the 3 UNVERIFIED claims in the adoption guide were resolved by checking `apps/api/prisma/schema.prisma` on `origin/main`.

## PACE
- **24 commits** (14 substantive, 10 merges), all on **1 calendar day** (2026-07-26).
- Wall-clock span: **35.5 minutes** — one commit every ~89 seconds on average.
- **Merge bursts**: 4 merges at 19:45:01 (same second), 2 merges at 19:48:12 (same second), suggesting batch-integration.
- **Longest gap**: ~8.5 minutes between the adoption guide (972 lines authored) and the next commits — consistent with doc-generation time.
- No gaps >10 minutes. Sustained, rapid-fire output throughout.
