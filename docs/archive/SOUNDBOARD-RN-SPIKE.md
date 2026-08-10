# Soundboard React Native SPIKE — Feasibility Research

**Date**: 2026-07-26
**Goal**: Determine how (or whether) the RN mobile app can publish non-microphone audio into a LiveKit room — client-side publish, same architecture as upstream web. Server-side bot explicitly rejected.

---

## 1. Reference: How Web Does It

**File**: `apps/web/src/lib/useVoice.ts` (lines 76–105)

```ts
// Lazy-create audio graph + publish DEDICATED soundboard track
const ctx = new AudioContext();
const dest = ctx.createMediaStreamDestination();   // → MediaStream
const track = dest.stream.getAudioTracks()[0];     // → MediaStreamTrack
await room.localParticipant.publishTrack(track, {
  name: 'soundboard', dtx: true, red: false
});

// On each tap:
const buf = await ctx.decodeAudioData(arrayBuffer); // decode sound file
const node = ctx.createBufferSource();
node.buffer = buf;
node.connect(dest);             // → published into room
node.connect(ctx.destination);  // → local monitor
node.start();
```

**Key architecture points**:
1. Soundboard audio is a **separate track** from the microphone (`name: 'soundboard'`).
2. Both tracks are published simultaneously — LiveKit server-side mixes them.
3. The user hears the sound locally via `ctx.destination`.
4. Uses Web Audio API (`AudioContext`, `MediaStreamAudioDestinationNode`, `decodeAudioData`). **None of this exists in React Native.**

---

## 2. Q1: Does a Non-Mic Audio Source API Exist in the Installed RN Packages?

**Verdict: NO. Definitive negative. No supported JS API exists to publish audio from anything other than the microphone.**

### 2.1 `@livekit/react-native` 2.12.0

**Source**: `apps/mobile/node_modules/@livekit/react-native/src/index.tsx`

Exports from this package:
- Re-exports `livekit-client` (including `LocalAudioTrack`, `createLocalAudioTrack`, `Room`, `LocalParticipant.publishTrack`)
- `AudioSession`, `AudioDeviceModule`, `AudioEngineMuteMode`, `AudioEngineAvailability` (from `@livekit/react-native-webrtc`)
- Hooks: `useE2EEManager`, `useMultibandTrackVolume`, `useTrackVolume`
- Components: `LiveKitRoom`, `BarVisualizer`, `VideoTrack`, `VideoView` (deprecated)
- `AudioManager`, `AudioManagerLegacy`, `MediaRecorder`
- `RNE2EEManager`, `RNKeyProvider`

**No custom audio source, no `createLocalAudioTrack({ source: … })`, no non-mic audio publication API.**

### 2.2 `livekit-client` 2.21.0 (transitively hoisted)

**Source**: `apps/mobile/node_modules/livekit-client/src/room/track/create.ts` (lines 178–185)

```ts
export async function createLocalAudioTrack(
  options?: AudioCaptureOptions,
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    audio: options ?? true,
    video: false,
  });
  return <LocalAudioTrack>tracks[0];
}
```

- `createLocalTracks` internally calls `getUserMedia({ audio: true })`.
- `AudioCaptureOptions` interface (lines 270–310 of `options.ts`) has only standard constraints: `autoGainControl`, `channelCount`, `deviceId`, `echoCancellation`, `latency`, `noiseSuppression`, `voiceIsolation`. **No custom source or stream override.**

- `LocalAudioTrack` constructor (`LocalAudioTrack.ts` line 28):
  ```ts
  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = true,
    audioContext?: AudioContext,
    loggerOptions?: LoggerOptions,
  )
  ```
  Takes a `MediaStreamTrack` — but in RN, this must come from `getUserMedia()` (mic) or a remote peer connection. There is no API to **construct** a `MediaStreamTrack` from PCM data.

- `LocalParticipant.publishTrack(track, opts)` — works, but only if you have a track. No track-creation API for non-mic audio.

### 2.3 `@livekit/react-native-webrtc` 144.1.2

**Source**: `apps/mobile/node_modules/@livekit/react-native-webrtc/src/`

Key exports: `MediaStreamTrack`, `MediaStream`, `RTCPeerConnection`, `RTCView`, `mediaDevices`, `ScreenCapturePickerView`, `AudioDeviceModule` (iOS only).

