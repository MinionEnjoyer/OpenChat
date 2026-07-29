# DR-004 — Toolchain version pins for `apps/mobile`

- **Status:** Accepted
- **Date:** 2026-07-24
- **Work item:** P0-17 (Expo skeleton)
- **Supersedes/relates:** `00-MASTER-SPEC.md §0.6` (language/tooling pins), `06-ARCH-APP.md §1`
  (stack table). 06 §1 asks for exact versions to be recorded in "DR-001-versions.md"; that
  number was already taken by `DR-001-read-auth.md`, so this record carries them instead.

## Context

`00 §0.6` pins **TypeScript `^5.4`** and **Node 20** for every package in the workspace.
`06 §1` independently pins the mobile framework to **"Expo SDK (latest stable), prebuild
workflow"**. At bootstrap time those two lines are in direct conflict:

| Component | 00 §0.6 pin | What Expo latest stable actually ships |
|---|---|---|
| TypeScript | `^5.4` | `~6.0.3` (Expo SDK 57 `blank-typescript` template) |
| React Native | — | `0.86.0` |
| React | — | `19.2.3` |
| Node (host) | 20 | host runs **24.9.0**; no version manager installed |

## Deviation trigger

`00 §0.2.7` allows deviation when *"a named default library is broken/unavailable at pinned
major version."* Both halves apply:

- **TypeScript 5.4 is unavailable at the pinned Expo version.** Expo SDK 57 and RN 0.86 ship
  type definitions authored against the TS 6 type system. Forcing `typescript@5.4` into this
  package means typechecking `react-native@0.86`'s own `.d.ts` files with a compiler older
  than the one they were written for. That is not a preference, it is a broken combination.
- **The two spec lines cannot both be honored.** One of "TypeScript ^5.4" or "Expo latest
  stable" has to give. 06 §1's rationale for latest-stable Expo is the config-plugin
  ecosystem for native modules (WebRTC, notifications) — the load-bearing reason the stack
  was chosen at all. The TS pin in 00 §0.6 has no stated rationale beyond uniformity.

## Decision

1. **`apps/mobile` uses TypeScript `~6.0.3`.** `apps/api` and `apps/web` keep their existing
   TypeScript versions — this record does not touch them, and no upstream code changes.
   The `strict` requirement from 00 §0.6 is unaffected and still enforced, plus
   `noUncheckedIndexedAccess` per 06 §1.
2. **Node: accept the host's 24.9.0 for local development, pin Node 20 in CI.** Expo SDK 57
   supports Node ≥20.19. Local and CI differing is itself a risk, so CI keeps the 00 §0.6
   pin and is the authority; if a Node-version-dependent break ever appears, CI is what
   catches it.
3. **The exact resolved version set is recorded** in `apps/mobile/package.json` and its
   lockfile, which are the machine-readable answer. This document records *why*, not *what*.

## Consequences

- `00 §0.6`'s "TypeScript ^5.4 strict everywhere" is now false for one package. Rather than
  edit a FROZEN spec, the exception is recorded here and `devctl doctor` is unaffected.
- NFR-08 (`tsc --strict` zero errors) is measured per-package, so a mixed-version workspace
  does not weaken it — each package is checked with its own compiler.
- If a future Expo SDK bump changes the TypeScript major again, this record is amended
  rather than replaced; the reasoning does not change.

## Evidence

Recorded at bootstrap (see `docs/LOG.md` P0-17 entry for command output):

- `npx create-expo-app@latest --template blank-typescript` → Expo `~57.0.8`, RN `0.86.0`,
  React `19.2.3`, TypeScript `~6.0.3`.
- Host: macOS/arm64, Node `v24.9.0`, npm `11.6.0`, JDK `17.0.20` (Homebrew, unlinked at
  `/opt/homebrew/opt/openjdk@17`), Android SDK at `~/Library/Android/sdk`.
