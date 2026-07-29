# Audit — <work item ID>

Auditor context rule: fresh session; inputs = diff, work-item text, this checklist only.
Every answer requires evidence (file:line, test name, devctl output). "Looks fine" is not an
answer. Output file: docs/audits/<item>.md. Verdict options per question: PASS / DRIFT
(log it) / BLOCK (return to refactor).

1. Scope: list every hunk in the diff and the FR/work-item line it serves. Hunks with no
   line = drift (kitchen sink, speculative abstraction, drive-by refactor).
2. Test honesty: for each `@satisfies` added, does the test actually exercise the acceptance
   criterion from `01`, or does it test the implementation's happy path? Name one input that
   would pass the test but violate the requirement — if you can, the test is weak: DRIFT.
3. Socratic pass — answer, don't nod:
   - Why this approach? What was the rejected alternative and its concrete downside?
   - Which edge cases exist (empty, max, concurrent, offline, permission-denied, unicode)?
     Map each to a covering test or mark uncovered.
   - What would falsify "this item is done"? Was that check run?
4. Error paths: any swallowed error, empty catch, toast-without-requestId, or retry loop
   without cap?
5. Consistency: naming, state placement, query keys, event handling — does anything deviate
   from `06-ARCH-APP.md` patterns or from how the previous phase did it? (Cross-session
   drift is the expected failure mode; hunt it specifically.)
6. Contracts: does the diff change any wire behavior not reflected in `contracts/` +
   CHANGELOG? Is everything additive?
7. Compatibility: backend touched → did web-smoke + characterization run in this CI round?
8. Security/secrets: new env vars documented in `.env.example` with CHANGE_ME? Any credential
   in code/logs/fixtures?
9. Legibility: could the next fresh session understand this from repo alone (docs updated,
   non-obvious decisions commented with spec refs)?

10. Non-execution audit: List every check in this item that did not execute. For each,
    which of the two valid dispositions was taken (per 05 §5.1)? (a) obstacle removed and
    check executed, or (b) escalation file opened and work stopped? If neither, the check
    is OPEN, not PASSED.

Disposition summary → DRIFT-LOG lines appended: <list or "none">
