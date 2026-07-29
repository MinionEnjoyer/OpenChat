# E2E Flow State Audit — 2026-07-27

## Root cause of the p3-06-invite-accept failure

p3-06-invite-accept.yaml **declares** `launchApp: clearState: true` in Phase 1
and that should have worked.  The fact that it did not on the probed device
points to a Maestro/Android-specific `clearState` deficiency on that emulator:
Expo's secure-store (KeyStore-backed) survived `pm clear` and the previous user's
session was auto-restored.  The `_login.yaml` comment already warned about this
("clearState ever leaves stale tokens (expo-secure-store)"), but the guard was
never implemented.  That hardening belongs in `_login.yaml` as a follow-up, not
in this audit.

However, the **systemic failure** is different: 46 of 49 runnable flows used
`_login.yaml` or `_login_friend.yaml`, both of which declared `clearState: false`.
These flows inherited whatever app state the previous flow left — every time,
on every device, regardless of whether `clearState: true` happened to work on a
particular emulator.  This is the bug that caused msg-005-reply to land on
"No text channels here yet" — a prior flow had selected a server with no text
channels, and `_login.yaml`'s `clearState: false` preserved that UI state.

## What changed

Three files, one fix:

| File | Change |
|---|---|
| `apps/mobile/e2e/flows/_login.yaml` | `clearState: false` → `clearState: true`; comment updated |
| `apps/mobile/e2e/flows/_login_friend.yaml` | `clearState: false` → `clearState: true` |
| `apps/mobile/e2e/flows/p1-auth-006b-profile-verify.yaml` | `clearState: false` → `clearState: true` (inline login, not via subflow) |

**Why fix the two subflows instead of 46 individual flows:** `_login.yaml` and
`_login_friend.yaml` are the single login entry points.  Every flow that logs in
should start from a guaranteed-clean app state.  Centralising the reset in the
subflows fixes all dependent flows at once and gives a single place to harden
against expo-secure-store token leakage if `clearState` alone is insufficient.

## Per-flow audit (49 runnable flows)

"Clean before" = the flow declared its own `clearState: true` on first `launchApp`
before this change.  "Clean after" = the flow opens from a guaranteed-clean app
state after this change.

