# 15 — PHASE 6: Voice & Video (LiveKit)

Goal: always-on voice channels and DM calls on mobile with correct audio routing, background
behavior, and OS call integration. FRs: VOX-001..007 (060 P2). The server side already works
(E8-verified token issuance; web is the reference peer) — this phase is client-heavy; backend
changes expected: none (any need = escalation, not improvisation).

Out of scope: hosting watch parties · noise-suppression settings UI · voice-activity
sensitivity tuning UI (defaults only) · screenshare PUBLISH from mobile (view-only, VOX-007).

Hardware/verification note: audio correctness is asserted via **LiveKit stats and track
events, never by ear**: the two-emulator rig publishes a known tone (emulator virtual mic WAV
via `adb emu avd hostmicon`/injected audio, configured by `devctl device pair --audio-fixture
tone440.wav`), and tests assert remote `audioLevel > threshold` and packet counts increasing.
This is the automated stand-in for HITL listening; a human listen-through happens once at
signoff (T4 demo).

## Work items

**P6-01 LiveKit integration layer** (`features/voice` + `stores/voice`)
- `@livekit/react-native` + config plugin; `registerGlobals()` at app boot; connect with
  token from `POST /voice/:id/join`; room lifecycle mapped into the voice store (single
  active room invariant — joining elsewhere leaves first, matching web).
- Tests: integration vs dev LiveKit: join → `participants` endpoint contains user →
  leave cleans VoiceSession (characterization cross-check).

**P6-02 Voice channel UX** — tap voice channel → join; channel screen: participant tiles,
speaking rings (`ActiveSpeakersChanged`/audio level), mute badges; persistent bottom pill
(channel name, mute/deafen/disconnect) across navigation (FR-VOX-001/002 UI). Occupancy in
channel list via participants query + `notify`-driven refresh (or granular event if E3/P3-07
provides one) ≤3s (FR-VOX-004).

**P6-03 Controls & routing** — mic mute (track-level), deafen (disable all remote audio +
implies mute, matching Discord semantics), speaker/earpiece toggle
(`AudioSession`/InCallManager per LiveKit RN docs), disconnect (FR-VOX-003). Stats test:
muted local track publishes silence (audioLevel≈0 remote-side).

**P6-04 Background & OS call services** — Android foreground service (mic type) via the
LiveKit/Expo plugin config; iOS background-audio entitlement; interruption handling (phone
call → auto-mute, restore after). E2E: backgrounded 60s call keeps packets flowing
(stats via a probe participant `tools/probe/lk-probe.mjs` joined from the host).

**P6-05 DM calls** — caller: call button in DM → `voice/:dmChannelId/join` + ring semantics
per characterization of web (Phase-0 E-note tells us whether ring is triggered by join or an
explicit endpoint — encode and follow); callee: `call.ring` op → full-screen incoming UI
(notifee full-screen intent Android / CallKit via `expo-callkeep`-equivalent config plugin
iOS at Phase 8 hardening; Phase 6 = in-app full-screen + system notification), accept/
decline, in-chat active-call banner (FR-VOX-005). Two-device E2E ring→accept→bidirectional
stats→hangup.

**P6-06 Video** — camera publish toggle, front/back flip, remote video tiles, auto-quality
(LiveKit adaptive defaults) (FR-VOX-006). E2E: emulator virtual camera scene → remote frame
checksum non-black assertion via probe participant frame capture.

**P6-07 Screenshare viewing (P2)** — subscribe + render remote share track with LIVE badge
and per-stream view/hide, parity with web `d0439e2` behavior (FR-VOX-007). Integration with
web-originated share (Playwright drives web peer).

**P6-08 Audit & refactor + signoff.** Demo (human listen-through): phone↔phone voice channel,
mute/deafen/speaker, background 2min, DM ring accept/decline, video both ways, view a web
screenshare. Gates: standard + NFR-04 memory harness now armed + no backend diffs
(`git diff` empty under `apps/api` this phase or escalation on file).
