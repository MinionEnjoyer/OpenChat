tool: File (path: /tmp/retro/batches/batch-ag.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_09kVFzueNUBrR0fp414p6001`]

<file path="/tmp/retro/batches/batch-ag.md" total_lines="261" shown_lines="1-261" truncated="false">
     1│ ### 2026-07-25T13:24:08-07:00 — wip: checkpoint before continuation
     2...
## WINDOW
- **First**: 2026-07-25T13:24:08-07:00
- **Last**: 2026-07-25T13:28:18-07:00
- **Span**: 4 minutes 10 seconds (single calendar day)

## WHAT WAS BUILT
1. **Announcement channel read-only enforcement** (FR-SRV-010): new `GET /servers/:id/channels/:channelId/permissions/me` endpoint; mobile-side `canSendInChannel()` pure function; composer hidden and read-only banner shown when user lacks SEND_MESSAGES in ANNOUNCEMENT channels. 11 files, +416/−90.
2. **Avatar & server icon upload with square crop** (FR-MED-020): `AvatarPicker` component, `useAvatarUpload` hook with image-pick → `ImageManipulator` square-crop → POST /uploads pipeline; user avatar picker in ShellScreen, server icon picker in ServerSettingsScreen. Added `expo-image-picker` + `expo-image-manipulator` deps. 13 files, +568/−1.
3. **Friend-code integration test repaired** (FR-SOC-001): integration test rewritten from `fetch` (silently mocked by jest-expo) to `node:http` so it actually hits the running API on port 3101. Also corrected seed-data assumption (only alice has a friendCode, so bob must use alice's code to send the request). 1 file, +97/−46.
4. **eslint `no-explicit-any` fix** (FR-MED-001): `WebReadableStream` casts typed in `share.service.ts`. 1 file, +3/−2.
5. **node_modules symlink management**: repeated addition and removal of `apps/api/node_modules` and `apps/mobile/node_modules` symlinks from the git index.

## FAILURES AND THEIR COST
1. **jest-expo global fetch mock silently breaking integration tests**: "jest-expo mocks the global fetch (the mock returns an object with finalize/abortCleanupFunction/listeners — it never issues network requests)". The integration test was passing while never issuing real HTTP requests — it tested nothing. **Cost**: the entire test file had to be rewritten (+97/−46 lines). No hours figure quoted, but the test was invalidated in its entirety.
2. **Seed data assumption wrong**: "only alice has a friendCode in the seed data, so bob sends the request using alice's code". The test was written against an incorrect assumption about who has a friendCode. **Cost**: additional corrections within the same rewrite.
3. **eslint `no-explicit-any` violation**: `any` types in `share.service.ts` WebReadableStream casts. **Cost**: small (3 lines changed), but a gate failure that had to be cleaned up.
4. **node_modules symlinks contamination**: symlinks repeatedly appeared in the index across checkpoint commits despite explicit removal commits. No cost figure stated, but at least 15 commits (out of 21 total) are entirely this cleanup noise — a significant ratio of history pollution.

## RECURRING THEMES
- **node_modules symlink ping-pong**: Symlinks are added by "checkpoint before continuation" commits 6 times across the slice, and explicitly removed by "drop node_modules" / "untrack node_modules symlinks" 9 times. The additions and removals interleave directly: a feature lands (13:25:29), a chore drops symlinks (13:26:18), another feature lands (13:26:35), then 2 checkpoints re-add them within 13 seconds (13:26:48), followed by 8 successive removal commits in the same second (13:26:54–13:26:55), then a final checkpoint re-adds them again (13:28:18). The removal never sticks.
- **Duplicate commits at identical timestamps**: three "wip: checkpoint before continuation" commits at 13:24:09 (same second), and 8 "chore: untrack node_modules symlinks (shared store)" commits spread across 2 seconds (13:26:54 and 13:26:55), all with identical messages and identical diffs. This is not normal git rebase squashing — it reflects parallel agents or worktrees committing the same thing independently and it all landing in the merged history.
- **Tests that passed while broken**: The jest-expo fetch mock incident is a textbook case — "it never issues network requests" yet the test suite reported them as passing. This was only caught because someone looked at what the mock actually does.
- **Checkpoint noise dominating the log**: Of 21 commits in this slice, 8 are "checkpoint before continuation" and 9 are "untrack node_modules symlinks" — 17/21 commits (81%) are infrastructure noise, not feature work.

## PROCESS SIGNALS
- **Agent fan-out**: Four distinct feature/bugfix workstreams (FR-SRV-010, FR-MED-020, FR-SOC-001, FR-MED-001) land in a 4-minute window from different commits. This implies multiple agents working in parallel, each committing independently — possibly in separate worktrees.
- **Checkpoint-as-restart**: The "wip: checkpoint before continuation" pattern (8 commits) suggests agents checkpointing state as they restart or hand off, each checkpoint dragging in the node_modules symlinks.
- **Explicit verification gates**: Gate results are recorded inline in commit messages: `tsc=0, eslint=0, jest=31/411 (mobile), 14/93+11/89 (api), codegen=0` for FR-SRV-010; `tsc --noEmit: rc=0 / eslint --max-warnings=0: rc=0 / codegen --check: rc=0 / jest: 31 suites, 409 tests, all pass / integration (p5-05): 4/4 pass` for FR-MED-020. Gate results are also quoted in the FR-SOC-001 fix commit.
- **`@satisfies` traceability**: Both FR-MED-020 and FR-SOC-001 carry `@satisfies FR-xxx-xxx` tags in the commit body, linking commits to requirement IDs.
- **No merges or reverts visible**: The history is presented as a linear sequence with no merge commits, no reverts — though the node_modules ping-pong suggests parallel work that was merged elsewhere or flattened before capture.

## PACE
- **Commits**: 21
- **Calendar days touched**: 1 (2026-07-25 only)
- **Wall time**: 4 minutes 10 seconds (13:24:08 to 13:28:18)
- **Bursts**: The entire slice is one extreme burst — 21 commits in 250 seconds, averaging one commit every 12 seconds. The densest sub-burst is 13:26:48 to 13:26:55 (8 seconds), containing 12 commits (2 feature-related + 2 checkpoints + 8 symlink removals) — roughly 1.5 commits/second.
- **Substantive work throughput**: Two large feature commits land 46 seconds apart (FR-SRV-010 at 13:25:29, FR-MED-020 at 13:26:35), each representing hundreds of lines across 10+ files — but given the surrounding checkpoint/cleanup noise, the timestamps likely reflect commit-amalgamation or final push of work done by parallel agents rather than real-time editing speed.
