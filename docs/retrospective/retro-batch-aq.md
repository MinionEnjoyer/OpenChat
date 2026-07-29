tool: File (path: /tmp/retro/batches/batch-aq.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_uFkt4kSU0TUXfSqVTx2y9745`]

<file path="/tmp/retro/batches/batch-aq.md" total_lines="427" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T16:47:18-07:00 — fix(mobile): only ren...
tool: File (path: /tmp/retro/batches/batch-aq.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_KziPFiYhNGenyXgYUBDe4539`]

<file path="/tmp/retro/batches/batch-aq.md" total_lines="427" shown_lines="201-400" truncated="true" next_start_line="401">
   201│ 
   202│  apps/api/src/messages/messages.module.ts ...
tool: File (path: /tmp/retro/batches/batch-aq.md)
tool File completed: <file path="/tmp/retro/batches/batch-aq.md" total_lines="427" shown_lines="401-427" truncated="false">
   401│ - non-push event type (e.g. MESSAGE_CREATED) → zero sends
   402│ - malformed JSON → zero sends, does not throw
   403│ 
   404│ Perturb-and-restore proof: passing a raw object instead o...
## WINDOW
**First**: 2026-07-26T16:47:18-07:00 — `fix(mobile): only render drawer-scrim when a drawer is open`
**Last**: 2026-07-26T17:26:33-07:00 — `fix: convert ChannelForm VOICE type button to MaterialIcons`
**Span**: 39 minutes. 24 commits on a single calendar day (2026-07-26), all within one Pacific-evening session.

## WHAT WAS BUILT
1. **Voice controls overhaul** — fixed mute-button state desync where the mic showed unmuted while actually muted ("requiring two taps to unmute"), rewired deafen/undeafen to correctly restore mic state, replaced emoji glyphs with MaterialIcons across VoiceControls/VoicePill, and added proximity-sensor support via a new `expo-proximity-screen` native module.
2. **Push notification pipeline wired end-to-end** — connected `PushDispatchService` into `MessagesService.create()` for DM, channel, and mention push events, then immediately corrected a double-dispatch bug by routing everything exclusively through the Redis event bus, and hardened tests to drive the real ioredis subscriber callback (JSON-parse path) instead of calling `handleEvent` directly.
3. **Graceful FCM degradation** — `FcmPushTransport` previously threw from its constructor when `FCM_SERVICE_ACCOUNT` was unset, which "caused Nest DI to abort and the ENTIRE API to fail to boot." Introduced `NoopPushTransport` as a null-object fallback selected by a `useFactory` provider, plus tests proving the module boots and push no-ops without credentials.
4. **Orphan-detection gate (`check-orphans.sh`)** — built a tool that flags NestJS providers declared in a module but never injected, and mobile feature modules whose only importers are internal to the same directory. Motivated by the discovery that `PushDispatchService` and `push.ts` "shipped with green specs and zero call sites."
5. **Mobile UX reorg** — fixed an invisible full-screen tap target from an unconditional drawer scrim, moved invite + roles buttons from the channel-header row into the drawer footer as styled labelled buttons, and ran a sweeping icon migration replacing emoji glyphs with MaterialIcons across ShellScreen, ChatPane, and ChannelForm.
6. **Agent infrastructure** — added `tools/fleet-health.sh` for stall/orphan/uncommitted detection, and preserved partial agent work when it step-capped ("Agent step-capped mid-sweep of the rest of the app. Committed by architect to preserve").