| Flow | Before | After | Login via | Notes |
|---|---|---|---|---|
| app-error-toast | dirty | **clean** | `_login` | |
| msg-001-list-load | dirty | **clean** | `_login` | |
| msg-002-send | dirty | **clean** | `_login` | |
| msg-003-edit | dirty | **clean** | `_login` | |
| msg-004-delete | dirty | **clean** | `_login` | |
| msg-005-reply | dirty | **clean** | `_login` | Reported failure: landed on "No text channels" |
| msg-copy-text | dirty | **clean** | `_login` | |
| msg-pins-cross-device-A | dirty | **clean** | `_login` | Cross-device, Device A |
| msg-pins-cross-device-B | dirty | **clean** | `_login_friend` | Cross-device, Device B |
| msg-polls-cross-device-A | dirty | **clean** | `_login` | Cross-device, Device A |
| msg-polls-cross-device-B | dirty | **clean** | `_login_friend` | Cross-device, Device B |
| msg-rich-markdown-mentions | dirty | **clean** | `_login` | |
| msg-rich-pins-polls | dirty | **clean** | `_login` | |
| msg-rich-reactions | dirty | **clean** | `_login` | |
| msg-typing-A | dirty | **clean** | `_login_friend` | Cross-device, Device A (friend) |
| msg-typing-B | dirty | **clean** | `_login` | Cross-device, Device B (test user) |
| msg-unread | dirty | **clean** | `_login` | |
| p1-01-devlogin-shell | dirty | **clean** | `_login` | |
| p1-02-session-restore | **clean** | **clean** | inline | Owns its clearState/relaunch cycle |
| p1-auth-006a-profile-edit | dirty | **clean** | `_login` | Device A of paired flow |
| p1-auth-006b-profile-verify | dirty | **clean** | inline → _fixed_ | Device B; was `clearState: false` |
| p1-auth-devlogin-bearer | dirty | **clean** | `_login` | |
| p2-02-coldstart-channel | dirty | **clean** | `_login` | Phase 2 kills+relaunches WITHOUT clearState — still works because Phase 1 now clears only at start |
| p3-01-create-server | dirty | **clean** | `_login` | |
| p3-02-rename-server | dirty | **clean** | `_login` | Renames server then renames back; server-side mutation only |
| p3-03-channel-crud | dirty | **clean** | `_login` | |
| p3-04-reorder-channels | dirty | **clean** | `_login` | |
| p3-05-members-kick-leave | dirty | **clean** | `_login` | |
| p3-06-invite-accept | **clean** | **clean** | inline | Already had `clearState: true`; diagnosed failure is expo-secure-store leakage, not YAML |
| p3-06-role-assign-toggle | dirty | **clean** | `_login` | |
| p3-08-kick-lose-access | **partial** | **clean** | `_login` + inline | Phase 1 (Alice) was dirty; Phase 5 (Bob) already had `clearState: true`. Now both phases are clean. |
| p4-01-friends-list | dirty | **clean** | `_login` | |
| p4-02-add-friend | dirty | **clean** | `_login` | |
| p4-03-dm-message | dirty | **clean** | `_login` | |
| p4-04-presence-profile | dirty | **clean** | `_login` | |
| p4-05-block-collapse | dirty | **clean** | `_login` | |
| p5-01-avatar-upload | dirty | **clean** | `_login` | |
| p5-02-attach-picker | dirty | **clean** | `_login` | |
| p5-03-inline-gallery | dirty | **clean** | `_login` | |
| p6-01-voice-channel-join-tiles | dirty | **clean** | `_login` | |
| p6-01-voice-channel-join-leave | dirty | **clean** | `_login` | |
| p6-02-voice-camera-publish | dirty | **clean** | `_login` | |
| p6-02-voice-pill-controls | dirty | **clean** | `_login` | |
| p6-03-dm-call-outgoing | dirty | **clean** | `_login` | |
| p6-03-voice-screenshare-view | dirty | **clean** | `_login` | |
| p6-04-incoming-call-overlay | dirty | **clean** | `_login` | |
| p7-01-channel-create-appear | dirty | **clean** | `_login` | |
| p8-01-notif-per-channel-levels | dirty | **clean** | `_login` | |
| p8-02-notif-foreground-toast | dirty | **clean** | `_login` | |

**Totals:** 49 runnable flows.  Before: 1 fully clean (p1-02), 1 partially clean
(p3-08), 1 declared-clean-but-suspected-failing (p3-06), 46 dirty.  After: 49 clean.

## Flows deliberately left inheriting state

**None.**  No flow legitimately needs to inherit app state from a previous flow.
All cross-device paired flows (msg-typing A/B, msg-pins-cross-device A/B,
msg-polls-cross-device A/B, p1-auth-006a/b) are designed to run on separate
devices; when run sequentially on the same device, each must start from a clean
app state.  The state they share (server names, messages, display names) is
server-side and unaffected by `clearState`.

## Helper files also fixed (not runnable E2E, but use `_login`)

- `_p6-falsify.yaml` — was dirty, now clean via `_login`
- `_p6-02-falsify.yaml` — was dirty, now clean via `_login`

## Known residual risk

- **expo-secure-store leakage**: On some Android versions, `pm clear` does not
  wipe KeyStore-backed storage, so a previous user's session token could survive
  `clearState: true`.  The `_login.yaml` comment now explicitly calls out that
  this hardening belongs in `_login.yaml` (e.g. an explicit logout API call
  before `launchApp`).  This is a follow-up, not part of this change.

- **p2-02-coldstart-channel**: Phase 1 now clears state (fresh login), Phase 2
  does `killApp` + `launchApp` without clearState.  The session from Phase 1
  is in expo-secure-store and should be restored.  If the expo-secure-store
  leakage issue above is present, this flow may also be affected — but the
  fix is the same hardening in `_login.yaml`, not a per-flow workaround.

## UNVERIFIED

These changes are code-only.  No device was available.  All changes are
authored against the YAML structure and Maestro semantics; they have not been
run against a live emulator.
