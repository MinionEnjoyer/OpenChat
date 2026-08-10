tool: File (path: /tmp/retro/batches/batch-ax.md)
tool File completed: [Exact evidence retained · 13 KB · inspect with `retrieve_tool_result ref=art_call_00_e46jSzzNWMhRJo6rCMyI1620`]

<file path="/tmp/retro/batches/batch-ax.md" total_lines="601" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-27T10:39:02-07:00 — Merge branch 'fix-flo...
tool: File (path: /tmp/retro/batches/batch-ax.md)
tool File completed: [Exact evidence retained · 13 KB · inspect with `retrieve_tool_result ref=art_call_00_r230YjSCFKWWechL0Orx7548`]

<file path="/tmp/retro/batches/batch-ax.md" total_lines="601" shown_lines="201-400" truncated="true" next_start_line="401">
   201│ 
   202│ Division this supports: Maestro on a physi...
tool: File (path: /tmp/retro/batches/batch-ax.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_ffv0BZVsa4vwo1zneU205006`]

<file path="/tmp/retro/batches/batch-ax.md" total_lines="601" shown_lines="401-600" truncated="true" next_start_line="601">
   401│ - initLocalNotifications() requests POST_NOTIFICATI...
tool: File (path: /tmp/retro/batches/batch-ax.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_5oAkzdDPQbFcIEKZoFQK7489`]

<file path="/tmp/retro/batches/batch-ax.md" total_lines="601" shown_lines="527-601" truncated="false">
   527│  docs/AUTH-PKCE-PROPOSAL.md                    | 10 +++++-----
   528│  d...
tool: File (path: /tmp/retro/batches/batch-ax.md)
tool File completed: [Exact evidence retained · 5 KB · inspect with `retrieve_tool_result ref=art_call_00_BfEWeNNLqRk8EO1abqdv4949`]

<file path="/tmp/retro/batches/batch-ax.md" total_lines="601" shown_lines="330-404" truncated="true" next_start_line="405">
   330│ 
   331│ Also removes an unused @ts-expect-error in ...
## WINDOW
First: `2026-07-27T10:39:02-07:00` — Last: `2026-07-27T23:39:19-07:00`
Wall-clock span: **~13 hours**, single calendar day.

