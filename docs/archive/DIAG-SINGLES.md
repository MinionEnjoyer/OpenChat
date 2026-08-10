# E2E Diagnosis — Five Remaining Failures

Date: 2026-07-26
Source analysis only; no devices used.

---

## 1. p0-17-hello — `hello-screen is visible → false`

**Verdict:** PRODUCT BUG

**Mechanism:**
- `HelloScreen` is defined at `apps/mobile/src/features/hello/screens/HelloScreen.tsx:15` with `testID="hello-screen"` (line 17).
- It is exported from `apps/mobile/src/features/hello/index.ts:3`.
- **Zero files in `apps/mobile/src` import it.** No navigator, no App entry point, no conditional render references `HelloScreen` or `features/hello`.
- The component exists but is unreachable dead code. It was the Phase 0 scaffold screen, superseded by `ShellScreen` when the real app shell was built. The import was removed; the file was not.

**Recommendation:** Delete the flow (`p0-17-hello.yaml`), the component (`HelloScreen.tsx`), and the barrel export (`features/hello/index.ts`). The flow's original purpose — proving the build/install/launch chain — is now covered by every other flow that reaches the shell. There is no value in making HelloScreen reachable again; it was scaffolding, not a feature.

---

## 2. p1-01-devlogin-shell — `Element not found: Id matching regex: channel-#general`

**Verdict:** UNDETERMINED (likely platform encoding or naming collision)

**Mechanism:**
- `ChannelList.tsx:192` generates testIDs: `testID={`channel-${channel.name}`}`.
- The seed creates a channel literally named `#general` at `tools/seed/seed.mjs:241`.
- `fixture-ids.json` shows TWO entries: `"general"` (UUID `3f067e20…`) and `"#general"` (UUID `fdf0a948…`). These are different channels. The seed only creates `#general`, so the `general` entry is a stale artifact from a prior seed run or manual creation.
- The flow taps `channel-#general` (line 30 of `p1-01-devlogin-shell.yaml`).
- The `#` character is not valid in Android resource IDs. React Native on Android sets `testID` as the `resource-id` in the accessibility tree, which follows the format `package:id/name`. Maestro's `id:` matcher uses uiautomator's `resource-id` attribute. Whether `#` survives the Android/RN/Reanimated accessibility bridge is platform-dependent and cannot be determined from source alone.

**Recommendation:** Rename the seeded channel from `#general` to `general` in both the seed script and `fixture-ids.json`, and update the flow's testID to `channel-general`. This avoids the ambiguity entirely. The `#` prefix is a display convention, not a data requirement — the channel list already renders a `#` prefix separately (`strings.shell.channelHash`, line 179).

---

## 3. p1-02-session-restore — `shell-screen is visible → false`

**Verdict:** STRUCTURALLY IMPOSSIBLE under current runner isolation model

**Mechanism:**
- `tools/e2e-run-only.sh:36` and `tools/e2e-shard.sh:37` both execute `adb shell pm clear com.openchat.mobile` **before every flow**.
- `pm clear` wipes all app data including `expo-secure-store`, which holds the OIDC session tokens.
- `p1-02-session-restore.yaml` explicitly depends on tokens left by `p1-01` (line 4–5: "Order matters: runs after p1-01 … left alice's tokens in the vault. NO clearState — that is the point").
- The alphabetical ordering guarantee (`p1-02` runs after `p1-01`) is irrelevant because `pm clear` nukes the vault between them.
- Even if the flows were sequenced without `pm clear`, the runner's design goal of per-flow isolation requires it. Restoring session state across flows is antithetical to the isolation model.

**Recommendation:** Either:
- **(A) Remove the flow.** The session-restore behaviour is implicitly verified by every other flow that uses `_login.yaml` (which asserts `login-screen` is visible on launch and dev-login succeeds). The absence of a broken session-restore path is tested operationally.
- **(B) Opt p1-02 out of `pm clear`** by adding a flow-level annotation (e.g. `# @no-pm-clear`) and modifying the runner to skip `pm clear` for annotated flows. This preserves the flow but requires runner changes. Flows that depend on prior state are fragile; option A is cleaner.

