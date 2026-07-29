# Apple Developer — exactly what you need to do

Everything here is console clicking that requires your Apple account. None of it
can be automated from this repo. Values pre-filled from the project so you can
copy rather than look things up.

| | |
|---|---|
| Bundle ID | `com.openchat.mobile` |
| App name | OpenChat |
| Firebase project | `openchat-app-f9272` (**must be this one** — same as Android) |
| Your Team ID | not yet known — see step 1 |

---

## 1. Team ID — 30 seconds

<https://developer.apple.com/account> → scroll to **Membership details**.

Copy the **Team ID** (10 characters, like `A1B2C3D4E5`). You need it in step 4.

---

## 2. Register the App ID — 2 minutes

<https://developer.apple.com/account/resources/identifiers/list>

**+** → **App IDs** → **App** → Continue.

- Description: `OpenChat`
- Bundle ID: **Explicit** → `com.openchat.mobile`
- Scroll the Capabilities list and tick **Push Notifications**

Register.

> If the identifier already exists, open it and confirm **Push Notifications** is
> ticked. That checkbox is the whole point of this step.

---

## 3. APNs Auth Key — 2 minutes, and the one step you can't redo

<https://developer.apple.com/account/resources/authkeys/list>

**+** → name it `OpenChat Push` → tick **Apple Push Notifications service (APNs)**
→ Continue → Register → **Download**.

You get `AuthKey_XXXXXXXXXX.p8`.

**Three things about this file:**

1. **It downloads exactly once.** Apple will not give it to you again. Put it
   somewhere durable before you close the tab.
2. **Note the Key ID** — the `XXXXXXXXXX` in the filename, also shown on screen.
3. **It is a private key.** It goes into the Firebase console and nowhere else.
   Not in this repo, not in a chat message, not in a screenshot. One APNs key
   can send to every app under your team, so treat it like a root credential.

A single key works for development and production, and for all your apps. You
only ever need one.

---

## 4. Add the iOS app to Firebase — 3 minutes

<https://console.firebase.google.com> → project **openchat-app-f9272**.

It must be this project. Push tokens are project-scoped: a token minted under one
Firebase project cannot be delivered to by another's credentials. Android already
uses this project, so iOS must too.

**⚙️ Project settings → General → Add app → iOS.**

- Apple bundle ID: `com.openchat.mobile`
- App nickname: `OpenChat iOS` (optional)
- App Store ID: leave blank

Download **`GoogleService-Info.plist`** when offered. Skip the remaining "add the
SDK" steps — the build handles that.

---

## 5. Upload the APNs key to Firebase — 1 minute

Same page: **Project settings → Cloud Messaging** → find the iOS app → **APNs
Authentication Key** → **Upload**.

- The `.p8` from step 3
- **Key ID** from step 3
- **Team ID** from step 1

This is the step that actually connects Firebase to Apple. Without it, tokens
register and nothing is ever delivered — the failure looks like a client bug and
is not one.

---

## 6. Hand me the plist

Drop `GoogleService-Info.plist` into:

```
apps/mobile/GoogleService-Info.plist
```

That's the only file I need from you. It's gitignored, same as the Android
`google-services.json` — not secret (it ships inside the app), but it identifies
your Firebase project and this repo goes upstream, so each deployer supplies
their own.

**Do not** put the `.p8` in the repo. I don't need it and shouldn't have it.

---

## 7. Your iPhone, for testing on hardware

Plug it in and trust this Mac. In Xcode → **Settings → Accounts**, sign in with
the same Apple ID, then let automatic signing register the device.

Push cannot be tested properly on the Simulator. `xcrun simctl push` fakes a
notification arriving, which exercises the app's *handling* of one — but not
APNs delivery, not token acquisition, not the server round trip. Same limit as
voice: the simulator can't produce the evidence the requirement asks for.

---

## Checklist

- [ ] Team ID copied
- [ ] App ID `com.openchat.mobile` registered with Push Notifications ticked
- [ ] APNs `.p8` downloaded and stored safely; Key ID noted
- [ ] iOS app added to Firebase project `openchat-app-f9272`
- [ ] `.p8` + Key ID + Team ID uploaded to Firebase Cloud Messaging
- [ ] `GoogleService-Info.plist` placed in `apps/mobile/`
- [ ] iPhone plugged in and trusted

Once steps 1–6 are done I can build, install, and drive the notification path.
Step 7 is only needed when we verify on hardware.

---

## What happens if a step is skipped

Each of these fails *silently* — registration succeeds, nothing arrives:

| Skipped | Symptom |
|---|---|
| Push capability on the App ID | Token acquisition fails or entitlement mismatch at install |
| APNs key not uploaded to Firebase | Token registers, FCM accepts the send, device gets nothing |
| Wrong Firebase project | Token registers against a project whose credentials can't reach it |
| Plist missing | Build has no Firebase config; no FCM token on iOS at all |

This is the same failure class that left Android push inert for the whole
project — a component that degrades quietly and reports success. Worth doing all
six steps in one sitting rather than three of them now.
