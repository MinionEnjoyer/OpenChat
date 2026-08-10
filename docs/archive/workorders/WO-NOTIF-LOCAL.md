# WO-NOTIF-LOCAL — real notifications with no FCM, no Firebase, no Google

**Priority:** P0. This is a chat app; notifications are not optional.
**Scope:** `apps/mobile/src/features/notifications/` and its wiring. Client only.

## The problem, stated plainly

Push notifications have never worked on any device, ever. Verified on a physical
Pixel on 2026-07-27: messages sent to a locked device produced nothing on the
lock screen, while the same messages were readable server-side. Two independent
causes, both environmental:

- `apps/api/.env` has no `FCM_SERVICE_ACCOUNT`, so the API loads
  `NoopPushTransport`, which logs "push notifications are disabled" and sends
  nothing;
- there is no `apps/mobile/android/app/google-services.json`, so the client
  cannot obtain an FCM token even if the server could send.

FR-NOTIF-001..004 are marked complete. They cannot be: nothing behind them has
ever delivered a notification to a device.

## The insight this work order rests on

**FCM is only required for delivery when the app process is dead.** The app
already holds a WebSocket while it is running, and `expo-notifications` (already
a dependency, ~57.0.7) can raise a real system notification — lock screen
included — entirely locally, with no Google project.

So a large share of real-world notification value is reachable today:

| App state | Needs FCM? | Covered here |
|---|---|---|
| Foreground | no | yes — in-app banner |
| Backgrounded, process alive | **no** | **yes — real system notification** |
| Swiped away / killed / doze | yes | no — needs Firebase or a foreground service |

The middle row is the common case for an app someone is actively chatting in,
and it is currently blank.

## What exists already

- `src/features/notifications/foregroundHandler.ts` — tracks `AppState`,
  exposes `isForeground()` and `handleForegroundNotification()`, and defines
  `MentionPayload` / `CallRingPayload` / `NotifyPayload`.
- `src/features/notifications/push.ts` — remote registration only.
- `src/sync/queryClient.ts` — `applyEvent(frame)` receives every WS frame.
- `expo-notifications` — installed, but nothing calls
  `scheduleNotificationAsync` / `presentNotificationAsync` anywhere.

The wiring between "a message arrived over the socket" and "raise a
notification" is simply absent.

## Required change

Add a local-notification path driven by the WS event stream:

1. A module — suggest `src/features/notifications/localNotify.ts` — exposing
   something like `notifyIncoming(event)`, which:
   - when the app is **foregrounded**, routes to the existing
     `handleForegroundNotification` (in-app banner, no OS notification);
   - when **backgrounded**, calls `expo-notifications` to present a real system
     notification with the sender's display name as title and the message body
     as text, tapping through to the right channel or DM.
2. Call it from the message-arrival path fed by `applyEvent` in
   `src/sync/queryClient.ts`. Do not put presentation logic inside
   `applyEvent` itself — keep cache updates and notification separate.
3. Set a notification handler and request the Android 13+ `POST_NOTIFICATIONS`
   runtime permission at an appropriate moment (it is already granted on test
   devices, but real users need the prompt).
4. Respect existing per-channel notification levels. Do not notify for the
   user's own messages, or for channels muted by `p8-01-notif-per-channel-levels`.
5. Cover the three cases the owner cares about: **message in a shared channel**,
   **@mention in a shared channel**, and **DM**. A DM and a mention should
   notify even where a plain channel message might be suppressed by level.

## Acceptance criteria

- `Unit:` backgrounded + incoming DM → a local notification is presented, with
  title and body drawn from the event.
- `Unit:` foregrounded + incoming DM → NO system notification;
  `handleForegroundNotification` is called instead.
- `Unit:` a message authored by the current user never notifies, in either state.
- `Unit:` a muted channel does not notify on a plain message but still notifies
  on an @mention of the current user.
- `Unit:` @mention and DM both notify while backgrounded.

Mock `expo-notifications` via the existing `src/__mocks__/expo-notifications.ts`.

Do NOT write a Maestro flow for this. Notification delivery is not assertable by
testID — the owner verifies visually on hardware, which is exactly how the
absence was found.

## Explicitly out of scope

- Anything touching FCM, Firebase, or `google-services.json`.
- Killed-process delivery. That needs FCM or an Android foreground service and
  is a separate decision; say so in the commit rather than half-implementing it.
- Do not mark FR-NOTIF-001..004 satisfied. This work covers part of the
  notification story; the remote-push requirements remain unmet.

## Constraints

- Never run `npm ci` or `npm install`. `node_modules` is a shared symlink.
- Run the mobile unit suite AND `npx tsc --noEmit` before committing. A recent
  merge was green in jest while the typecheck was red.
