tool: File (path: /tmp/retro/batches/batch-ak.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_5ZxdJqe75Bz1sEzVCdpj1217`]

<file path="/tmp/retro/batches/batch-ak.md" total_lines="466" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-25T20:01:30-07:00 — feat(FR-VOX-005): DM ...
tool: File (path: /tmp/retro/batches/batch-ak.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_MRIGOVEHD62Aa0Wu9TBq3847`]

<file path="/tmp/retro/batches/batch-ak.md" total_lines="466" shown_lines="201-400" truncated="true" next_start_line="401">
   201│ 
   202│  apps/mobile/src/features/voice/VoiceContr...
tool: File (path: /tmp/retro/batches/batch-ak.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_EYC83fjRkZfzsdd59wMX5388`]

<file path="/tmp/retro/batches/batch-ak.md" total_lines="466" shown_lines="401-466" truncated="false">
   401│   content matches seed (eve online, carol pending, bob blocked)
   402│ -...
## WINDOW
- **First**: 2026-07-25T20:01:30-07:00
- **Last**: 2026-07-25T21:46:13-07:00
- **Span**: 1 hour 44 minutes (23 commits)

## WHAT WAS BUILT
1. **Mobile voice/video calling stack** — FR-VOX-005 incoming-call ring overlay with accept/decline, DM call initiation, and persistent in-chat call banner (CallStore + IncomingCallOverlay + CallButton + VoicePill).
2. **Participant tiles with live media indicators** — FR-VOX-002 speaker roster with animated green speaking rings, mute badges, audio-level tracking via LiveKit events (VoiceTile + VoiceTileGrid + useVoiceParticipants).
3. **Voice controls** — FR-VOX-003 mic mute (track-level), local deafen (Discord semantics), speaker/earpiece toggle, disconnect; 4-button VoiceControls component.
4. **Camera video** — FR-VOX-006 camera publish + remote render via @livekit/react-native VideoTrack, camera toggle/flip buttons.
5. **Screenshare viewing** — FR-VOX-007 subscribe and render remote screen share with LIVE badge.
6. **LiveKit audio verification probe** — tools/probe/ with 440Hz tone generator, fake publisher, and stats-based probe asserting audio flow through LiveKit end-to-end. Verified positive and negative cases.
7. **LAN-configurable device testing** — env-overridable LAN host for physical-device testing, with explicit documentation of the LiveKit `--node-ip` silent-failure surface.
8. **E2E Maestro flows** — Phases 3, 4, 6, and 7: server CRUD, social (friends/DM/presence/block), voice (join/leave/controls/call), and channel-create. 15 new flow files.

## FAILURES AND THEIR COST

| # | Failure | Stated Cost |
|---|---------|-------------|
| 1 | **LiveKit `--node-ip` misconfiguration** — signalling succeeds, room joins, but no audio flows. Described as "SILENT" and "the dangerous one: signalling succeeds and nothing looks broken." | No explicit hours figure; characterized as the highest-severity silent failure mode. |
| 2 | **FR-VOX-001: voice channel tap not wired to join()** — "Previously tapping a voice channel row only selected it (like a text channel) — the join() call was never wired. FIX: channelId/key passed to useVoiceConnection." Root cause documented as "the unreachable-voice bug." Commit `docs(priorities): E2E flows are part of DONE` titles this explicitly. | Implicit: voice features built across 5+ commits before the wiring bug was found. Discovery triggered the E2E-flows-are-DONE policy change. No quoted hours. |
| 3 | **InviteCreateOverlay and JoinServerOverlay unreachable from UI** — "setInviteCreateVisible(true) and setJoinServerVisible(true) are never called. The invite create and manual join code-entry screens are unreachable." Severity: **HIGH** — "same class as FR-VOX-001." | No quoted hours. |
| 4 | **FR-SRV-010: ANNOUNCEMENT channel type built but unreachable** — "ChannelForm only supports TEXT/VOICE, ANNOUNCEMENT type cannot be created from mobile. canSendInChannel and composer-readonly exist but are unreachable." | No quoted hours. |
| 5 | **FR-MSG-020: no mobile search UI** — "BE-only, covered by integration tests." | Acknowledged gap, not a discovered bug. |
| 6 | **4 pre-existing test failures** — noted in Phase 3 E2E commit gate output: "jest 62 suites / 708 tests (4 pre-existing failures unrelated to this change)." | 4 tests already failing before this window; no remediation attempted. |
| 7 | **E2E flows written but never executed** — "Flows were NOT executed (no Java Runtime available for Maestro on this host)." Stated on both Phase 3 and Phase 6 E2E commits. 15 flow files authored with no runtime verification. | Unknown; all Maestro flows are code-reviewed but untested. |
| 8 | **Merge conflicts on every integration merge** — VoiceStore.ts, index.ts, strings.ts conflicted on nearly every branch-into-integration merge (vox-002, vox-003, vox-005, vox-006, vox-007). Conflicts resolved by union. | Risk of regressions from manual conflict resolution; no quoted rework hours. |

## RECURRING THEMES
- **Built-but-unreachable is a pattern, not a one-off**: 4 instances in this single 1h44m window (voice tap wiring, InviteCreateOverlay, JoinServerOverlay, ANNOUNCEMENT channel type). The team named it explicitly — "same class as FR-VOX-001."
- **Tests that pass while the feature is unreachable**: Every voice feature had passing unit tests (FR-VOX-002: 995 lines of test code, FR-VOX-003: 371 lines, etc.) while the `join()` call was never wired. The tests exercised isolated components and stores, not the tap-to-join flow. The unit-test gate (`jest 54 suites / 622 passing`) gave false confidence.
- **Silent degradation via LiveKit config**: The `--node-ip` issue produces a room that "joins" successfully but carries no media. This is the same class of problem as the wiring bug — signalling says OK, experience is broken.
- **E2E flows as documentation of intent, not evidence of behavior**: 15 flow YAMLs were written, reviewed against component source for correct testIDs, but zero were executed. The commit author recognized this gap ("Flows NOT EXECUTED") and the preceding PRIORITIES commit explicitly states "E2E flows are part of DONE."
- **File collision hot-spots**: Three files absorb merge friction on every branch: `VoiceStore.ts`, `index.ts`, `strings.ts`. Every vox-* merge conflicted on at least two of these.

## PROCESS SIGNALS
- **Parallel branch structure**: 7 feature branches (`vox-002-tiles`, `vox-003-controls`, `vox-005-dmcalls`, `vox-006-video`, `vox-007-screenshare`, `vox-join-wiring`, `integ-vox`) merged sequentially into `integration` in rapid succession (20:09–21:38). Branch names and disjoint feature scopes suggest parallel development.
- **Merge-heavy integration**: 7 merge commits in the window. Every merge resolved conflicts manually on the same three hotspot files. No evidence of rebase-before-merge strategy.
- **Verification gates run per-commit**: `tsc`, `eslint`, `codegen --check`, and `jest` suites reported on feature commits. Gate output is quoted in commit bodies. The perturb-and-restore technique is explicitly mentioned: "Proven failure via perturbed assertion" (FR-VOX-003).
- **Work deferred explicitly**: FR-VOX-060 (watch party) deferred with a single-line PRIORITIES.md commit citing upstream divergence risk — "explicitly excluded from 'priority 1 complete'."
- **No runtime E2E execution in this window**: All Maestro flows are static artifacts. The environment lacked a Java Runtime. The policy change ("E2E flows are part of DONE") was documented but the capability gap remained.
- **Documentation commits used as decision records**: Two PRIORITIES.md commits serve as lightweight ADRs — one to defer watch party, one to encode the E2E-are-DONE policy after the voice-wiring root-cause.

## PACE
- **23 commits** in 1h44m (one every ~4.5 minutes average).
- **1 calendar day** (2026-07-25).
- **Burst structure**: Heavy feature-authoring burst 20:01–20:08 (4 feature commits in 7 minutes), then merge cascade 20:09–20:19 (6 merges in 10 minutes). A ~1h gap from 20:27 to 21:33 (only the LAN-host commit and PRIORITIES doc). Then a closing burst 21:37–21:46: fix + merge + 3 E2E flow commits in 9 minutes.
- **No multi-day spread**; all work landed in a single evening session (PDT).