- `MediaStreamTrack` constructor (from `MediaStreamTrack.ts`):
  ```ts
  constructor(info: MediaStreamTrackInfo) { … }
  ```
  `MediaStreamTrackInfo` interface:
  ```ts
  { id: string; kind: string; remote: boolean;
    constraints: object; enabled: boolean;
    settings: object; peerConnectionId: number;
    readyState: MediaStreamTrackState; }
  ```
  This is a **JS wrapper** for a native-side track. It has no mechanism to create a track from PCM. Tracks originate only from:
  - `getUserMedia()` → native mic capture
  - Remote peer connections (`RTCPeerConnection.addTrack`)

- `MediaStream` constructor accepts an array of `MediaStreamTrack` or another `MediaStream` — but all tracks must already exist natively.

- `getDisplayMedia()` (`getDisplayMedia.ts`) — screen capture only. No audio capability exposed.

- **`AudioDeviceModule`** (`AudioDeviceModule.ts`): iOS/macOS only. Throws `"AudioDeviceModule is only available on iOS/macOS"` on Android. Controls audio routing (speaker/earpiece/bluetooth), not audio injection.

---

## 3. Q2: The Android Native Seam

### 3.1 Audio Pipeline Overview

```
JavaAudioDeviceModule (mic capture)
  └─ AudioRecordSamplesDispatcher (distributes mic samples to sinks)
       └─ AudioSinkManager → AudioTrackSink (for JS-side volume analysis, etc.)

PeerConnectionFactory
  └─ createAudioSource(constraints)  // placeholder — no PCM injection API
  └─ createAudioTrack(id, source)    // wraps source into a track
       └─ stored in GetUserMediaImpl.tracks map
       └─ published via RTCPeerConnection.addTrack()
```

### 3.2 Key Files (Android)

