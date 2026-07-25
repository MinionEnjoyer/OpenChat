# DR-003 — iOS Simulator validation lane

**Date:** 2026-07-24  
**Status:** accepted  
**Blocks:** P0-17 (mobile project scaffold)

## Context

The developer machine is macOS 15.2 / arm64 (Apple Silicon) with 48 GB RAM, Docker Desktop
28.3.0, and the full Android toolchain installed (emulator 36.6.11, arm64-v8a API 34 system
image, Maestro 2.7.0). Both the Docker dev stack and the two-emulator Android rig are proven
on this host.

Xcode is **not yet installed** (Command Line Tools only — `xcodebuild` and iOS Simulator are
unavailable). The 17-PHASE8 §6 schedule originally marked macOS runner access as a Phase 8
(M8) milestone for iOS signing. With macOS already running the Android rig, iOS validation
can move earlier.

## Decision

Add an iOS Simulator lane to P0-17 (`expo run:ios` with free Apple ID, no signing required).
Once Xcode is installed, this lane runs per-PR from Phase 1 onward, catching Expo
config-plugin breakage four phases earlier than planned (originally Phase 5 / M5 media sanity
on physical devices).

The lane is **not** added to `devctl verify` (it's optional, host-dependent). `devctl doctor`
reports whether the iOS Simulator runtime is available. If absent, the lane is skipped with
`"ios_simulator":"unavailable"` — not a failing check at Phase 0-1, but recorded in the host
capability report for traceability.

## Consequences

**Positive:**
- Expo native breakage is caught at Phase 1, not Phase 5
- iOS build is continuously exerciseable, reducing the Phase 8 release-sprint risk
- No signing assets needed for Simulator builds

**Negative:**
- Requires Xcode installation (Will action — one-time, ~12 GB download)
- Adds ~1 minute to CI (optional lane, not blocking when absent)

## Options considered

| Option | Description | Verdict |
|--------|-------------|---------|
| A | iOS Simulator as optional lane in P0-17, doctor records availability | **Accepted** |
| B | Defer iOS entirely to Phase 5 (current plan) | Rejected — macOS is already the dev host |
| C | IOS Simulator as a required gate from Phase 1 | Rejected — Xcode not yet installed; don't block on absent tool |

## References

- `17-PHASE8-NOTIFICATIONS-RELEASE.md §6` — M5/M8 milestones updated
- `10-PHASE1-FOUNDATION-AUTH.md` — iOS status paragraph
- `tools/devctl-README.md` — host capability doc