# 05 — AGENT OPERATIONS: Cadence, Debugging, Audit, Drift & Escalation

This is the process layer. It exists because the agent never does 100% of the intended work —
drift accumulates between generate and verify, gets identified in audit, and is retired in
refactor. Plan for that loop; don't be surprised by it.

## 1. The cadence (per work item)

**Inner loop (fast, every item): Generate → Verify → Audit → Refactor**
1. **Prepare**: read, in order: the work item text · its FR rows in `01` · relevant
   `contracts/` sections · `docs/capabilities/capabilities.json` entries it touches · the
   last 5 lines of `docs/DRIFT-LOG.md`. Nothing else by default (context hygiene, §6).
2. **Plan**: write the item's test list FIRST (names + `@satisfies` targets) into the test
   files as failing stubs. Test design precedes implementation — this is the V-model's left
   side folded into the block.
3. **Generate**: implement until stubs pass locally.
4. **Verify**: `devctl verify --json`; then `devctl e2e --flow <item flows>` if the item has
   flows. Mechanical; no judgment.
5. **Audit**: NEW session/context. Load only: the diff (`git diff <base>...HEAD`), the work
   item text, `templates/T2-AUDIT-CHECKLIST.md`. Answer every checklist question in writing to
   `docs/audits/<item>.md`. Found drift → `docs/DRIFT-LOG.md` (format:
   `<date> <item> <what deviated> <disposition: fixed-now|backlog|accepted>`).
6. **Refactor**: fix only what the audit flagged as `fixed-now`. Re-verify. Commit. Done.

**Outer loop (slow, per phase): Deploy → Validate.** At each phase signoff: deploy the dev
stack + release-build app to the validation emulator pair, execute the phase's demo script
(T4), run the full E2E suite ×2, run `devctl nfr`, and perform the screenshot review (§4).
The crossing point of both loops is the phase-end **drift retirement**: triage every open
DRIFT-LOG line to fixed/backlogged-with-ID/accepted-with-reason. A phase cannot sign off with
untriaged drift.

## 2. Scope discipline
Before generating, re-read the item's Out-of-Scope lines. The kitchen sink is a defect class:
if a capability is not named by an FR or the item text, it does not get built — including
"free" extras (extra endpoints, extra props, speculative abstractions, config options nobody
asked for). Log the idea to `docs/BACKLOG.md` (one line: idea, why deferred) and move on.

## 3. Debugging protocol (scientific method — mechanism, not vibe)
Trigger: any behavior that surprises you (failing test you didn't just write, flaky flow,
wrong runtime output). Then:
1. Open `docs/debug-logs/DL-<n>.md` from `templates/T1-DEBUG-LOG.md`.
2. Write the observation, then a single falsifiable **hypothesis** and its **prediction**
   BEFORE touching code.
3. Design the **one** cheapest experiment that can falsify it (a log line, a probe script, a
   narrowed test — prefer `devctl logsnap` + ws-probe over code edits).
4. Run, record the result verbatim, compare to prediction. Mismatch → new hypothesis entry;
   never edit history.
5. Only after a confirmed hypothesis: implement the fix + a regression test named
   `regression: DL-<n> …`.
Prohibited: changing two variables at once; "try this and see"; deleting a failing test to
proceed; retrying a flaky flow >2× without opening a DL. If you notice yourself explaining
away evidence, that's the tell — write it down and re-hypothesize.

## 4. Socratic audit (the judgment layer that got delegated)
The T2 checklist forces the audit session to interrogate, not agree. Core questions it must
answer with evidence (file:line or test name), never with "yes":
- Why this approach — what alternative was rejected and why?
- Which edge cases exist and which test covers each? Name the uncovered ones.
- What would falsify the claim "this item is done"? Did we run that?
- Where does this diff exceed the item's scope? (List every hunk not traceable to an FR.)
- Does any error path swallow information (empty catch, generic toast, lost request-id)?
- Did patterns drift from the codebase's established ones (state, naming, error strategy)
  established in `06-ARCH-APP.md` and prior phases?
Confident-but-wrong reasoning collapses when walked through; walking through is the audit
session's whole job. The generating session's self-assessment is never accepted as evidence.

## 5. Stop conditions & escalation (protect the schedule, not just the codebase)
Hard stops — halt the item, write `docs/escalations/E-<n>.md` (situation, DLs, options,
recommendation), do NOT push partial work to main:
- 3 consecutive falsified hypotheses on the same defect.
- The same gate fails 3× after 3 distinct fix attempts.
- A fix requires breaking a contract, a characterization test, or web-client compatibility.
- Any credential/secret/security ambiguity.
- Circular-edit detection: you are about to re-apply a change you reverted in this item.
Also stop-and-decompose (no escalation file needed): an item exceeds ~15 substantive commits
or its diff exceeds ~1500 lines — split it into sub-items `<ID>a/b/…` with their own DoD.

5.1. INCONCLUSIVE IS NOT A TERMINAL STATE. Any pre-registered check, mutation, or experiment
that cannot be executed has exactly two valid dispositions: (a) the obstacle is removed and the
check is executed, or (b) an escalation file is opened under `docs/escalations/` and all
dependent work is stopped. Source inspection, "verified correct by reading", "caught by design",
and "assertion logic confirms" are explicitly **forbidden** as evidence that a check passed.
Evidence means observed output — a test-run log, a gate JSON produced by the check itself, or
a mutation caught with a failure message naming the fault. If neither disposition (a) nor (b)
has been taken, the check is OPEN, not PASSED.

## 6. Context hygiene (counter context-rot)
One work item per session. On compaction or resumption: re-read §1.1's prepare list before
continuing — never trust a summary of a contract; open the contract. When output quality
degrades (repetition, ignoring stated constraints, re-asking settled questions): stop, commit
WIP to a branch, start a fresh session at the Prepare step. State lives in the repo (specs,
DLs, DRIFT-LOG, BACKLOG, decisions), never only in the conversation.

## 7. Bake-offs (cheap iteration, used deliberately)
Where a phase spec marks `BAKE-OFF`, implement both named variants behind the same interface
on branches `bake/<item>-a|b`, evaluate ONLY with the item's pre-registered metrics
(`devctl nfr`/bench harness), record the table in a Decision Record, delete the loser branch.
Unrequested bake-offs are scope creep.

## 8. Recurring maintenance (a Tuesday, not a heroic intervention)
Every phase includes closing item `Pn-XX audit-and-refactor`: run `devctl trace report`,
re-run full E2E ×2 for flake census (flake = same flow pass/fail across runs → open DL),
dependency audit (`npm audit`, renovate-style minor bumps only), dead-code sweep
(`ts-prune`), and DRIFT-LOG retirement per §1's outer loop.
