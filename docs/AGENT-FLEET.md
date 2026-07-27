# OpenChat — Agent Fleet Ledger

**Purpose:** single operational source of truth for native Codex agents and
CodeWhale/DeepSeek wrappers. This file survives context compaction and handoff.
The canonical project state remains `docs/PROJECT-STATUS.md`.

**Last reconciled:** 2026-07-27 00:38 PDT — scoped Codex tool work resumed; heartbeat remains paused

## Live work

| Control plane | ID | Scope | Worktree / branch | State | Last evidence |
|---|---:|---|---|---|---|
| CodeWhale | `20550` | Observer Phase 1 domain/projections continuation | `codewhale-observer-phase1` / `build/phase1-domain` | RUNNING | Checkpoint-first continuation |
| CodeWhale | `54887` | Independent observer Phase 0 gates continuation | `codewhale-observer-verify-phase0` / `verify/phase0-contract` | RUNNING | Checkpoint-first continuation |
| CodeWhale | `18260` | Atomic bundle store APIs | `device-scheduler-v2-bundle-store` / `build/v2-bundle-store` | RUNNING | Fresh current-main worktree |
| CodeWhale | `42233` | Pure complete bundle matching | `device-scheduler-v2-matching` / `build/v2-matching` | RUNNING | Fresh current-main worktree |
| CodeWhale | `47262` | Controlled subprocess boundary G16 | `device-scheduler-v2-process-boundary` / `build/v2-process-boundary` | RUNNING | Fresh current-main worktree |
| CodeWhale | `88753` | Transcript-safe output boundary G17 | `device-scheduler-v2-transcript-output` / `build/v2-transcript-output` | RUNNING | Fresh current-main worktree |
| CodeWhale | `67830` | Local scheduler dashboard | `device-scheduler-dashboard` / `build/local-dashboard` | RUNNING | Loopback/pseudonymous GUI with cancel seam |
| CodeWhale | `38158` | Independent dashboard verifier | `device-scheduler-dashboard-verify` / `verify/local-dashboard` | RUNNING | Failure/security/UX gates |

## Completed outputs awaiting integration decisions

| Work | Commit | Gate / disposition |
|---|---|---|
| Scheduler migration parser repair | `f08c456`, integrated `fee5f65` | Independent focused gate 76/76 passed |
| Observer Phase 0 calibration/goldens | `fec3b75` | Independent contract gate 60/60 passed; awaiting merge with verifier |
| Capacity verifier contract remediation | `06bf9aa` | 22/22 pass against capacity implementation; not yet integrated |
| Product-capabilities final audit | `5b7f2a7` | 37 PASS / 2 DRIFT; substantive disputed claims pass |
| Observer review adjudication / authorization | `6144442`, `f83f870` | All 32 findings adjudicated; exact implementation baseline authorized |
| Strict bundle schema remediation | `2f427b5`, merge `2fe5bd4` | Isolated 36 migration tests passed; merged gate RED due SQL parser interaction, remediation running |
| Capacity verifier v2 | `dbb5b59` | 18 pass, 3 batch skips, 1 intentional contract failure before implementation |
| Batch-capacity implementation | `928de8d`, merge `638356d` | Initial combined gate 54/55; verifier remediation `06bf9aa` passes 22/22 and awaits integration |
| Product-capability final corrections | `4a93965` | Final audit `5b7f2a7`: 37 PASS / 2 non-substantive drift |
| Worktree inventory refresh | `86ab938` | Completed; awaiting final independent methodology gate |
| Multi-device architecture review | no commit | Complete; supplied matching, barrier, migration, cleanup, and work-split corrections to spec author |
| P0 multi-device/security specification | `a652a98` | Docs-only amendment complete; implementation and independent gates running |
| Concurrent migration safety | `6ebfd5a`, merge `529b748` | Independently gated and merged into scheduler main |
| Portable process identity | `fe37705`, merge `202f922` | 80/80 focused unrestricted tests; merged into scheduler main |
| Scheduler merged regression gate | `202f922` | 265 tests + 18 subtests passed, excluding known capacity contract collection error |
| Atomic-bundle verifier gates | `57d9864` | 72 tests authored; expected red against pre-schema implementation |
| Observer specification and plan | `a350957` | Reviewed, adjudicated, and superseded by authorized baseline `6144442` / `f83f870` |
| Capacity contract diagnosis | `6248e51` | Confirms verifier/API mismatch plus real count/floor gaps; needs spec adjudication |
| Cold-start contention diagnosis | `dd8b5c4` | Confirms concurrent migration race; remediation recommendation needs architecture review |
| Process identity diagnosis | `cb2cbde` | Confirms locale-dependent `ps lstart`; needs portable implementation and independent gate |
| Product-capabilities verification | `b4a1e69` | Mostly accurate; 15 discrepancies and material feature understatements require correction |
| Worktree-inventory verification | `e421095` | Partial pass; stale count and ACTIVE-process methodology require refresh |
| Build-ID extractor remediation | `b4d689d` | Independent rerun: baseline 9/9 and adversarial 18/18 pass |
| Build-ID implementation | `9b96793` | PARTIAL; verifier found key-as-value false positive |
| Build-ID independent verification | `0ca281f` | 25/26 assertions; remediation running |
| Product-capabilities document | `85bebc0` | Independent verification running |
| Worktree inventory | `e043bd0` | Independent verification running; no deletion authorized |
| Remove generic Android driver | `0fa5667` | 145 branch-local tests pass; needs current-main regate |
| Schema hardening | `695a4c4` | 146 branch-local tests pass; needs current-main regate |
| Android readiness verifier | `1c4f8b2` | 19 focused tests pass; needs integration |
| Provenance verifier | `2c83495` | 9 focused tests pass; needs integration |
| Lifecycle verifier | `becbd68` | 30 focused tests pass; documents remaining lifecycle gaps |
| Store stress tests | `a24cd0d` | 44 branch-local tests pass; needs integration |
| CLI contract verifier | `9648409` | Expected red: 31 pass, 2 fail, 4 skip; CLI not built |
| Schema audit | `4317ddf` | Ready for review |
| Secret-boundary audit | `17e756c` | Requires G13/G14 decision before CLI/run exposure |

## Current gate truth

- Scheduler `main` is **RED**, not releasable: merge `2fe5bd4` exposes a
  transaction-runner SQL parsing incompatibility (`36` migration errors).
- Capacity implementation is integrated; corrected independent verifier passes
  22/22 on `06bf9aa`, not yet integrated. Two legacy measurement-key tests
  remain to adjudicate.
- Sandboxed process-list failures are environment-induced until contradicted by
  an unrestricted reproduction.
- The earlier contention `StoreError` was confirmed and fixed at `529b748`;
  pre-bundle merged regression passed 265 tests plus 18 subtests.
- Multi-device atomic checkout and synchronized execution are now owner-declared
  **P0** and are being added to the approved scheduler contract.

## Monitoring rules

1. Never infer global idleness from the OpenChat `fleet-health.sh` registry;
   scheduler wrappers are independently dispatched.
2. Poll wrapper session IDs directly. If unavailable, use log mtime/tail,
   branch tip, worktree status, and test artifacts.
3. A wrapper exit code of zero is not acceptance. Inspect its diff and run an
   independent gate.
4. Update this ledger whenever a job is dispatched, completes, stalls, is
   continued, merged, or rejected.
5. Do not delete a worktree merely because its job completed.
