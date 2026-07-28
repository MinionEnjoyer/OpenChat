tool: File (path: /tmp/retro/batches/batch-ao.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_JV8st1FEJ3hPWfgGXj781187`]

<file path="/tmp/retro/batches/batch-ao.md" total_lines="346" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T11:59:32-07:00 — fix(mobile): re-nest ...
tool: File (path: /tmp/retro/batches/batch-ao.md)
tool File completed: [Exact evidence retained · 9 KB · inspect with `retrieve_tool_result ref=art_call_00_w5iVV2g6UJouWerbJqAM9487`]

<file path="/tmp/retro/batches/batch-ao.md" total_lines="346" shown_lines="201-346" truncated="false">
   201│  apps/mobile/e2e/flows/screen-readiness/right-drawer.yaml  | 11 +++++++++...
## WINDOW
**First**: 2026-07-26T11:59:32-07:00  
**Last**: 2026-07-26T15:00:17-07:00  
**Span**: 3 hours, 0 minutes, 45 seconds — single calendar day (2026-07-26)

## WHAT WAS BUILT
1. **Push notifications client for mobile** — full expo-notifications integration with push token registration, ShellScreen wiring, session-store persistence, and a 530-line test suite. Merged from `notif-client`.

2. **KAV (KeyboardAvoidingView) modal restructuring across 7 components** — systematic application of the "ccaa487 pattern": re-nesting KAV inside an opaque overlay as Modal's direct child, eliminating a stale close-transition race where KAV padding reset fought Modal `visible=false`. Affected EmojiPicker, GifPicker, ChatPane edit modal, ChannelForm, JoinServerOverlay, FriendsScreen add-friend, and RolesEditorScreen.

3. **Structural modal tests (5 suites + helpers)** — modalStructureHelpers.ts plus per-component tests verifying the invariant "Modal's direct child has backgroundColor" to prevent regression of the KAV pattern.

4. **Two unreachable screens wired to UI** — JoinServerOverlay (rail "🔗" button) and InviteCreateOverlay (channel-header "Invite" button, gated on CREATE_INVITE). Both were "fully built and rendered by ShellScreen but no UI control anywhere" activated them — "the same class as the 14 built-but-unreachable components the project already shipped, except at SCREEN level."

5. **Screen-readiness Maestro runner (16 screen flows)** — new `tools/screen-readiness.mjs` harness using Maestro + adb with 4 assertions (zero-bounds, off-screen, keyboard-occlusion, placeholder-text), `_go-shell.yaml` recovery flow, and 3 batches of per-screen Maestro flows covering drawers, friends, inbox, server-settings, roles-editor, notif-settings, channel-form/reorder, invite-create, join-server, attach-picker, poll-create, member-profile, and pins. 3 screens achieved PASS on emulator-5554 by end of slice.

6. **Test-world provisioning infrastructure** — `tools/test-world.mjs` (309 lines) provisions fresh user+server+channels+friend+DM+messages via dev-login REST APIs; `tools/e2e-provision.sh` shared lib; `_login.yaml` uses `E2E_USERNAME` env var; hardcoded "alice"/"Fixture Guild" eliminated from both e2e runners.

7. **e2e harness hardening** — `e2e-run-only.sh` converted from "flow launcher" to standalone test runner (timeouts, device detection, per-flow env, test result capture, retry, trap cleanup, stderr→stdout redirect). `e2e-shard.sh` gained parallel Maestro-per-device, results aggregation, fail-fast, and per-device summaries.

## FAILURES AND THEIR COST

**1. KAV-as-direct-Modal-child stale close transition**
> "KAV padding reset races Modal visible=false when KAV is the direct Modal child"

Cost: systematic bug pattern across 7 components; each required structural rework and a dedicated regression test. No hour figure stated; the fix references a prior fix commit (`ccaa487`) implying this is a known anti-pattern being incrementally stamped out.

**2. expo-notifications native bridge crash at import time**
> "expo-notifications runs DevicePushTokenAutoRegistration side effects at module import time that crash when the native bridge is missing. Any test that transitively imports push.ts via ShellScreen hits this."

Cost: drawerStructure and railLayout test suites broken by a transitive import they didn't opt into. Fixed with `moduleNameMapper` redirect. After fix: "1 failing / 78 suites (pre-existing presence integration)" — the 2 suites restored by the mock.

**3. FR-SRV-006 — 2 screen-level components shipped unreachable**
> "Both overlays were fully built and rendered by ShellScreen but no UI control anywhere called setJoinServerVisible(true) or setInviteCreateVisible(true). This is the same class as the 14 built-but-unreachable components the project already shipped, except at SCREEN level."

Cost: development effort on 2 fully-implemented overlays that could never be reached by a user, plus the precedent of **14 prior components** shipped in the same state. No hour figure, but the commit author explicitly names the systemic waste.

**4. Runner go-shell cascade failure**
> "the runner's separate go-shell invocation was pressing Back from shell-screen, exiting the app and causing every subsequent flow to fail"

Cost: every screen flow after the first in a batch was invalidated. Two commits needed to fix: first adding inline `_go-shell.yaml` subflows to each of 14 screen flows (commit 18), then removing the harmful runner-level go-shell call entirely (commit 20).

**5. _go-shell.yaml dismissal blind-spots**
> "Old version used only left-side scrim taps which couldn't dismiss the left drawer or full-screen overlays (friends, inbox, etc.)"

Cost: screen flows for left-drawer, friends, inbox, and any full-screen overlay could not recover to shell. Commit 17 replaced with pressBack + both-side scrim strategy.

**6. Broken _go-shell.yaml dependency + "unpredictable" server-switch in channel-form/reorder flows**
> "Remove broken _go-shell.yaml dependency" / "Remove server-switch to Fixture Guild (restored state is unpredictable)"

Cost: two screen flows non-functional until rewritten to use direct button access instead of server-switch + dependency chain. Both needed `pm clear + login + flow` end-to-end re-verification on emulator-5554.

**7. Hardcoded test identity (alice / Fixture Guild)**
> "replace hardcoded alice/Fixture Guild"

Cost: tests coupled to a single identity and server name that polluted shared state. Replaced with `test-world.mjs` isolated provisioning + `E2E_USERNAME` env var injection. 309 lines of new provisioning infrastructure.

**8. pins flow — missing testID on PinsPanel**
> "Runner: pins required testIDs set to [] until APK rebuilt with testID"

Cost: test assertion degraded to title-text matching as a workaround; `pins-panel` testID added to `PinsPanel.tsx:44` but gated on APK rebuild. The runner's required-element assertion was temporarily disabled for this screen.

**9. arrow-function bug in addFriendModalStructure test**
> "fix arrow-function > bug in addFriendModalStructure"

Cost: structural test had a malformed arrow function — the test meant to verify the modal pattern was itself broken, producing a false signal. Caught and corrected in a follow-up commit.

**10. Merge conflict on e2e-shard.sh**
> "Merge branch 'harness-hardening' into integration # Conflicts: # tools/e2e-shard.sh"

Cost: parallel branches (`harness-hardening` vs `integration`) both modified `e2e-shard.sh` — 216 insertions across both sides needed manual conflict resolution during merge.

## RECURRING THEMES

- **"Fix it, then fix the fix"**: The `_go-shell.yaml` recovery strategy was introduced (commit 13), found inadequate (only left-side taps, commit 17), over-corrected (runner-level go-shell that exited the app, commits 18+20), then partially walked back in individual flows (commits 21-22 remove the broken `_go-shell.yaml` dependency). Three rounds of iteration on shell recovery across 6 commits.

- **Tests that passed while the system was broken**: The structural modal tests (commit 1) had an arrow-function bug (commit 4) — a test verifying the anti-pattern fix was itself defective. Also: the screen-readiness runner's `required testIDs` were set to `[]` for pins to allow a PASS while the APK lacked the testID (commit 24).

- **Unreachable-by-default is a repeating defect class**: FR-SRV-006 explicitly invokes the prior "14 built-but-unreachable components" as precedent. The screen-readiness registry also introduces `UNREACHABLE-BY-DESIGN` as a first-class status for invite-preview (commit 16) — suggesting the project is systematizing awareness of unreachable surfaces.

- **Hardcoded fixtures as recurring debt**: "alice"/"Fixture Guild" were hardcoded across `_login.yaml` and `p1-01-devlogin-shell.yaml`. The test-world commit (23) finally replaces them with env-var injection and per-flow provisioning — 391 lines of new infrastructure to undo a pattern that had accumulated across multiple flow files.

- **Silent import-time side-effects breaking unrelated tests**: expo-notifications crashed any Jest suite that transitively imported `push.ts` through `ShellScreen` — a failure with no visible connection between the notif feature and the drawer/rail tests that broke.

## PROCESS SIGNALS

- **Agent fan-out via branch merges**: Three feature branches merged into `integration` in this 3-hour window: `notif-client` (push notifications), `fix-mentions-kav` (KAV restructuring), `fix-notif-jest` (Jest mock), and `harness-hardening` (e2e harness). The KAV work was split across 3 branches (`fix-mentions-kav`, plus direct fixes to RolesEditorScreen and the arrow-function test fix) that converged through merges.

- **Co-author attribution**: Three commits (backlog entries and backlog move) carry `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, indicating agent-authored work being committed by a human (Will). The backlog items are explicitly described as "grounded in measured pain from this session rather than speculation" — agent observed pain, human committed the synthesis.

- **Verification evidence committed inline**: Screen-readiness PASS commits include screenshots (`artifacts/readiness/emulator-5554/*.png`) and hierarchy XML dumps committed alongside the flow YAML — verifiable artifacts stored in-tree. Commit messages declare "Verified end-to-end: pm clear + login + flow → … visible" as a ritualized verification statement.

- **Backlog as salvage from session pain**: Three tooling wants (fleet GUI, test scheduler, validation-kit extraction) were recorded in BACKLOG.md, then immediately relocated to a separate `workflows` repo with a pointer left behind — the project recognized these were about the fan-out methodology, not the app itself, and moved them to where they'd outlive the project.

- **Perturb-and-restore pattern in screen-readiness**: The `_go-shell.yaml` flow is a dedicated "return to neutral" step that runs before every screen flow. When it failed (only left-side taps, or Back-from-shell), flows cascaded to failure. The fix was two-pronged: make the recovery more robust AND embed it inline in each flow rather than relying on the runner.

- **Hardening as distinct merge branch**: `harness-hardening` was a named branch that conflicted with `integration` on `e2e-shard.sh`, implying parallel work on the same tool by different branches. Conflict resolved via merge rather than rebase.

## PACE

- **Total commits**: 24
- **Calendar days**: 1 (2026-07-26 only)
- **Bursts**:
  - 11:59–12:06: 7 commits in 7 minutes (3 merges, KAV fixes, Jest mock — dense integration stitching)
  - 13:21–13:25: 3 commits in 4 minutes (backlog docs)
  - 13:52–13:54: 2 commits in 2 minutes (e2e harness maiden voyage + shard runner)
  - 14:07–14:09: 3 commits in 3 minutes (screen-readiness batches 1–3)
  - 14:20–14:30: 3 commits in 10 minutes (go-shell fixes)
  - 14:52–15:00: 4 commits in 8 minutes (2 screen-readiness PASS fixes + test-world + pins PASS)
- **Gap**: 12:06 → 13:21 (75 minutes) — only significant pause; preceded by dense merge activity, followed by e2e harness and screen-readiness construction
