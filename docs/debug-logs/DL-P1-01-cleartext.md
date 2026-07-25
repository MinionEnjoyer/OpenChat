# DL-P1-01 — dev-login silently fails on device (release build)

**Symptom:** `p1-01-devlogin-shell.yaml` fails at `shell-screen visible`; the
app stays on the login screen. Unit tests and host-side curl of the same
endpoint pass.

**Hypothesis:** Android release builds block cleartext HTTP by default; the app
calls `http://10.0.2.2:3001`, so `fetch` rejects before any request leaves the
device. (The failed-mutation toast fired and auto-hid before the next assert —
FR-APP-006 worked as designed but masked the cause from the flow.)

**Prediction:** Expo's generated *debug* manifest sets
`android:usesCleartextTraffic="true"`; the release manifest does not.

**Experiment (one variable):** inspect the manifests — no code changes.

**Result:** confirmed. `android/app/src/debug/AndroidManifest.xml` carries the
attribute with `tools:replace`; main/release has nothing.

**Fix:** `expo.android.usesCleartextTraffic: true` in `app.json` (prebuild
writes it into the main manifest). Dev-stack-only posture; Phase 8 release
hardening must remove or scope it (BACKLOG entry added).

**Follow-up captured:** transient mutation failures that self-dismiss are
invisible to E2E after the fact; connection-level failures surface persistently
via the FR-APP-003 banner once the gateway is in play, which is the durable
signal flows should assert on.
