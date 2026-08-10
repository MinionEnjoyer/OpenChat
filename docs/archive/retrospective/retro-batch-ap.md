tool: File (path: /tmp/retro/batches/batch-ap.md)
tool File completed: [Exact evidence retained · 13 KB · inspect with `retrieve_tool_result ref=art_call_00_16QRVPJsTgOkhEXBhlHc4969`]

<file path="/tmp/retro/batches/batch-ap.md" total_lines="458" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T15:01:48-07:00 — fix(screen-readiness)...
tool: File (path: /tmp/retro/batches/batch-ap.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_PR9UVQKVAlZTszMMWFGi7193`]

<file path="/tmp/retro/batches/batch-ap.md" total_lines="458" shown_lines="201-400" truncated="true" next_start_line="401">
   201│  5 files changed, 26 insertions(+), 20 deletions(-)...
tool: File (path: /tmp/retro/batches/batch-ap.md)
tool File completed: [Exact evidence retained · 4 KB · inspect with `retrieve_tool_result ref=art_call_00_fgDfhY9UEuaMrTcPD46R0544`]

<file path="/tmp/retro/batches/batch-ap.md" total_lines="458" shown_lines="401-458" truncated="false">
   401│   truncate before pushing controls out of the drawer
   402│ 
   403│ Per...
tool: File (path: /tmp/retro/batches/batch-ap.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_cKX5JgAp8ERIYZ1I7NYP6045`]

<file path="/tmp/retro/batches/batch-ap.md" total_lines="458" shown_lines="340-409" truncated="true" next_start_line="410">
   340│ 
   341│ ### 2026-07-26T15:40:30-07:00 — Merge branc...
## WINDOW
First commit: **2026-07-26T15:01:48-07:00**
Last commit: **2026-07-26T16:46:47-07:00**
Wall-clock span: **1 hour 45 minutes** (24 commits on a single calendar day)

## WHAT WAS BUILT
1. **Per-test account provisioning endpoint** — A `POST /api/dev/test-world` endpoint that returns a fresh, isolated world (user, server, 3 channels, friend + DM, seeded messages) collision-proof under 4-device parallelism. ~10ms median, gated behind `DEV_AUTH`.
2. **E2E test migration to provisioned worlds** — All 30 Maestro flows switched from hardcoded identities (`alice`, `bob`, `Fixture Guild`) to `E2E_*` environment variables, eliminating fixture state dependency across parallel runs. Multi-user gaps documented with NOTE comments rather than weakened assertions.
3. **Screen readiness expansion** — Multiple agent-driven branches (nav-a, nav-b, nav-d, nav-f) pushed screen-readiness coverage across attach-picker, poll-create, member-profile, invite-preview, right-drawer, inbox, create-server, server-settings, invite-create, and join-server screens on emulator-5554/5556. Runner gained `--only=` filtering for targeted re-runs.
4. **RolesEditorScreen wired into the app** — A fully-built but unreferenced screen (role list, name/colour editing, permission bitfield toggles) gained a `MANAGE_ROLES`-gated button in the channel header and overlay rendering. The `check-unreachable` gate was then widened to catch barrel-blind components.
5. **Voice call hardening** — Proximity-sensor screen blanking via `PROXIMITY_SCREEN_OFF_WAKE_LOCK` (Android, earpiece mode); speaker/earpiece toggle fixed to use `AudioSession.selectAudioOutput()` instead of a non-existent `Room.switchActiveDevice()`; `@expo/vector-icons` added for proper telephony glyphs.
6. **Layout regression fixes** — Channel-header overflow (from wiring RolesEditor) and rail dead-margin expansion (from an earlier flex change) both caught and fixed within the same session.

## FAILURES AND THEIR COST
1. **Tablet network isolation (Samsung R52X105QZYY)**
   > "the Samsung tablet … cannot reach the API host at 192.168.0.106 — 100% packet loss on ping, while the API answers fine from the Mac and the Pixel on the same network."
   > "This also retro-explains **every earlier 'FATAL: shell screen' on the tablet**, which I had **wrongly attributed first to timeouts and then to the notification permission dialog.**"
   Cost: multiple prior debugging sessions misdirected. No explicit hour figure. An ngrok tunnel workaround introduces a latent hazard ("results depend on which host the APK targets").

2. **APK predating testID commit — emulator-5556 runs invalidated**
   > "Both screens remain UNREACHED on emulator-5556 because the APK (installed 13:18 PDT) predates commit 5898487 (13:25 PDT). rail-join-server and invite-create-button are not in the rendered hierarchy. APK rebuild required."
   Cost: one full device run invalidated. No explicit hour figure.

