tool: File (path: /tmp/retro/batches/batch-aa.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_XwmMhJ0kKnDBIei1zcl19815`]

<file path="/tmp/retro/batches/batch-aa.md" total_lines="321" shown_lines="1-321" truncated="true">
     1│ ### 2026-07-20T22:28:17-07:00 — [P0-01] Initialize mobile workspace: specs ...
tool: File (path: /tmp/retro/batches/batch-aa.md)
tool: File (path: /tmp/retro/batches/batch-aa.md)
tool: File (path: /tmp/retro/batches/batch-aa.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_hhVyOtVIPT7YuumbBjsh8884`]

<file path="/tmp/retro/batches/batch-aa.md" total_lines="321" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-20T22:28:17-07:00 — [P0-01] Initialize mo...
tool File completed: [Exact evidence retained · 8 KB · inspect with `retrieve_tool_result ref=art_call_01_zd4S2M1jdc33yctN6Yan1930`]

<file path="/tmp/retro/batches/batch-aa.md" total_lines="321" shown_lines="200-321" truncated="false">
   200│ - 2 were response shape mismatches: /notifications returns {friendRequest...
tool File completed: <file path="/tmp/retro/batches/batch-aa.md" total_lines="321" shown_lines="none" truncated="false">

[NO CONTENT] start_line 400 is beyond total_lines 321.
</file>
## WINDOW
- **First**: 2026-07-20T22:28:17-07:00
- **Last**: 2026-07-24T19:41:38-07:00
- **Span**: 3 days, 21 hours, 13 minutes (2 calendar days active: Jul 20–21, Jul 24)

## WHAT WAS BUILT
1. **Characterization test suite** — 84 tests across 11 suites covering all routes from 03-CONTRACTS.md §2, with exhaustive shape assertions and a mutation matrix (5/5 mutations caught). Zero production-code changes.
2. **Contract-validated provider rebuild** — Replaced manual `toHaveProperty` assertions with ajv schema validation (`additionalProperties: false`), diagnosing and fixing 14 failures including a systemic logout cookie leak.
3. **`devctl` toolchain** — Single CLI covering doctor, verify (layered gates), capabilities validation, selftest (deliberately breaks one thing per layer), trace, seed, and device management, with JSON output and full README.
4. **Maestro emulator rig** — Two-emulator setup (Pixel 6a API 34), `device-up.sh` with host-aware detection, `prove-rig.sh`, and proven L4/L7 connectivity (ping + HTTP observed on API logs).
5. **Phase-gate mechanism** — Dynamic `.phase` file gating, contamination sweep detecting XML artifacts in git hooks (4th vacuous gate caught), and trace tool with `@satisfies` annotation enforcement.
6. **Spec and decision scaffolding** — Phase specs (P2–P8), template pack (debug log, audit checklist, decision record, signoff), DR-002 (OIDC config rewrite), DR-003 (iOS Simulator decision), and HITL-0 release doc.

## FAILURES AND THEIR COST
No explicit cost figures (hours, runs invalidated, incidents) are stated in any commit in this slice. The failures are named and described, but costs are not quantified in the commit bodies.

Failures named:

- **Logout cookie leak** (P0-09): "logout test destroyed alice session, never restored it" — caused 10 of 14 test failures downstream.
- **Vacuous gate** (P0-09, repeated P0-12): `devctl verify` was passing without actually running its layers. "devctl verify now shifts before cmd_verify so layers actually run." By P0-12 this was the *4th* instance: "4th vacuous gate — XML artifacts in hooks."
- **Overclaimed coverage** (P0-05): "5 overclaimed routes → present with tests" — routes were marked as tested in `capabilities.json` but no test existed.
- **MUT2 hole** (P0-04, P0-05): `thumbnailUrl` included in seed body prevented the rename-mutation from actually failing. "remove thumbnailUrl from attachment seed so rename failure names the field."
- **assertChannelShape unreachable** (P0-04 verification): A shape assertion was dead code — wired but could never execute.
- **MUT3 catch mechanism mischaracterized** (P0-04 verification): The mutation test claimed to catch something it wasn't actually catching.
- **Contract-implementation mismatches** (P0-09): `/config` requiring auth (contract said no auth, server had SessionGuard), response shape mismatches on `/notifications` and `/friends/requests`, and a member-count assumption (bob added as PENDING, counted as member).

## RECURRING THEMES
- **Vacuous gates** — Gates that pass without actually testing anything. Found 4 times in this slice: `devctl verify` no-op, then XML artifacts in git hooks. Each time the fix was: make the gate *provably breakable* (deliberately break one thing, assert exit 1).
- **Silent test corruption** — The logout cookie leak is the starkest: 10 tests passed but were running against a corrupted session. None of them detected it. The fix was ajv schema validation (`additionalProperties: false`) so missing auth headers would fail loudly.
- **Overclaimed / under-tested** — Tests that "covered" routes without actual assertions (P0-05 overclaimed), shape assertions that were wired but unreachable (P0-04 verification), and mutations that passed because the seed data hid the mutation (MUT2 thumbnailUrl).
- **Contract as ground truth, server wins ties** — Repeated pattern: when contract and implementation disagree, the commit notes it explicitly ("server has SessionGuard, contract was wrong — server wins") and the contract gets corrected.

## PROCESS SIGNALS
- **Perturb-and-restore is canonical**: Mutations (MUT1–MUT5) deliberately break one layer and assert nonzero exit. `devctl selftest` "breaks one thing per layer (doctor, contract, char) and asserts nonzero exit." `prove-contract-gate.sh` uses the same pattern.
- **Verification is layered**: doctor → contract → characterization, each gated independently in `devctl verify`. The `--json` flag enables machine-readable evidence.
- **Contamination is a named threat class**: `devctl doctor` has a contamination check; git hooks are scanned for XML artifacts; "hooks proven clean-clone" is a claim in P0-12.
- **No reverts visible** in this slice. No merges visible. No explicit agent fan-out or worktree references in commit messages.
- **Work salvaged**: P0-04 verification RETURN entry (assertChannelShape fixed and rewired in v3); P0-09 "all 14 failures diagnosed and fixed" rather than discarded.
- **Scaffolding removed**: "FR-MSG-012 scaffolding removal" in P0-13.

## PACE
- **21 commits** in the slice.
- **3 distinct calendar days**: Jul 20 (3 commits), Jul 21 (15 commits), Jul 24 (3 commits).
- **Jul 21 burst**: 15 commits from 00:00 to 23:54 — a near-continuous ~24-hour session. Highest-density window: 18:11–23:54 (11 commits in <6 hours).
- **Jul 22–23 gap**: Two full calendar days with zero commits. Resumes Jul 24 at 19:32 with the P0-15 emulator-networking series (3 commits in 10 minutes).
