# Agent Development Contract

This contract is model- and vendor-neutral. The `.agentflow/agentflow.py` state
machine is authoritative; chat summaries and self-reported completion are not.

## On entry

1. Run `python3 .agentflow/agentflow.py reconcile`.
2. Run `python3 .agentflow/agentflow.py status`.
3. Read the queued work item and the project sources it names.
4. Do not start unregistered work.

## Work partition

- One work item has one deliverable and one kind: `implementation`,
  `diagnostic`, `verification`, or `audit`.
- Diagnostics measure only. They do not edit.
- Implementation ends at code, deterministic local tests, and a commit. It
  cannot reserve a `device:*` resource.
- Device/runtime proof is a separate verification item.
- Verification names the successful implementation run it checks. The author
  and verifier must have different stable agent identities.
- One active run owns one worktree. One exclusive resource has one active owner.

## Execution

- Orchestrators launch any vendor CLI through:
  `python3 .agentflow/agentflow.py supervise ... -- <agent command>`.
- The supervisor writes the run record before spawning, heartbeats while alive,
  captures stdout/stderr outside `/tmp`, and writes a terminal manifest.
- Long work must produce committed checkpoints. Uncommitted work is not durable.
- Stop after three falsified attempts. Enqueue a diagnostic or escalation
  instead of continuing to guess.
- Keep eligible non-device work saturated while device work is queued.

## Evidence

- A claim is evidence only when it points to a gate receipt, run manifest,
  observed runtime artifact, or independently derived oracle.
- Export the ledger before cleanup. Retire obsolete work with a tombstone; do
  not delete its work item, runs, receipts, events, or terminal manifests.
- Never infer PASS from missing output, a skipped/reached subset, a partial test
  count, or a process exit without a terminal receipt.
- Record dispatched/reached/passed/failed/skipped totals explicitly.
- Derive contracts and expected values from producing sources.
- A test must be observed failing under a relevant negative control before its
  gate can become trusted.

## Gates

- New or changed gates are `PROBATION`; they report but are not trusted blockers.
- Promotion requires one caught negative control plus two passing
  positive/baseline runs for the same gate version.
- A false positive, silent omission, or invalid oracle requires quarantine.
- Run trusted gates against the merged result before delivery.
- UI flows enter the trusted suite only after traversal on the real interface,
  stable test identifiers, isolated state, exact build provenance, and a
  requirement-level assertion.

## Completion

Completion requires:

1. a terminal run manifest;
2. independent verification linked to each successful implementation run;
3. the requested deliverable committed in a clean worktree;
4. relevant trusted gates passing on that exact merged commit;
5. every unexecuted check marked OPEN or escalated;
6. no stale run, worktree collision, resource collision, or queued work.
