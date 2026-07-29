tool: File (path: /tmp/retro/batches/batch-al.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_Of5gdsBZkSrFRCJzrAom1911`]

<file path="/tmp/retro/batches/batch-al.md" total_lines="389" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-25T21:47:01-07:00 — feat(mobile): add E2E...
tool: File (path: /tmp/retro/batches/batch-al.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_TnkjpLpaUyLgnmS9UH1S0818`]

<file path="/tmp/retro/batches/batch-al.md" total_lines="389" shown_lines="201-389" truncated="false">
   201│ 1a — Bottom inset: Wrap app in SafeAreaProvider, apply useSafeAreaInsets...
## WINDOW
- First: `2026-07-25T21:47:01-07:00`
- Last:  `2026-07-25T23:29:07-07:00`
- Span: ~1 hour 42 minutes, single calendar day (2026-07-25 Pacific).

## WHAT WAS BUILT
1. **E2E Maestro flow suite**: ~25 YAML flow files across 6 feature branches — servers (create/rename/channel-CRUD/reorder/members-kick-leave), social (friends/DM/presence/block), voice (join-leave/pill-controls/outgoing-call/incoming-call-overlay), messaging rich (reactions/markdown-mentions/pins-polls), media (avatar-upload/attach-picker/inline-gallery), notifications (per-channel-levels/foreground-toast).
2. **Systematic unreachable-component remediation**: 14+ components discovered wired to no screen — entire voice pipeline (VoiceTileGrid, VideoTile, ScreenShareView), media (AttachmentTray, attach button, GalleryModal), polls (PollCard, PollCreate) — all wired into ShellScreen with reachability tests.
3. **DD-023 Android composer + drawer fixes**: Safe-area insets replacing hand-rolled `StatusBar.currentHeight`, keyboard avoidance with `KeyboardAvoidingView behavior='height'` + corrected `keyboardVerticalOffset`, plus drawer restructure from 3-column to 2-column (Discord parity with DM rail entry).
4. **DD-024 channel auto-selection**: `resolveTextChannel()` with stored-preference-wins, fallback to first TEXT/ANNOUNCEMENT channel; 9 coldstart tests.
5. **E2E tooling**: Device-sharded parallel Maestro runner (`tools/e2e-shard.sh`), plus post-failure UI hierarchy dump + screenshot + testID capture so "a misspelled testID, an absent element, and a real product bug" become distinguishable.
6. **New verification gate**: `check-unreachable.sh` — detects components with passing tests/lint/tsc that no screen imports; found all 14 "in ~2s" after the owner found the first 3 "by hand on a device."

## FAILURES AND THEIR COST
- **Built-but-unreachable components** (discovered across multiple commits, wired in commits 20–22): 14 components — "voice tiles/video/screenshare, image gallery, attachment upload, polls, blocked-message collapsing, DM open, avatar crop. All had passing unit tests, tsc, lint and codegen. Correct code that no screen imports." "Unit tests verify components; nothing verified the seam between a feature and a screen." No explicit hour cost figure recorded.
- **Merge-induced test failure** (commit `22:28:25`): drawer tests passed on both branches independently, failed only after merge because `useSafeAreaInsets()` was added to ShellScreen without the test wrapper being updated. "Both branches were green alone; only the merged result was red — which is why the merged gate is a separate rung from the branch gate." No hour figure.
- **ScreenShareView unreachable** (commit `21:47:01`): "ScreenShareView is never imported/rendered in ShellScreen — same 'built but unreachable' pattern as FR-VOX-001." No cost figure.
- **AttachmentTray + attach button unreachable** (commit `21:47:13`): "was built but unreachable — same class of bug as FR-VOX-001 voice channel." No cost figure.
- **E2E flows committed but never executed** (commits `21:47:01` and `21:47:13`): "Flows not executed (no emulator/Java)" / "Flows NOT executed (no Java runtime for Maestro); YAML parses verified, testIDs confirmed against source." No cost figure.
- **No explicit hour or dollar cost figures appear anywhere in this slice.**

## RECURRING THEMES
- **Tests passing while product was broken**: The dominant pattern. "Correct code that no screen imports" — tsc green, lint green, jest green, codegen green, but features rendered nowhere. The test suites verified internal behavior; nothing verified the wiring seam.
- **Merge-integration as the real failure surface**: Both branches independently green, merged result red. This directly drove the design response: "the merged gate is a separate rung from the branch gate."
- **Tooling that cannot execute its own artifacts**: E2E flows written, committed, verified-by-parse, but never actually run — "no Java runtime for Maestro." Correctness claim rests on source inspection, not execution.
- **Sequential discovery → systematic remediation**: Found 3 unreachables "by hand on a device" → built a gate that "finds all of them in ~2s" → used that gate to wire the remaining components in subsequent commits.

## PROCESS SIGNALS
- **Agent fan-out**: 6 E2E feature branches (`e2e-p3-servers`, `e2e-p4-social`, `e2e-p6-voice`, `e2e-msg-rich`, `e2e-p5-media`, `e2e-p8-notif-vox`) plus 2 UI branches (`ui-composer-inset`, `ui-drawer-layout`) merged in rapid succession — 6 merges at `21:49:32`, 2 more at `22:20:05`.
- **Merge-then-fix, not revert**: Merge-induced test failure at `22:28:25` was fixed in the same commit, not rolled back.
- **Perturb-and-restore verification**: `composerInset.test.tsx` — "verifies the mechanism via mocked SafeAreaProvider"; `pollWiring.test.tsx` — "Prove-fail: removing the conditional guard crashes the test, confirming the wiring matters"; `uploadAttachmentsReachability.test.tsx` — "perturbation verified — expect('original') fails, expect('compressed') passes."
- **Drift log discipline**: DD-023 and DD-024 defects documented in `DRIFT-LOG.md` before fixes applied.
- **Gate expansion as learning**: `check-unreachable.sh` added as a direct response to the discovered failure class, with an `.unreachable-allow` file for known exceptions.
- **No reverts** visible in this slice.

## PACE
- **Commits**: 22 distinct commits
- **Calendar days**: 1 (2026-07-25)
- **Bursts**:
  - `21:47:01`–`21:49:32`: 9 commits in ~2.5 minutes (3 features + 6 merges)
  - `22:07:10`–`22:20:05`: 6 commits in ~13 minutes (DD-023/024 + 2 merges)
  - `23:21:47`–`23:29:07`: 3 commits in ~8 minutes (gate + voice wiring + poll wiring)
- **Gaps**: ~30 min (`22:28`→`23:21`), ~40 min (`21:57`→`22:07`) — consistent with build/tooling cycles between bursts.