## FAILURES AND THEIR COST
- **Mute button state desync** — "the mute button showed 'unmuted' while the mic was actually muted on join, requiring two taps to unmute." Root cause: `VoiceStore` hardcoded `isMuted=false`. No quantified cost stated.
- **Entire API crash from missing FCM config** — `FcmPushTransport` threw from its constructor when `FCM_SERVICE_ACCOUNT` was unset, "which caused Nest DI to abort and the ENTIRE API to fail to boot — not just push being disabled, but every route and every websocket down." No hours figure given; severity is "entire API down."
- **Unwired modules shipped with passing tests** — `PushDispatchService` and `notifications/push.ts` "shipped with green specs and zero call sites — the integration did not exist." Cost: tests were validating code that was never reachable in production; the integration was entirely absent.
- **Double-dispatch bug** — `dispatchMentions` published MENTION to Redis AND called `handleEvent` directly, producing duplicate pushes. Fixed same-session (commits ~7 minutes apart). No cost figure stated.
- **Silent degradation from JSON deserialization** — "passing a raw object instead of a JSON string kills all pushes — JSON.parse receives an object (coerced to '[object Object]'), fails to parse, and the handler returns without calling handleEvent." Found during test hardening. No cost figure stated.
- **TSC build break from icon rename** — `ChannelForm.tsx` referenced the old key `channels.typeVoice` after it was renamed to `typeVoiceIcon`/`typeVoiceLabel` in a prior migration pass, "causing a tsc build break." Fixed same-session. No cost figure stated.
- **Invisible full-screen tap target** — drawer scrim rendered unconditionally as a `StyleSheet.absoluteFill Pressable`, "placing an invisible full-screen tap target over the whole app even with both drawers closed." Found by agent `ui-debt-a`. No cost figure stated.
- **Agent step-cap** — icon migration agent "step-capped mid-sweep," work committed to preserve. No cost figure stated.

## RECURRING THEMES
- **Tests that passed while the code was broken** — the unwired-module pattern: green spec suites for code with zero production call sites. The JSON.parse gotcha: tests calling `handleEvent(obj)` directly passed, but the real subscriber path (JSON string through `JSON.parse`) would silently discard all events. Both required perturb-and-restore to expose.
- **Silent degradation / catastrophic failure from missing config** — FCM config absence killed the entire API instead of gracefully disabling push. The drawer scrim silently consumed all taps. The JSON deserialization failure silently killed all pushes with no log.
- **Immediate self-correction** — the double-dispatch bug was introduced in one commit and fixed 4.5 minutes later in the next substantive commit. The check-orphans gate was introduced and then immediately patched to handle event-bus subscribers (PushDispatchService reached via `OnModuleInit` + `.subscribe()`, not DI injection).
- **Piecemeal icon migration** — emoji-to-MaterialIcons conversion spread across 5+ commits touching different components (VoiceControls, VoicePill, strings.ts, ShellScreen, ChatPane, ChannelForm), with one agent step-capping mid-sweep.

## PROCESS SIGNALS
- **Agent fan-out**: agent `ui-debt-a` found the drawer-scrim bug; an unnamed agent performed the icon sweep and "step-capped mid-sweep"; work was "Committed by architect to preserve."
- **Perturb-and-restore as verification discipline**: used in at least 4 commits — push integration tests ("confirmed FAIL without dispatch calls, PASS with them"), App startup wiring ("Perturb verified: removing the startup call makes this test fail"), orphan gate ("Removed useVoiceConnection import → gate flags it; restored → clean"), and JSON subscriber tests ("passing a raw object instead of a JSON string kills all pushes … Case 1 FAILS under perturbation, all 6 tests PASS after restore").
- **Merge-heavy integration**: 8 merge commits in 39 minutes (branches: `fix-drawer-regression`, `fix-audio-routing`, `fix-mute-state`, `notif-client`, `fix-icons`, `move-server-actions`, `fix-proximity`, `notif-gate`). Two merges had conflicts — `fix-mute-state` in `useVoiceConnection.ts`, `fix-icons` in `strings.ts`.
- **Co-authoring**: Claude Opus 5 credited on the drawer-scrim fix and the icon WIP commit.
- **Verification gates**: `tsc clean`, `eslint clean`, and test suite counts mentioned repeatedly ("85 suites / 815 tests pass").

## PACE
**24 commits, 1 calendar day, 39 wall-clock minutes.** No gaps — a single dense burst from 16:47 to 17:26 Pacific. Commit frequency peaks around 17:22–17:26 with 6 commits (4 merges, 1 test hardening, 1 build fix) in ~4 minutes.
