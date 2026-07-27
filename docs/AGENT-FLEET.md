# OpenChat — Agent Fleet Ledger

**Purpose:** single operational source of truth for native Codex agents and
CodeWhale/DeepSeek wrappers. This file survives context compaction and handoff.
The canonical project state remains `docs/PROJECT-STATUS.md`.

**Last reconciled:** 2026-07-27 00:24 PDT

## Live work

| Control plane | ID | Scope | Worktree / branch | State | Last evidence |
|---|---:|---|---|---|---|
| CodeWhale | `52594` | Repair merged migration/parser incompatibility | `device-scheduler-bundle-parser` / `fix/bundle-migration-parser` | RUNNING | Combined gate fails 36/36 migration tests near `new`; scoped continuation dispatched |
| CodeWhale | `9665` | Implement frozen batch-capacity API | `device-scheduler-batch-capacity` / `build/batch-capacity` | RUNNING | Awaiting output |
| CodeWhale | `78728` | Observer Phase 0 calibration/goldens | `codewhale-observer-phase0` / `build/phase0-calibration` | RUNNING | DeepSeek implementation dispatched |
| CodeWhale | `64030` | Observer Phase 1 domain/projections | `codewhale-observer-phase1` / `build/phase1-domain` | RUNNING | DeepSeek implementation dispatched |
| CodeWhale | `15522` | Independent observer Phase 0 gates | `codewhale-observer-verify-phase0` / `verify/phase0-contract` | RUNNING | DeepSeek verifier dispatched |

## Completed outputs awaiting integration decisions

| Work | Commit | Gate / disposition |
|---|---|---|
| Observer review adjudication / authorization | `6144442`, `f83f870` | All 32 findings adjudicated; exact implementation baseline authorized |
| Strict bundle schema remediation | `2f427b5`, merge `2fe5bd4` | Isolated 36 migration tests passed; merged gate RED due SQL parser interaction, remediation running |
| Capacity verifier v2 | `dbb5b59` | 18 pass, 3 batch skips, 1 intentional contract failure before implementation |
| Product-capability final corrections | `4a93965` | Awaiting final independent document gate |
| Worktree inventory refresh | `86ab938` | Completed; awaiting final independent methodology gate |
| Multi-device architecture review | no commit | Complete; supplied matching, barrier, migration, cleanup, and work-split corrections to spec author |
| P0 multi-device/security specification | `a652a98` | Docs-only amendment complete; implementation and independent gates running |
| Concurrent migration safety | `6ebfd5a`, merge `529b748` | Independently gated and merged into scheduler main |
| Portable process identity | `fe37705`, merge `202f922` | 80/80 focused unrestricted tests; merged into scheduler main |
| Scheduler merged regression gate | `202f922` | 265 tests + 18 subtests passed, excluding known capacity contract collection error |
| Atomic-bundle verifier gates | `57d9864` | 72 tests authored; expected red against pre-schema implementation |
| Observer specification and plan | `a350957` | 42 acceptance criteria; two mandatory DeepSeek reviews running |
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
- Latest unrestricted audit reports 243 tests with one genuine error:
  `AdmissionResult` versus implemented `CapacityResult`.
- Sandboxed process-list failures are environment-induced until contradicted by
  an unrestricted reproduction.
- The earlier contention `StoreError` is an intermittent race hypothesis; a
  dedicated reproduction is running.
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