3. **RolesEditorScreen fully built with zero references — gate blind spot**
   > "RolesEditorScreen was fully built (role list, name/colour editing, permission BITFIELD toggles) but had zero references — nothing rendered it."
   > "The [check-unreachable] gate only inspected components exported from src/features/*/index.ts. … the gate passed while a fully-built screen sat unreachable — exactly the blind spot it exists to prevent."
   Cost: entire screen built in a prior session before anyone noticed it was dead code. No explicit hour figure.

4. **toggleSpeaker calling non-existent API**
   > "toggleSpeaker() method was calling room.switchActiveDevice() which does not exist on the LiveKit Room class."
   Cost: speaker toggle silently broken until traced. No explicit hour figure.

5. **Two same-session layout regressions**
   - Rail: "Regression from 92d309e: flex:1 on the rail View in a row-direction drawerContent overrides width:64, causing a large dead margin left of rail icons and squeezing the channel-name column."
   - Channel-header: "Regression from 9968596 (wire-roles-editor): adding the roles-editor-button … caused text labels to overflow the 280px drawer."
   Cost: both required follow-up commits within minutes to restore correct layout. No explicit hour figure.

**No failure in this slice carries an explicit cost-in-hours quote.** The messages name what broke and why; they do not quantify time lost.

## RECURRING THEMES
- **Build/APK staleness invalidates test runs** — The APK-on-device vs. source-in-repo clock skew (7 minutes) broke screen-readiness on emulator-5556. This is the second instance of stale-artifact invalidation (the tablet had the same pattern with a different cause).
- **Gate that passes while broken** — `check-unreachable` passed on RolesEditorScreen because it only scanned barrel re-exports, not direct file exports. The gate was widened only *after* the failure was found by manual inspection. This is "exactly the blind spot it exists to prevent."
- **Regression from within-session changes** — Two layout regressions (rail flex, channel-header overflow) trace directly to commits in the same <2-hour window. The pace of change outpaced verification.
- **Agent step-capping preserves partial work** — Multiple `wip` commits exist because agents hit step limits before completing verification. The architect commits the artifacts rather than losing them.
- **"On-device verification outstanding" as a default state** — Three separate commits (proximity sensor, speaker toggle, vector icons) end with device verification deferred because "emulators and physical devices are in use by the product owner."

## PROCESS SIGNALS
- **Parallel agent fan-out across nav branches** — nav-a, nav-b, nav-d, nav-f branches were all in flight simultaneously, then merged into `readiness-maestro` and then into `integration` in quick succession (15:08:01 through 15:18:00). Six merge commits in 10 minutes.
- **Agent step-capping with human salvaging** — "Agent nav-d reached all three of its assigned screens and captured artifacts, then step-capped before committing. Committed by architect to preserve the work." Same pattern for nav-b: "Agent nav-b step-capped with no commits. Its … changes are preserved here."
- **Co-authored-by tags on agent commits** — "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" appears on agent-driven commits (nav-d wip, nav-b wip, deps commit).
- **Merge conflict resolution** — The nav-b merge into readiness-maestro required conflict resolution on `READ-ME-FIRST.md` and `_go-shell.yaml`. Read-me was deleted (26 lines removed) in the resolution.
- **Gate fix follows gate failure** — The `check-unreachable` gate was widened *in the same branch* that wired RolesEditorScreen — a classic perturb-and-restore: the feature exposed the gate's blind spot, and the gate was hardened before merging.
- **PR attempt tracking** — The tool surface includes `pr_attempt_record` / `pr_attempt_preflight` actions, indicating structured PR attempt tracking is available, though no explicit PR attempt data appears in commit bodies.
- **Worktree isolation** — The tool surface includes `worktree=true` for parallel edit tasks, consistent with the nav-a/nav-b/nav-d/nav-f fan-out pattern.
- **Verification gates present but gappy** — `check-unreachable` existed but was insufficient; `screen-readiness.mjs` runner performs zero-bounds / off-screen / keyboard-occlusion / placeholder checks but agents regularly step-capped *before* those checks completed.

## PACE
- **24 commits** in the slice
- **1 calendar day** (2026-07-26)
- **Burst 1** (15:01–15:18): 15 commits in 17 minutes — agent merges, e2e migration, test-world endpoint
- **Gap**: 18 minutes (15:18 → 15:36)
- **Burst 2** (15:36–15:40): 4 commits in 4 minutes — RolesEditor wire + gate fix + merge
- **Long gap**: 63 minutes (15:40 → 16:44)
- **Burst 3** (16:44–16:47): 4 commits in 3 minutes — proximity sensor, two layout fixes, voice toggle fix, vector icons
- Overall pattern: three intense bursts separated by two gaps, with the longest gap (over an hour) between the RolesEditor merge and the voice/layout cluster.
