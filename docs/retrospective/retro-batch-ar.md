tool: File (path: /tmp/retro/batches/batch-ar.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_gB1LiP4JXrFwxV16sUWa0397`]

<file path="/tmp/retro/batches/batch-ar.md" total_lines="374" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T17:27:02-07:00 — Merge branch 'notif-d...
tool: File (path: /tmp/retro/batches/batch-ar.md)
tool File completed: [Exact evidence retained · 10 KB · inspect with `retrieve_tool_result ref=art_call_00_Kwjui8ljrFHIZ1Grj7p08336`]

<file path="/tmp/retro/batches/batch-ar.md" total_lines="374" shown_lines="201-374" truncated="false">
   201│ 
   202│ ### 2026-07-26T18:44:10-07:00 — feat(mobile): wire markdown par...
## WINDOW

- **First**: 2026-07-26T17:27:02-07:00
- **Last**: 2026-07-26T19:35:01-07:00
- **Span**: 2 hours, 8 minutes (single calendar day)

## WHAT WAS BUILT

1. **Push notification dispatch via event-bus** — routing push notifications for DMs, server messages, and mentions through a new `push-dispatch.service`, backed by a 433-line integration spec.

2. **Complete MaterialIcons migration** — 15 remaining emoji/glyph `<Text>` sites converted to `<MaterialIcons>` components across 10 files, followed by fixes for voice-channel prefix rendering and AttachmentTray icons that appeared as literal text after the initial migration.

3. **Reachability-based orphan detection** — `tools/check-orphans.sh` rewritten to trace from real entrypoints instead of a naive "no importer outside own feature directory" heuristic. Immediately surfaced two unwired features: `parseMarkdown()` (FR-MSG-007) and `computeChannelUnread()` (FR-MSG-010).

4. **Markdown rendering wired into messages** — new `MarkdownText` component mapping 13 AST node types into React Native components, with 20 unit tests and mention-aware text leaves. Replaced the previous plain-text rendering that had been the actual production behavior.

5. **Unread badges wired into channel list** — `useUnread` hook, `unreadBadge` component, and `ChatPane` integration. Salvaged from an agent run that hit its step cap before committing.

6. **Per-test seeded worlds for E2E isolation** — test-world API endpoint + CLI harness (`test-world.mjs`), migrating `invite-create` and `member-profile` flows off shared mutable state onto fresh provisioned worlds. Follow-up fix added friendUser as server member in provision() to enable two-participant flows.

## FAILURES AND THEIR COST

1. **Notification feature shipped non-functional**
   > "on 2026-07-26 the notification feature shipped with all components unit-tested and green while completely non-functional — nothing connected them. The naive 'no importer outside own feature directory' heuristic produced 3/3 false positives."
   
   Two unwired features confirmed as orphans (`parseMarkdown`, `computeChannelUnread`), both "unit-tested, zero production consumers." No explicit hours figure, but the cost is the wasted testing investment on features that did nothing and the false confidence from green suites.

2. **Two agents collided in one worktree**
   > "on 2026-07-26 a capture agent was dispatched into a worktree that already had a migration agent. They fought over the working tree and the same emulator. The second broke a test belonging to the first; the first stalled **40 minutes** with a zero-byte log while its processes stayed alive, so it read as active."
   
   Cost: **40 minutes** of stalled work, plus a broken test belonging to the first agent.

3. **Agent hit step cap before completing unread-badge wiring**
   > "Salvaged from an agent run that hit its step cap before committing. Verified independently … The agent lost its budget to a broken adb path and never reached a device. Bounds check still outstanding."
   
   Cost: work had to be salvaged and independently verified by a human; device verification skipped entirely ("bounds check still outstanding").

4. **Test-world provision omitted friend server membership**
   > "The friend was created and friended but never joined to the server, so two-participant E2E flows (kick, leave, member-list, role assignment) could not be exercised through the direct API path."
   
   Cost: gap in E2E coverage for two-participant flows; the CLI tool papered over it with its own invite/accept dance, masking the endpoint deficiency.

## RECURRING THEMES

- **Tests passing while feature broken**: Three instances — the notification feature was "unit-tested and green while completely non-functional," and the orphan gate found two more: `parseMarkdown()` and `computeChannelUnread()`, both unit-tested with zero production consumers.
- **Icon migration incomplete at landing**: The MaterialIcons migration was merged before all rendering sites were caught — literal text "volume-up" appeared in the voice channel prefix (one commit later), then AttachmentTray icons needed fixes (two commits later).
- **Agent work requiring human rescue**: Two commits co-authored by "Claude Opus 5" — one salvaged from a step-cap failure, another documenting the worktree collision the human had to detect.

## PROCESS SIGNALS

- **Branch-and-merge**: 12 merge commits in 2 hours, most merging single-feature branches immediately after the feature commit.
- **Agent fan-out**: Two commits co-authored by "Claude Opus 5 <noreply@anthropic.com>" — agents producing substantive code, but both requiring human intervention to land.
- **Perturb-and-restore**: The test-world fix explicitly documents the practice: "Perturb-and-restore confirmed: test fails without the line (1 member, friend undefined), passes with it (2 members, isOwner=false, roleIds=[])."
- **Verification gates**: Typecheck ("tsc clean"), test suite counts reported per commit (e.g., "870 pass, 4 pre-existing failures unchanged"), orphan-gate integrated as a tool, integration tests cited by count and suite name.
- **Worktree isolation attempted, collision detected**: `fleet-health.sh` added to detect process-group collisions across worktrees — "NOT YET PROVEN against a real collision."
- **E2E isolation improvement**: Systematic migration from "shared mutable state" to per-test provisioned worlds, with inline login and `clearState:true`.

## PACE

- **25 commits** (13 substantive + 12 merges) in a single calendar day
- **Bursts**:
  - 17:44–17:52 (8 minutes): 6 commits — icon fixes, drawer buttons, merges
  - 18:44–18:48 (4 minutes): 4 commits — markdown wire, test-world merges, unread wire, merges
- **Longest gap**: 18:02–18:44 (42 minutes) between drawer-overflow merge and markdown wiring — likely the markdown feature development window
- Single calendar day, no multi-day span
