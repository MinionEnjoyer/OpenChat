# OpenChat — Agent Fleet Ledger

**Purpose:** single operational source of truth for native Codex agents and
CodeWhale/DeepSeek wrappers. This file survives context compaction and handoff.
The canonical project state remains `docs/PROJECT-STATUS.md`.

**Last reconciled:** 2026-07-26 23:24 PDT

## Live work

| Control plane | ID | Scope | Worktree / branch | State | Last evidence |
|---|---:|---|---|---|---|
| Codex native | `scheduler_core` | P0 atomic multi-device specification | `workflows/device-scheduler` / `main` | RUNNING | Documentation-only assignment acknowledged |
| Codex native | `scheduler_providers` | Multi-device architecture and adversarial decomposition | read-only | RUNNING | Assignment acknowledged |
| CodeWhale | `80048` | Diagnose capacity API mismatch | `device-scheduler-audit-capacity` / `audit/capacity-contract` | RUNNING | Wrapper yielded live session |
| CodeWhale | `65578` | Diagnose contention error normalization | `device-scheduler-audit-no-device` / `audit/no-device-error` | RUNNING | Wrapper yielded live session |
| CodeWhale | `71072` | Diagnose macOS process identity | `device-scheduler-audit-process-identity` / `audit/process-identity` | RUNNING | Wrapper yielded live session |
| CodeWhale | `40363` | Verify product-capabilities document | `openchat-verify-product-capabilities` / `verify/product-capabilities` | RUNNING | Wrapper yielded live session |
| CodeWhale | `27049` | Verify historical worktree inventory | `openchat-verify-worktree-inventory` / `verify/worktree-inventory` | RUNNING | Wrapper yielded live session |
| CodeWhale | `20515` | Fix verified APK build-ID false positive | `openchat-fix-build-id-extractor` / `fix/build-id-extractor` | RUNNING | Wrapper yielded live session |

## Completed outputs awaiting integration decisions

| Work | Commit | Gate / disposition |
|---|---|---|
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

- Scheduler `main` is **RED**, not releasable.
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
