# Disk reclamation — what is safe to delete

Written 2026-07-28 after the project consumed enough disk to block an Xcode
upgrade. 35 GB reclaimed in four steps, from 28 GB free to 63 GB, with no source
lost and nothing tracked deleted.

Ordered by return. Every item is regenerable.

## 1. Unused AVDs — 19 GB

    ~/.android/avd/<name>.avd  +  <name>.ini

Each Pixel 6a API 34 AVD costs 2–6 GB and grows with use. A six-emulator fan-out
therefore costs ~25 GB in disk alone, which is a real and unbudgeted price for
parallelism.

Check which AVD a running emulator uses before deleting:

    adb -s emulator-5560 emu avd name

Recreating one is cheap — the system image stays under
`~/Library/Android/sdk/system-images` and is not what takes the space.

## 2. Build output inside worktrees — 15 GB

    apps/mobile/android/app/build
    apps/mobile/android/.gradle
    apps/mobile/.expo
    apps/mobile/ios/build, apps/mobile/ios/Pods

With 128 worktrees this dominates. Deleting build output preserves every
uncommitted source change, which matters here: 59 worktrees held uncommitted
work at the time of writing. **Delete build directories, not worktrees.**

## 3. Gradle AAR transforms — 5.3 GB

    ~/.gradle/caches/9.3.1/transforms

Keep `~/.gradle/caches/modules-2` (downloaded dependencies) — deleting it forces
a slow re-download for no additional benefit.

## 4. Maestro test artifacts — 1 GB

    ~/.maestro/tests

Every flow execution leaves a timestamped directory of logs and screenshots.
1,247 had accumulated. Note this is also why Maestro's own screenshots were
useless during triage: the directory name is a timestamp, uncorrelated with the
flow. `tools/e2e-run-only.sh` captures its own screenshot next to the verdict
instead.

## Do NOT delete

- `~/Library/Android/sdk/system-images` — needed to recreate any AVD
- `~/.gradle/caches/modules-2` — dependency cache, slow to rebuild
- Worktrees themselves without first checking `git status`
- Anything under `artifacts/` that is tracked — receipts and gate evidence live
  there and are the record of what was actually proven

## Standing cost

A six-device fan-out costs roughly 25 GB of AVD plus whatever build output the
worktrees accumulate. Worth knowing before deciding how wide to go.