## WHAT WAS BUILT
1. **E2E flow state isolation** — `_login.yaml` `clearState: true` fixed cross-flow state pollution (flows landing on screens left by prior flows: Server Settings, "no text channels"). Accompanied by a 131-line audit document.
2. **Dev-login conditional gate** — `EXPO_PUBLIC_ENABLE_DEV_LOGIN` env var gates the dev-login UI at compile time, so release builds never ship it but the 53-flow E2E suite (which runs against `assembleRelease`) includes it.
3. **Voice mute badge fix (WO-VOX-MUTE-BADGE)** — Two stacked defects: button and badge read different state sources (`state.isMuted` vs `state.participants`), and `LocalTrackPublished` was entirely unhandled so the first unmute after join-muted never updated the badge. Fixed in `VoiceStore` with direct participant update.
4. **Voice-media probe** — `tools/voice-media-probe.mjs`: a standalone LiveKit probe that connects to a room with a user-supplied token and verifies audio actually crosses the wire. Division of labor: Maestro proves UI state, this probe proves media transport, human confirms it sounds like a call.
5. **Local notifications without FCM** — `localNotify.ts` bridges WebSocket message/mention frames to `expo-notifications` for foreground (in-app toast) and background (real OS notification), covering DMs, @mentions, per-channel levels. Deliberately scoped to *backgrounded-but-alive*; killed-process delivery deferred to FCM.
6. **FCM google-services wiring** — `app.json` updated so prebuild adds the `com.google.gms.google-services` plugin; the first real notification reached a physical device same night. The JSON is gitignored (not secret, but identifies *this* project's Firebase project — upstream deploys supply their own).
7. **Auth endpoint disambiguation** — `POST /auth/token` → `POST /auth/oauth/token` across 22+ files (backend, mobile, contracts, docs, specs). One character away from upstream's `/auth/tokens` (plural, long-lived API tokens) with different semantics and guards.

## FAILURES AND THEIR COST
- **Two wrong E2E verdicts from XML-only triage** — "voice-pill still visible after disconnect" was "a 5px sliver mid-dismissal animation that no human could see"; a rail item Maestro "could not find" was "plainly on screen." Both "called product defects from XML alone."
- **Typecheck silently red while tests green** — mute-badge fix merged "after running jest but not tsc — the suite was green while the typecheck was red." An unused `@ts-expect-error` shipped.
- **6 invented requirement IDs** — 27 `@satisfies` annotations referenced `FR-SOUND-001..006`, which "do not exist." "The ids were invented alongside the soundboard code and never written down, and the trace gate rejected all six."
- **FR-NOTIF-001..004 marked complete but never worked** — "Push has never worked on any device. Verified on a physical Pixel: messages to a locked device produced nothing on the lock screen." Cost: "environmental and total — no FCM_SERVICE_ACCOUNT server-side … and no google-services.json client-side."
- **Implemented-but-unwired notification bridge** — "reverting queryClient.ts entirely left 122 tests passing, which is the same implemented-but-unwired shape as BACKLOG #56." The notifyIncoming calls were dead code with full test coverage.
- **night-watch trusted silent-failure agents** — "On 2026-07-27 a credit exhaustion produced exactly that and the wave looked successful." Agents whose API calls fail mid-run "exit INSTANTLY and report status=completed with zero commits, which is indistinguishable from a finished job."

## RECURRING THEMES
- **Tests that pass while the code is broken** — `notifyIncoming` bridge unwired: 122 pass. `@satisfies` for nonexistent requirements: tests still run and pass. Typecheck red but jest green. The pattern across this slice: tests prove the *units* work but never prove they're *wired*.
- **Perturb-and-restore as the verification standard** — mute badge: "with the fix reverted and the tests kept, 4 of 47 fail; restored, 47 pass." Notif bridge: "deleting the notifyIncoming(frame) calls fails 4 of 9 queryClient tests. Restored, all pass." These are the moments where verification actually caught something instead of confirming a tautology.
- **Agent output verified, not trusted** — "Verified before merge, not taken on the agent's word"; "Automation could not have caught this defect"; "Visible confirmation on hardware remains the owner's." Every merge commit includes an explicit verification statement.
- **Silent degradation across subsystems** — E2E gave wrong verdicts (screenshot missing), push was marked complete but nonfunctional, night-watch trusted empty agents, the trace gate let invented IDs through until the gate itself was fixed. In every case the system reported success while failing.
- **Scope questions surfaced rather than buried** — SOUND-SCOPE filed when trace fix revealed soundboard room-publish exceeds the spec's stated scope; notification probe "documents its own limits" about background/lock-screen without FCM.

## PROCESS SIGNALS
- **Agent fan-out with human merge gate**: every commit co-authored by "Claude Opus 5." Implementation commits land, then a separate merge commit with explicit verification (test counts, tsc, perturb-and-restore).
- **Worktrees / branching**: `fix-flow-reset` merged from a named branch. Implementation and merge are distinct commits (mute badge: implement → merge; notif: implement → bridge tests → merge; auth rename: implement → merge).
- **Live probes built alongside features**: `voice-media-probe.mjs` and `notif-live-probe.sh` are standalone tools that drive real devices, not tests that mock. "Emulators are excluded from all three."
- **Mid-window tooling fix**: screenshot-on-failure added to `e2e-run-only.sh` *during* the session because the XML-only gap produced wrong verdicts earlier that same day.
- **Agent caught owner's survey gap**: "I checked packages/contracts and specs/03-CONTRACTS.md and reported the path absent from any contract. It is in contracts/openapi.yaml. The agent caught that and stopped to ask rather than proceeding on a wrong premise."
- **Defensive instrumentation**: night-watch.sh gained W0 API-failure grep after credit exhaustion was discovered earlier that same day.

## PACE
- **15 commits**, 1 calendar day (2026-07-27)
- **Morning burst**: 2 commits between 10:39–10:53 (14 minutes)
- **11-hour gap** (10:53 → 22:05)
- **Evening burst**: 13 commits between 22:05–23:39 (94 minutes, dense — average ~7 minutes per commit including merges)
