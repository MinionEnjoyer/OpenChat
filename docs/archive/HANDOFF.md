# Handoff — historical snapshot

> **This file is stale and retained for historical context.**
> The canonical cross-tool handoff and live state is
> [`docs/PROJECT-STATUS.md`](./PROJECT-STATUS.md). Read and update that file
> instead. `docs/PRIORITIES.md` remains authoritative for standing owner
> priorities and scope decisions.

For a session starting cold. Read `docs/PRIORITIES.md` first — it is the authoritative
ordering and it comes from the project owner.

## Your role

You are the **architect**. You do not write product code. You write work orders, dispatch
agents, run gates, adjudicate findings, and merge. The method — including the verification
model and a long list of traps that each cost real time to discover — is in:

    ~/workspace/workflows/codewhale-fanout/
      README.md         orientation
      ARCHITECT.md      the operating contract
      VERIFICATION.md   the inverted trust ladder; READ THIS BEFORE GATING ANYTHING
      TRAPS.md          20+ gotchas, all learned the hard way
      common-rules.md   preamble prepended to every work order
      scripts/          dispatch.sh, new-worktree.sh, gate.sh

Dispatch agents as **tracked background tasks** (one tool call per agent), never with a raw
`nohup … &` — untracked agents are invisible to the user and produce no completion
notifications.

## Where the work lives

    /Users/williambsexton/work/oc-integration     ← the integration branch worktree. Merge here.
    /Users/williambsexton/work/OpenChat           ← the main repo (worktrees are cut from it)
    /Users/williambsexton/work/openchat-*         ← per-agent worktrees

Cut every agent branch from `integration`, never from a stale base.

## Current state — all gates green (verified 2026-07-25 ~11:20)

| Gate | Result |
|---|---|
| mobile jest | 30 suites / 405 tests |
| mobile tsc / eslint | rc=0 / rc=0 |
| api integration | 13 suites / 87 tests |
| api characterization (regression net) | 11 suites / 89 tests |
| api tsc / eslint | rc=0 / rc=0 (48 tracked `any` warnings) |
| codegen drift | rc=0 |

**Those counts are the baseline. A lower count is a partial run = FAILURE, not a pass.**

47 of 74 FRs implemented. Remaining set is in `docs/PRIORITIES.md`.

## How to bring the environment up

Docker Desktop must be running (`open -a Docker`), then the dev stack containers
(chat-dev-postgres, chat-dev-redis, chat-dev-api, chat-dev-openshare, chat-dev-livekit).

To gate merged code, run the API **from the merged worktree on its own port** — port 3001 is
the *containerized* API running a stale image, and gating against it silently tests the wrong
binary (this actually happened):

    cd /Users/williambsexton/work/oc-integration/apps/api
    npx prisma generate                 # REQUIRED after merging any migration-bearing branch
    API_PORT=3030 DEV_AUTH=1 NODE_ENV=development npx nest start

`DEV_AUTH=1` and `NODE_ENV=development` must be passed **in the shell** — the `.env` file
does not reach `process.env` for them, and without it `/auth/dev-login` returns 404 and the
whole characterization suite fails misleadingly.

Then set BOTH env vars for tests — setting only one silently points half the suite elsewhere:

    export CHAR_API_BASE=http://localhost:3030/api CHAR_WS_BASE=ws://localhost:3030/ws

Fresh worktrees have no `.env` (gitignored): `cp ../../../oc-integration/apps/api/.env .`

Android: `source tools/env.sh` for JAVA_HOME/ANDROID_HOME, and add
`$ANDROID_HOME/platform-tools` to PATH for `adb`. Emulator AVD: `OpenChat_Pixel6a_API34`.
Native builds are the ARCHITECT's job — the agent loop-detector kills long builds.

## Open items

1. **FR-ROLE-002** — 1000-case property test proving the client permission calculator agrees
   with the server lib verbatim. Outstanding; blocks Phase 3 signoff.
2. **Phase 1/2/3 signoffs** — only Phase 0 is signed off (`docs/signoffs/`). Merged, gated
   work exists for 1–3 but the T4 judgment gates and drift triage have not been run.
3. **Two-device testing** — never done. Server-side fan-out IS covered (the realtime suites
   open sockets for alice and bob), but two app instances have never run together. Required
   before any voice work.
4. **E-01 escalation** (`docs/escalations/`) — FR-MSG-007 requires markdown "matching web
   client semantics" but `apps/web` has no markdown renderer, so the criterion is
   unsatisfiable as written. **Needs the owner's decision — do not guess.**
5. **CI has never executed.** `.github/workflows/ci.yml` exists; nothing has been pushed.
6. **Composer focus under adb** — during device testing the message composer would not take
   focus via `adb shell input tap`, so the send round-trip was not completed on the emulator.
   The owner has sent messages successfully on a real device, so this is plausibly an
   emulator input quirk. UNVERIFIED either way — do not report it as a product bug without
   measuring, and do not report it as fine.

## Hard-won lessons that will bite a fresh session

- **Five vacuous gates have been found in this project** — checks that reported success while
  verifying nothing (see DD-017 through DD-021 in `docs/DRIFT-LOG.md`). When a gate passes,
  ask what would have made it fail. When a gate fails, first suspect the gate.
- **The oracle must be independent of the code under test.** An agent "fixed" the search
  tests by deriving expected results from the search endpoint itself — 76 tests passing while
  asserting search agrees with itself. Rejected; see DD-020.
- **Agents hand-edit generated files.** `apps/mobile/src/api/schema.ts` is GENERATED from
  `contracts/openapi.yaml`. Three separate agents hand-edited it. The codegen gate catches
  this now — run `node tools/codegen/gen.mjs --check` on every branch AND on the merge.
- **Gate the MERGED result, not just branches.** A branch can pass with its own stale copy of
  a gate and fail the moment it lands. This happened.
- **Diff forbidden paths.** `apps/api/src/auth/`, `apps/web/`, `specs/`, and
  `apps/api/test/characterization/` are off-limits to agents. One agent edited auth anyway.
  `git diff integration --stat -- apps/api/src/auth/` must be empty.
- **~50% of dispatches hit the step cap** with work intact but uncommitted. Re-dispatch as a
  continuation saying "your work is INTACT, do not restart it", and paste forward anything
  the dead run already established.
- **Disk fills.** Each pre-warmed worktree is ~750 MB; hitting 100% breaks the harness itself
  (tool calls fail before running). Reap merged worktrees as part of merging:
  `git branch --merged integration`, then `rm -rf` the tree and `git worktree prune`.
- **Never commit `tools/seed/fixture-ids.json`** from an agent branch — it describes the
  shared stack, and it is already known to be stale relative to the live DB (DD-019).