---

## 4. p3-05-members-kick-leave — `right-drawer is visible → false`

**Verdict:** UNDETERMINED without device (testID exists, rendering is conditional on state)

**Mechanism:**
- `right-drawer` is rendered at `ShellScreen.tsx:724–731` with `testID="right-drawer"` (line 727).
- The view is always in the component tree but has `accessibilityElementsHidden={!rightOpenJS}` (line 729). When closed, Maestro's uiautomator cannot see it.
- The flow taps `members-toggle` (line 37), which is rendered unconditionally at `ShellScreen.tsx:549–555`. Tapping it calls `toggleMembers` → `openRight` → sets `rightOpenJS = true` → `accessibilityElementsHidden={false}`.
- All prior assertions in the flow pass (`hamburger-button`, `left-drawer`, `rail-server-Fixture Guild`, `server-rail` — the left drawer and rail items are visible), so the login and left-drawer interaction are working.
- Possible failure modes: (a) `members-toggle` tap doesn't register (Maestro tap lands on a different element), (b) the state update doesn't propagate before `assertVisible` times out, (c) the drawer renders offscreen or behind another element.

**Recommendation:** Run on a device and capture the uiautomator hierarchy at the point of failure (the runner already does this — check `/tmp/e2e-p3-05-members-kick-leave-*-ids.txt`). Compare against the asserted testIDs. If `members-toggle` is in the hierarchy but `right-drawer` is absent after tap, the tap is not triggering `toggleMembers`. If neither is present, the flow didn't reach the shell.

---

## 5. p4-05-block-collapse — `blocked-msg-5719da3f-0672-4c00-8fa7-4691726e8585 is visible → false`

**Verdict:** STALE FIXTURE

**Mechanism:**
- `p4-05-block-collapse.yaml:44` asserts `blocked-msg-5719da3f-0672-4c00-8fa7-4691726e8585`.
- The testID pattern is at `ChatPane.tsx:546`: `testID={`blocked-msg-${msg.id}`}`.
- **The UUID `5719da3f-0672-4c00-8fa7-4691726e8585` does not appear anywhere in the seed script (`tools/seed/seed.mjs`), `fixture-ids.json`, or any other file in the repository except the flow YAML.**
- The seed script creates alice↔bob as friends and creates a DM channel between them (lines 337–361), but it **never blocks bob** and **never sends any message in the DM**. The flow's precondition ("alice has bob blocked, bob has a message in the DM") is not met by the seed.
- The UUID was hardcoded from a development database where bob was blocked and had sent a message. After a fresh seed, that message doesn't exist.

**Recommendation:** The seed script must set up the block relationship and send a message from bob. The flow should then reference the message by its seed-known testID key rather than a hardcoded UUID. Specifically:
- Extend `seed.mjs` to call `POST /friends/:id/block` (or equivalent) to block bob, then `POST /dms/:dmId/messages` as bob to send "Hi alice, this is bob".
- Store the created message ID in `fixture-ids.json` under a key like `blockedMessageId`.
- Update the flow to reference that key (Maestro flows can read from fixture JSON via the runner's pre-processing, or use a generated YAML).

---

## Summary

| Flow | Verdict | Actionable from source? |
|---|---|---|
| p0-17-hello | PRODUCT BUG | Yes — delete dead code |
| p1-01-devlogin-shell | UNDETERMINED | No — needs device to confirm `#` encoding |
| p1-02-session-restore | STRUCTURALLY IMPOSSIBLE | Yes — remove flow or opt out of pm clear |
| p3-05-members-kick-leave | UNDETERMINED | No — needs device hierarchy dump |
| p4-05-block-collapse | STALE FIXTURE | Yes — seed missing block+message setup |
