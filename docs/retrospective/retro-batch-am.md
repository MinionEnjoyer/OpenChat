tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 17 KB · inspect with `retrieve_tool_result ref=art_call_00_CdzhJkXQ3lZO3FG7J8fU3398`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="1-500" truncated="true" next_start_line="501">
     1│ ### 2026-07-25T23:31:16-07:00 — Merge branch 'vox-cha...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 14 KB · inspect with `retrieve_tool_result ref=art_call_00_23Y4YyPigURi5qYxN2pB1580`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="280-501" truncated="false">
   280│ ---
   281│ 
   282│ ### 2026-07-26T10:03:25-07:00 — measure: screenshot...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 15 KB · inspect with `retrieve_tool_result ref=art_call_00_I3fPqZgtHcHUuj5JtErK5720`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="30-279" truncated="true" next_start_line="280">
    30│ 
    31│ ### 2026-07-25T23:34:25-07:00 — fix: type e...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 15 KB · inspect with `retrieve_tool_result ref=art_call_00_O0p0j61J4C4OBOE8VHh70257`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="60-309" truncated="true" next_start_line="310">
    60│ ---
    61│ 
    62│ ### 2026-07-26T00:40:19-07:00 —...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_zKt7JydBHZeV1Nyi24b18041`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="310-501" truncated="false">
   310│  .../mobile/src/features/voice/VoiceChannelView.tsx |  12 +-
   311│  ap...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 16 KB · inspect with `retrieve_tool_result ref=art_call_00_oCseuxXRua0zs3airh1j2293`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="100-349" truncated="true" next_start_line="350">
   100│ - Room-publishing requires native audio bridge
   1...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 16 KB · inspect with `retrieve_tool_result ref=art_call_00_jEs7PsP0XBY0haBUB0096291`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="135-384" truncated="true" next_start_line="385">
   135│ 
   136│  .../e2e/flows/p6-01-voice-channel-join-ti...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 16 KB · inspect with `retrieve_tool_result ref=art_call_00_Slcgf8MS9jh3kFmCjAMM1243`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="165-414" truncated="true" next_start_line="415">
   165│ 
   166│ ---
   167│ 
   168│ ### 2026-07-26T09:48:...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 7 KB · inspect with `retrieve_tool_result ref=art_call_00_CkeAZmDukCWNGDoCFXCc4201`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="195-294" truncated="true" next_start_line="295">
   195│ 
   196│ D2 — display-name enrichment (ACCEPTED, unc...
tool: File (path: /tmp/retro/batches/batch-am.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_XBSl0RCaQb1bcqYC7vVI1624`]

<file path="/tmp/retro/batches/batch-am.md" total_lines="501" shown_lines="425-501" truncated="false">
   425│ 
   426│ ### 2026-07-26T11:14:56-07:00 — docs: diagnosis of five remainin...
## WINDOW

- **First commit**: 2026-07-25T23:31:16-07:00
- **Last commit**: 2026-07-26T11:27:36-07:00
- **Wall-clock span**: ~12 hours (23:31 Sunday → 11:27 Monday)

## WHAT WAS BUILT

1. **Voice Channel View on mobile** — a full-screen voice UI (VoiceChannelView) with participant tile grid, mute/deafen controls, camera toggle, safe-area handling, and display-name enrichment from the backend. Auto-joins on channel tap; suppresses the floating VoicePill while foregrounded.

2. **Mobile soundboard** — SoundboardPanel with horizontal scroll of per-server sounds, local-only playback via expo-audio, and a deferred room-publish seam (publishSoundToRoom). Backend CRUD endpoints were already present; this wired the mobile UI reachable from VoiceChannelView. Room-publish blocked on React Native lacking Web Audio API and no native audio bridge.

3. **E2E harness hardening** — four rounds of it: bounded per-flow timeout + live progress output + debuggable-build preflight; `pm clear` + canonical `_login.yaml` subflow extracted from 28 copy-pasted login blocks (belt-and-suspenders session isolation); re-grant of CAMERA/RECORD_AUDIO runtime permissions after `pm clear`; and four preflight gates (timeout-verdict tracking, stale-APK detection, nonexistent-flow-path abort, wrong-API-host-in-bundle abort).

4. **KeyboardAvoidingView audit and fix** — every TextInput across 10 modal/sheet screens was hidden behind the Android keyboard. An audit table enumerated all 12 inputs in the app; each was wrapped in KeyboardAvoidingView with platform-appropriate behavior/offset. A before/after test was written that fails pre-fix and passes post-fix.

5. **E2E flow repair sprint at the tail** — diagnosis of the five remaining failures (dead component, structurally impossible flow, stale fixture, two undetermined), followed by three fixes landing in rapid succession: delete dead p0-17-hello flow + component, seed p4-05-block-collapse with real block state and rewrite to text-based assertions (survives re-seed), update voice flows for the new full-screen VoiceChannelView interaction model.

6. **Soundboard feasibility research** — a 320-line SPIKE documenting the blocked mobile audio path: no JS API in `@livekit/react-native` for non-mic PCM injection, the Android native seam mapped (AudioProcessorInterface / AudioRecordSamplesDispatcher / PeerConnectionFactory.createAudioTrack), and 6 unknowns listed with risk ratings. Findings directly informed the deferred publishSeam approach.

## FAILURES AND THEIR COST

1. **Unbounded E2E wait**: "one hung flow blocked the entire run indefinitely" — the suite would hang forever with no signal. Cost: runs that appeared "in progress" were actually dead.

2. **Silent E2E output**: "hung and working were indistinguishable" — no per-flow progress lines meant zero observability into which flow had stalled. Cost: operator could not tell a 30-flow run from a dead one.

3. **DEBUG build installed over release**: "made all 7 Pixel flows fail invalidly" — a debug APK lacking release features produced confident failures. Cost: 7 flows of invalid results before the preflight gate existed.

4. **Timed-out flows vanishing from verdicts**: "a flow exceeding PER_FLOW_TIMEOUT produced no verdict line, so totals printed as if 28 were the whole suite when 30 were dispatched." Cost: *2 dispatched flows silently disappeared from every run.*

5. **Stale APK**: "a previous build's APK got installed and would have made every result meaningless." Cost: *a full 30-flow run would produce garbage — no detection existed before the mtime-vs-HEAD preflight.*

6. **Nonexistent flow paths**: "a bad flow list made flows 'fail' in 4 seconds without Maestro ever running." Cost: *false failures indistinguishable from real ones; path-existence check did not exist.*

7. **Wrong API host baked into bundle**: "a build defaulting to 10.0.2.2 (emulator-only) was run against physical devices." Cost: *every flow in a run would hit a dead backend; the `EXPECTED_API_HOST` grep did not exist.*

8. **Maestro `clearState` not clearing expo-secure-store**: "causing session restore to skip login screen on subsequent flows." Cost: *flows that depended on login-screen visibility asserted against a screen they never saw.*

9. **`pm clear` wiping runtime permission grants**: "wipes expo-secure-store tokens (its purpose) but also wipes runtime permission grants, which would break every voice and media flow." Cost: *every voice/media flow would fail after the pm clear fix — prevented by the re-grant, though no flow was shown to FAIL without grants, so the cost here is "NOT PROVEN" and the falsification is "INCOMPLETE."*

10. **Stale fixture: hardcoded UUID not in seed** (p4-05-block-collapse): the flow asserted against a `blocked-msg-{hardcoded-uuid}` that did not exist in the database. Cost: *flow permanently broken until seed was extended.*

11. **Dead component carrying a flow** (p0-17-hello): "HelloScreen was Phase 0 scaffold — zero imports, unreachable from the app." Cost: *a flow existed for code that could never execute.*

12. **Structurally impossible flow** (p1-02-session-restore): "`pm clear` before every flow wipes tokens" — the flow that tests session restore was impossible by design after the login isolation fix. Cost: *permanently-broken flow.*

13. **Duplicate local participant** (D1 voice bug): "two tiles both labelled '(you)', one renders '?'" — `VoiceStore.upsertParticipant` created two `isLocal:true` entries when identity arrived after mount (Android RN timing). Cost: *corrupted participant UI for every voice channel join on Android.*

14. **KeyboardAvoidingView missing on 10 modal inputs**: "Every TextInput inside a Modal or bottom-sheet was being hidden behind the keyboard on Android." Cost: *text entry impossible in modals — edit message, create channel, add friend, poll creation, GIF search, emoji search, role editing, server creation/edit, invite join, and login were all keyboard-broken.*

15. **Broken line continuation in preflight abort message** (self-inflicted fix): the commit that added preflight introduced a shell syntax error in the abort message. Cost: *self-caught in the next commit (3 minutes later).*

## RECURRING THEMES

- **Silent test invalidation is the dominant failure mode.** E2E runs produced confident-looking output that was wrong: hung flows indistinguishable from running, timed-out flows vanished from counts, stale APKs produced results as if current, nonexistent paths produced 4-second pseudo-failures, wrong API hosts produced failures indistinguishable from real bugs. Every one of these required a *detector* to be added — none was caught by the existing harness.

- **Fixes that break other things.** `pm clear` fixed session leakage but broke runtime permissions (voice/media flows). Login subflow extraction fixed 28-copy-paste but made session-restore flow structurally impossible. Each isolation fix carried a second-order cost.

- **"NOT YET IMPLEMENTED" / "NOT PROVEN" / "INCOMPLETE" as deliberate annotation.** The soundboard `publishSeam.ts` logs no-op; the permission re-grant commit explicitly says "do not treat this commit as evidence that it fixed a failing flow"; falsify harnesses exist but are unfinished. These are not sloppy handoffs — they are discipline markers distinguishing what's done from what's placeholder.

- **Text-based assertions needed when IDs are ephemeral.** The block-collapse flow and the session-restore diagnosis both trace back to hardcoded UUIDs that break across re-seeds. The fix pattern: seed the state, store fixture IDs, and assert by display text not by testID.

## PROCESS SIGNALS

- **Branch-then-merge workflow**: `vox-channel-view`, `wire-media`, `wire-polls`, `e2e-login-state`, `vox-ui-fixes`, `e2e-voice-flows` — six feature branches merged into `integration` in this 12-hour window. Merges are clean integration points with no merge-conflict noise visible.

- **Agent fan-out**: the permission re-grant commit is "Authored by agent e2e-permgrant (step-capped twice before committing); committed by architect after review." An agent ran out of steps twice before completing the work; a human reviewed and landed it.

- **Verification gates referenced inline**: "Gates: tsc 0, eslint 0, jest 68 suites / 738 passing, codegen 0" in the type-error fix commit. "api tsc --noEmit: rc=0; api eslint: rc=0; mobile tsc --noEmit: rc=0; mobile eslint: rc=0; mobile jest: 68 suites / 738 passing; codegen --check: rc=0" in the soundboard backend commit.

- **Physical-device verification**: screenshots committed to `artifacts/vox-ui-verify/` from "physical Pixel (57f2ec0)" — not just emulator testing.

- **Diagnosis-before-fix**: `DIAG-SINGLES.md` enumerates all five remaining failures with classifications (PRODUCT BUG, STRUCTURALLY IMPOSSIBLE, STALE FIXTURE, UNDETERMINED) before any fix commits land. Fixes follow diagnosis.

- **Perturb-and-restore**: `check-unreachable.sh` confirmed no regression after deleting HelloScreen. Before/after tests for KeyboardAvoidingView "FAIL before the fix… PASS after the fix."

- **Abandoned / deferred**: Room-publish for soundboard "deferred per docs/SOUNDBOARD-RN-SPIKE.md." PTT "out of scope for mobile (upstream has it; do not port)." The `_p6-falsify.yaml` and `_p6-02-falsify.yaml` falsification harnesses exist but are "unfinished."

## PACE

- **24 commits** in this slice (including merges).
- **1 distinct calendar day**: 2026-07-26 (first three commits are at 23:31 on 07-25, the rest from 00:37 through 11:27 on 07-26).
- **Bursts visible**:
  - *23:31–23:34* (3 minutes): three merges + immediate type-error fix.
  - *00:37–00:57* (20 minutes): E2E timeout feat → fix → two docs → soundboard backend. Five commits in rapid sequence, including the broken-line-continuation fix 3 minutes after the feat.
  - *03:47*: lone login-state fix — a 2h50m gap from the prior burst, suggesting this was agent work that ran while the author slept or waited.
  - *09:44–10:03* (19 minutes): SPIKE doc → voice fixes (D1-D4) → permission re-grant → soundboard panel → screenshot. Five commits in dense sequence — morning push.
  - *10:56–11:27* (31 minutes): KeyboardAvoidingView audit → voice flow updates → merge → diagnosis doc → harness harden → dead code removal → block-collapse fix. Seven commits closing the window.