| File | Role |
|------|------|
| `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java` | Main RN module. Line 120: `JavaAudioDeviceModule.builder(reactContext).createAudioDeviceModule()`. Line 73: `AudioDeviceModule mAudioDeviceModule` field. Line 461: `public MediaStreamTrack getTrack(int pcId, String trackId)`. Line 483: `public void registerTrack(AudioTrack, AudioSource)`. |
| `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/GetUserMediaImpl.java` | Line 89: `createAudioTrack()` — `pcFactory.createAudioSource(peerConstraints)` + `pcFactory.createAudioTrack(id, audioSource)`. Line 472: `registerTrack(AudioTrack, AudioSource)`. |
| `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModuleOptions.java` | Singleton options. Fields: `audioDeviceModule`, `videoEncoderFactory`, `videoDecoderFactory`, `audioProcessingFactoryFactory`. A custom `AudioDeviceModule` can be injected here. |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/LiveKitReactNative.kt` | `setup()` creates `JavaAudioDeviceModule` with `SamplesReadyCallback` and sets it on `WebRTCModuleOptions`. `audioRecordSamplesDispatcher` for distributing mic samples. |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/AudioProcessorInterface.kt` | `processAudio(numBands, numFrames, buffer: ByteBuffer)` — modifies capture audio in-place (10ms frames). Cannot inject new audio. |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/CustomAudioProcessingFactory.kt` | `CustomAudioProcessingController` wraps `ExternalAudioProcessingFactory`. `capturePostProcessor` and `renderPreProcessor` are settable. These modify existing audio, not inject new audio. |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/AudioRecordSamplesDispatcher.kt` | Implements `JavaAudioDeviceModule.SamplesReadyCallback`. Dispatches mic samples to `AudioTrackSink` instances. **Receive-only — cannot inject samples upstream.** |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/AudioSinkManager.kt` | Manages `AudioTrackSink` → `AudioTrack` attachments. `attachSinkToTrack()` for local tracks via `audioRecordSamplesDispatcher`. **Receive-only.** |
| `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/org/webrtc/audio/WebRtcAudioTrackHelper.kt` | Helper for `JavaAudioDeviceModule` audio attributes. |

### 3.3 iOS Native Seam (for completeness)

| File | Role |
|------|------|
| `apps/mobile/node_modules/@livekit/react-native/ios/Headers/LKAudioProcessingAdapter.h` | `LKExternalAudioProcessingDelegate` protocol: `audioProcessingInitializeWithSampleRate:channels:`, `audioProcessingProcess:(RTCAudioBuffer *)`, `audioProcessingRelease`. Modifies capture audio in-place. Cannot inject. |
| `apps/mobile/node_modules/@livekit/react-native/ios/LKAudioProcessingAdapter.m` | Implements `RTCAudioCustomProcessingDelegate`. Chained processor list for capture post-processing. |
| `apps/mobile/node_modules/@livekit/react-native/ios/LKAudioProcessingManager.m` | `addCapturePostProcessor`, `removeCapturePostProcessor` — exposes processor registration to JS. |

### 3.4 Why a Naïve Second `AudioTrack` Won't Work

You could theoretically do this on Android:
```java
PeerConnectionFactory factory = webRTCModule.mFactory;
AudioSource source = factory.createAudioSource(new MediaConstraints());
AudioTrack track = factory.createAudioTrack("soundboard-" + UUID.randomUUID(), source);
webRTCModule.registerTrack(track, source);
// ... add to peer connection
```

**But**: `org.webrtc.AudioSource` is essentially void — it has no public method to push PCM samples into it. The actual audio data flows from the OS-level `AudioRecord` through `JavaAudioDeviceModule` into the WebRTC native C++ layer. Neither `AudioSource` nor `AudioTrack` offer a `pushSamples()` or `write()` method in the bundled `libwebrtc`.

---

## 4. Q3: Mixing — Mic + Soundboard Simultaneous?

**Web behavior** (from `apps/web/src/lib/useVoice.ts`):
- Mic is published on the default mic track.
- Soundboard is published on a **separate** track (`name: 'soundboard'`).
- Both tracks are published simultaneously by the same participant.
- LiveKit handles server-side mixing/forwarding.
- The publishing user hears the sound locally via `ctx.destination` (a dedicated output node in the Web Audio graph).

**Implication for RN**: The soundboard track must coexist with the mic track. You cannot replace the mic track — the user may be speaking while playing sounds. The architecture must support two concurrent published audio tracks from the same participant.

This means the native module approach must:
- Create a **second** `AudioTrack`/`RTCAudioSource` (not replace the existing mic track)
- Add it to the **same** `RTCPeerConnection` as the mic track
- `room.localParticipant.publishTrack(soundboardTrack, { name: 'soundboard', dtx: true, red: false })`

---

## 5. Q4: Smallest Viable Implementation

### 5.1 The Core Problem

Neither `@livekit/react-native` 2.12.0 nor `@livekit/react-native-webrtc` 144.1.2 provides a JS-level API to:
1. Create an `AudioTrack` from PCM data
2. Inject PCM into an existing `AudioTrack`
3. Create any audio source that is not the microphone

A **native module** is required on both platforms. There is no pure-JS or pure-TS solution.

### 5.2 Android Implementation Strategy

**Approach**: Subclass or wrap `JavaAudioDeviceModule` to create a secondary "virtual microphone" that feeds PCM into the WebRTC engine alongside the real mic.

**Concrete files to add/change**:

| File | Type | Purpose | Risk |
|------|------|---------|------|
| `apps/mobile/android/app/src/main/java/…/soundboard/SoundboardAudioSource.kt` | **New** | Custom `AudioSource`-like class that accepts PCM via `write(ByteBuffer)` and feeds it into a `PeerConnectionFactory.createAudioTrack()`. Must bridge to WebRTC C++ internals or use a custom `AudioDeviceModule`. | **HIGH**. No public API for `AudioSource.write()`. May require JNI into libwebrtc. |
| `apps/mobile/android/app/src/main/java/…/soundboard/SoundboardModule.kt` | **New** | React Native native module. Bridged methods: `createTrack()`, `writePcm(base64Data, sampleRate, channels)`, `destroyTrack()`. Returns a track ID that JS can publish. | **HIGH**. Thread-safety, 10ms frame timing, buffer management. |
| `apps/mobile/android/app/src/main/java/…/MainApplication.kt` | **Edit** | Register `SoundboardModule` in the package list. | **LOW** |
| `apps/mobile/src/features/voice/SoundboardNative.ts` | **New** | TypeScript wrapper: `NativeModules.SoundboardModule.createTrack()`, etc. | **LOW** |

**Alternative Android approach**: Use `AudioProcessorInterface` capture post-processor to overwrite mic audio with soundboard PCM when a sound is playing, with sample-accurate mixing. This avoids needing a second track entirely but means:
- Mic audio may be briefly interrupted/corrupted during sound playback
- Requires duplicating the mic track for the soundboard (not parity with web)
- Lower risk: no need to create a second peer connection track

### 5.3 iOS Implementation Strategy

**Approach**: Use `LKExternalAudioProcessingDelegate` on the capture side to mix soundboard PCM into the existing mic buffer, OR create a custom `RTCAudioDeviceModule` that provides a second "virtual input."

| File | Type | Purpose | Risk |
|------|------|---------|------|
| `apps/mobile/ios/…/SoundboardAudioMixer.swift` | **New** | Implements `LKExternalAudioProcessingDelegate`. Mixes decoded PCM into the capture buffer when a sound is active. | **MEDIUM**. In-place mixing is well-understood. Risk is in timing/synchronization. |
| `apps/mobile/ios/…/SoundboardBridge.m` | **New** | Obj-C bridge to expose mixing to JS via React Native native modules. | **LOW** |
| `apps/mobile/src/features/voice/SoundboardNative.ts` | **New/Edit** | Shared TS wrapper. Platform-specific native module calls. | **LOW** |

### 5.4 Shared JS/TS Implementation

| File | Type | Purpose | Risk |
|------|------|---------|------|
| `apps/mobile/package.json` | **Edit** | Add `expo-av` or `react-native-audio-api` for audio decoding (fetch URL → PCM). | **MEDIUM**. New dependency, size impact. |
| `apps/mobile/src/features/voice/SoundboardService.ts` | **New** | Orchestrates: fetch sound URL → decode → feed PCM to native module → publish track → play locally. | **MEDIUM** |
| `apps/mobile/src/features/voice/SoundboardStore.ts` | **New** | Zustand store for soundboard state (sounds list, loading, muteFx). | **LOW** |
| `apps/mobile/src/features/voice/VoiceStore.ts` | **Edit** | Add `soundboardTrack` ref, `publishSoundboardTrack()` and `unpublishSoundboardTrack()` actions. | **LOW** |
| `apps/mobile/src/features/voice/useVoiceConnection.ts` | **Edit** | Publish soundboard track alongside mic on connection. | **LOW** |
| `apps/mobile/src/components/SoundboardSheet.tsx` | **New** | UI: bottom sheet with sound buttons. Calls `SoundboardService.play(url)`. | **LOW** |
| `apps/mobile/src/api/schema.ts` | **Exists** | `ServerSound` type already present (line 91). | **NONE** |
| `apps/mobile/src/features/channels/ChannelList.tsx` | **Edit** | Add soundboard button to voice channel header (like web's 🔊 button). | **LOW** |

### 5.5 Risk Summary

| Component | Risk | Rationale |
|-----------|------|-----------|
| Android native audio injection | **CRITICAL** | No public API. Either requires JNI into libwebrtc internals (fragile across updates) or a custom `AudioDeviceModule` that wraps the real ADM and mixes injected audio — complex, untested path. |
| iOS native audio injection | **HIGH** | `LKExternalAudioProcessingDelegate` provides capture post-process hook, but only gets mic audio. A second track needs a custom `RTCAudioDeviceModule` or a second peer connection. |
| Audio decoding (file → PCM) | **MEDIUM** | expo-av handles this well, but adds ~2MB to APK. Need to verify format support (MP3, WAV, OGG). |
| Thread safety / timing | **MEDIUM** | 10ms audio frames at 48kHz = 480 samples per callback. PCM buffer must be lock-free or carefully synchronized between JS thread and audio thread. |
| Integration with existing room | **LOW** | `room.localParticipant.publishTrack()` already works. Just needs a track to publish. |
| UI development | **LOW** | Standard React Native. Bottom sheet + grid of buttons. |

---

## 6. Q5: What Could NOT Be Determined

1. **Whether `libwebrtc` on Android exposes any internal method to push samples into `AudioSource`**: The bundled `.aar` is precompiled. The public API surface (`org.webrtc.AudioSource`) has no `pushSamples()` or equivalent. Internal C++ methods (`webrtc::AudioSourceInterface::AddSink`, etc.) may exist but are not accessible without JNI hacks.

2. **Whether iOS `RTCAudioDeviceModule` can be subclassed for a virtual second input**: The bundled `WebRTC.framework` headers were not inspected at the C++ level. The Obj-C/Swift surface (`RTCAudioDeviceModule`) is abstraction-heavy and may or may not support custom implementations.

3. **The exact PCM format expected by the WebRTC audio pipeline**: Presumably 16-bit signed PCM, mono, at the sample rate configured by `AudioType` (likely 48kHz). Needs verification with a working native test.

4. **Whether `getDisplayMedia()` on Android/iOS RN could be abused to create a fake audio track**: ScreenShare audio is not supported in the current implementation (video-only screen capture). Even if it were, it would require actual system-level screen capture UI.

5. **The exact WebRTC revision / branch used in the prebuilt AAR**: This affects which internal APIs are available. The AAR is opaque.

6. **Whether a custom `PeerConnectionFactory` with a custom `AudioDeviceModule` can inject audio without breaking the existing mic path**: The `WebRTCModuleOptions` allows ADM injection, but it replaces the entire ADM. A wrapper ADM that delegates mic to the real ADM and injects soundboard audio is theoretically possible but untested.

---

## 7. Recommendation

**Feasibility**: Theoretically achievable but requires significant native work on both platforms. No pure-JS solution exists.

**Estimated effort**: 3–5 weeks for a single experienced mobile engineer (Android + iOS native, not just RN JS).

**Alternatives to consider before committing to native modules**:

1. **Server-side publish bot** (explicitly rejected by the stakeholder — listed for completeness only).
2. **Replace mic track during sound playback** — on Android, use `AudioProcessorInterface.capturePostProcessor` to overwrite mic PCM with soundboard audio during playback. Simpler (no second track, no peer connection changes) but means the user's voice is cut off while a sound plays. On iOS, use `LKExternalAudioProcessingDelegate` similarly. **This is the lowest-risk native approach** but does not achieve full parity (web allows simultaneous mic + soundboard).
3. **Investigate newer `@livekit/react-native` versions** — versions > 2.12.0 may have added custom audio source APIs. This SPIKE is pinned to 2.12.0 as installed.

---

## Appendix A: Installed Package Versions

| Package | Version |
|---------|---------|
| `@livekit/react-native` | 2.12.0 |
| `@livekit/react-native-webrtc` | 144.1.2 |
| `livekit-client` (hoisted) | 2.21.0 |
| `react-native` | (from apps/mobile) |
| `expo-av` | **NOT INSTALLED** |
| `expo-audio` | **NOT INSTALLED** |
| `react-native-sound` | **NOT INSTALLED** |

## Appendix B: Key Source References (All Verified from Installed Packages)

| Reference | Path |
|-----------|------|
| RN package index (all exports) | `apps/mobile/node_modules/@livekit/react-native/src/index.tsx` |
| RN-webrtc index (all exports) | `apps/mobile/node_modules/@livekit/react-native-webrtc/src/index.ts` |
| RN-webrtc MediaStreamTrack | `apps/mobile/node_modules/@livekit/react-native-webrtc/src/MediaStreamTrack.ts` |
| RN-webrtc MediaStream | `apps/mobile/node_modules/@livekit/react-native-webrtc/src/MediaStream.ts` |
| RN-webrtc AudioDeviceModule | `apps/mobile/node_modules/@livekit/react-native-webrtc/src/AudioDeviceModule.ts` |
| livekit-client createLocalAudioTrack | `apps/mobile/node_modules/livekit-client/src/room/track/create.ts` (line 178) |
| livekit-client LocalAudioTrack | `apps/mobile/node_modules/livekit-client/src/room/track/LocalAudioTrack.ts` |
| livekit-client AudioCaptureOptions | `apps/mobile/node_modules/livekit-client/src/room/track/options.ts` (line 270) |
| Android WebRTCModule | `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java` |
| Android GetUserMediaImpl | `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/GetUserMediaImpl.java` |
| Android WebRTCModuleOptions | `apps/mobile/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/WebRTCModuleOptions.java` |
| Android LiveKitReactNative setup | `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/LiveKitReactNative.kt` |
| Android AudioRecordSamplesDispatcher | `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/AudioRecordSamplesDispatcher.kt` |
| Android AudioProcessorInterface | `apps/mobile/node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/processing/AudioProcessorInterface.kt` |
| iOS LKAudioProcessingAdapter | `apps/mobile/node_modules/@livekit/react-native/ios/LKAudioProcessingAdapter.m` |
| iOS LKExternalAudioProcessingDelegate | `apps/mobile/node_modules/@livekit/react-native/ios/Headers/LKAudioProcessingAdapter.h` |
| Web reference (soundboard) | `apps/web/src/lib/useVoice.ts` (lines 76–105) |
| Web Soundboard UI | `apps/web/src/components/Soundboard.tsx` |
| Mobile API schema (ServerSound) | `apps/mobile/src/api/schema.ts` (line 91) |
| Mobile voice connection | `apps/mobile/src/features/voice/useVoiceConnection.ts` |
| Mobile voice store | `apps/mobile/src/features/voice/VoiceStore.ts` |
