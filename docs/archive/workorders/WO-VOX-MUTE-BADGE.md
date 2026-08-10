# WO-VOX-MUTE-BADGE — local mute badge does not clear on first unmute

**Reported by:** owner, by hand on a physical Pixel 3 XL, 2026-07-27.
**Diagnosed by:** architect, against `integration`.
**Scope:** `apps/mobile/src/features/voice/` only. Do not touch E2E tooling.

## Symptom (exact sequence the owner observed)

1. Person joins a voice call — muted by default, which is intended.
2. The mute button and the person's tile badge both correctly show muted.
3. Person taps **Unmute**.
4. The button flips to unmuted, but **the muted badge persists on their tile**.

Toggling again after that works. Only the *first* unmute misbehaves.

## Root cause — two defects stacked

### 1. Button and badge read different state

- `VoiceStore.toggleMute()` (`VoiceStore.ts:363`) sets the top-level
  `state.isMuted`. The **button** renders from this, so it updates correctly.
- The **badge** renders from `participant.isMuted` (`VoiceTile.tsx:99`), an entry
  in `state.participants`.
- `toggleMute()` never updates the local user's entry in `participants`. The
  only writer is `setMuted(id, muted)`, called from a single place —
  `useVoiceParticipants.ts:176`, driven by LiveKit room events.

So the local user's badge depends entirely on a round trip through LiveKit
events, while their button does not. The two can disagree.

### 2. The first unmute fires an event nobody listens for

`useVoiceParticipants.ts` subscribes to `ParticipantConnected`,
`ParticipantDisconnected`, `ActiveSpeakersChanged`, `TrackMuted`, `TrackUnmuted`
and `TrackPublished`. **`LocalTrackPublished` is not handled anywhere in the
voice feature** (verified by grep across `features/voice/`).

Because the client joins muted, no mic track exists yet. The first
`setMicrophoneEnabled(true)` therefore **creates and publishes** a track, which
emits `LocalTrackPublished` — not `TrackUnmuted`. No listener, so `setMuted` is
never called and the badge keeps its stale value. On every later toggle the
track already exists, so `TrackMuted`/`TrackUnmuted` fire normally and the badge
tracks correctly.

Independent corroboration: `tools/voice-media-probe.mjs` run against a real
device that had joined a call reported the participant present with **no
unmuted audio track** — "connected but silent" — confirming no track is
published at join time.

## Required change

In `VoiceStore.toggleMute()`, after computing `newMuted`, also update the local
participant's entry so the badge reflects the user's own intent immediately:

```ts
const localId = /* room?.localParticipant?.identity */;
if (localId) get().setMuted(String(localId), newMuted);
```

Apply the same treatment in `toggleDeafen()`, which sets `isMuted: true` when
deafening (`VoiceStore.ts:396`) and re-enables the mic when undeafening — both
paths change effective mute state and both currently leave the badge to events.

Prefer this over merely subscribing to `LocalTrackPublished`. Subscribing patches
the first-unmute case but leaves the button and badge backed by two different
sources reconciled only by network events; the local user's own indicator should
never require a round trip. If you also add a `LocalTrackPublished` listener for
robustness, keep the direct update — do not rely on the event alone.

Do not change the join-muted default. It is intended.

## Acceptance criteria

- `Unit:` toggling mute updates BOTH `state.isMuted` and the local participant's
  `isMuted` in `state.participants`, asserted on the **first** toggle from a
  store seeded with a local participant and no published mic track. A test that
  only exercises the second toggle does not satisfy this.
- `Unit:` deafen and undeafen leave the local participant's `isMuted` consistent
  with `state.isMuted`.
- `Unit:` a remote participant's badge is still driven by `TrackMuted` /
  `TrackUnmuted` and is not affected by the local user's toggle.

Do NOT add an E2E flow for this. The existing voice flows assert the button's
testID, which was already correct while the bug was live — that is precisely why
automation missed it. Verification of the visible badge is the owner's, on
hardware.

## Notes

- Voice cannot be exercised on an emulator: `adb reverse` is TCP-only and WebRTC
  media is UDP. Do not attempt to validate this on one; run the unit tests.
- Do not run `npm ci` or `npm install`. `node_modules` is shared and symlinked.
