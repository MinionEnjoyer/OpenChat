# OpenChat Desktop (Tauri v2)

A native desktop client for **Windows, macOS, and Linux** that bundles the OpenChat web app
(`apps/web`) in a Tauri v2 shell — the same UI as the web app, plus native niceties: system
tray, OS notifications, global push-to-talk, drag-and-drop uploads, and signed auto-updates.

## How it fits together
- The frontend is the built web app (`apps/web/dist`), loaded locally by Tauri (`frontendDist`),
  built fresh in `beforeBuildCommand`.
- On first launch a setup screen collects the **server URL** and signs you in — one-click
  **browser SSO** with an `openchat://` deep-link token handoff, or a manual **app token**
  (web app → Settings → Tokens). The app authenticates with a bearer token against the
  configured server, so no browser cookie is needed.
- `withGlobalTauri` exposes `window.__TAURI__`; the web layer calls a few custom Rust commands
  through it (`open_external`, `notify`, `run_update`, `register_ptt`/`unregister_ptt`) — there
  is no Tauri dependency in the web bundle.

## Native features
- **Custom title bar** on Windows/Linux (frameless); macOS keeps native window chrome.
- **System tray** + close-to-tray (notifications keep flowing when the window is closed).
- **Native notifications** for DMs, mentions, and incoming calls when unfocused — see below.
- **Global push-to-talk** — a system-wide hotkey that works even when the app is unfocused
  (global-shortcut plugin); pick it in Settings → Voice.
- **Drag-and-drop** file uploads onto the window (Tauri's own drop capture is disabled via
  `dragDropEnabled: false` so the webview's HTML5 handler runs).
- **Auto-update** — checks the release's `latest.json` on launch and updates in place behind a
  progress splash; signed with the updater key.
- **Launch at login** (opt-in via Settings → Startup) — autostart plugin keeps the app in the
  tray across reboots so notifications keep arriving.

## Notifications

Desktop notifications are driven by the **live WebSocket connection** (like Discord/Slack
desktop), not an OS push service. The app requests OS notification permission on first launch
(`request_permission` in `setup`), then fires a native notification (`notify` command) for DMs,
mentions, and incoming calls whenever the window isn't focused.

- **Muting / levels / DND** are respected client-side (`apps/web/src/lib/notifyPrefs.ts`),
  mirroring the server's `push-dispatch.service.ts` gate: CHANNEL setting → SERVER setting →
  default ALL, honoring `mutedUntil` and level (`ALL`/`MENTIONS`/`NONE`). Notifications are also
  suppressed while the user's own status is `DND`.
- **Click-to-focus** — clicking a notification raises the window from the tray and jumps to the
  DM/channel. Implemented via the notification plugin's `onAction` event → `notify_activate`
  command (focuses the window, returns the stashed target). Note: delivery of a *body* click to
  `onAction` is platform-dependent across desktop DEs; if a platform doesn't deliver it, the
  notification still shows — it just won't auto-navigate.
- **Launch at login** (Settings → Theme → *Startup*) uses the autostart plugin to keep the app
  running in the tray after a reboot, so the live-notification path is always available.

**Delivery after a full quit** (true OS push to a *not-running* app) is intentionally **not**
implemented. It would require APNs (macOS) or WNS (Windows) transports plus paid Apple/Microsoft
developer accounts, code-signing/notarization, and a store/package identity we don't have. The
server push pipeline (`apps/api/src/push`) is transport-agnostic, so a desktop push transport
could be added later if those prerequisites are met; until then, **launch-at-login + close-to-tray
is the equivalent** (the app stays alive and keeps its socket, so notifications keep arriving).

## Platforms & bundles
| OS | Bundle | Auto-update |
|----|--------|-------------|
| Windows | NSIS `.exe` installer | ✅ |
| macOS | universal `.dmg` / `.app` (Intel + Apple Silicon) | ✅ |
| Linux | `.AppImage` + `.deb` | ✅ AppImage · `.deb` is a manual install |

Per-platform bundle targets live in `tauri.conf.json` (base / Windows NSIS),
`tauri.macos.conf.json`, and `tauri.linux.conf.json` — Tauri v2 auto-merges the file matching
the build OS. Builds are **not** OS-code-signed, so first launch shows a trust prompt
(Windows: *More info → Run anyway*; macOS: *right-click → Open*; Linux AppImage: `chmod +x` then run).

> On Linux the `openchat://` deep link (browser-SSO handoff) can be flaky depending on AppImage
> desktop integration — the manual **app token** entry on the setup screen is the fallback.

## Build & release
Each OS builds on its own CI runner (`.github/workflows/desktop-release.yml`: Windows + macOS +
Linux, `max-parallel: 1` so they don't race on `latest.json`). Pushing a `desktop-v*` tag creates
a draft release, builds + signs each platform into it, then publishes.

### One-time setup (signing keys — required)
The updater signing keypair lives locally at `~/.tauri/openchat-updater.key` (private) and `.pub`
(public, committed in `tauri.conf.json`). Add the **private** key as a repo secret so CI can sign:

1. `cat ~/.tauri/openchat-updater.key` (keep it secret).
2. GitHub → **Settings → Secrets and variables → Actions**:
   - Secret `TAURI_SIGNING_PRIVATE_KEY` = the contents from step 1.
   - Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = empty (the key has no password).
   - (Optional) Variable `SERVER_URL` = your server origin, to prefill the first-run URL field.

> Keep the private key safe — losing it means installed clients can no longer receive signed updates.

### Cut a release
1. Bump `version` in **all four**: `package.json`, `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, and `../web/package.json` (including its lockfile). The web version
   is shown in Settings for both browser and desktop builds.
2. Tag + push using the synchronized version, e.g.
   `git tag desktop-v0.8.49 && git push origin desktop-v0.8.49`.
3. CI builds all three platforms, signs, and publishes a GitHub Release with the installers +
   `latest.json`. Installed clients auto-update on next launch.

The current published production release is
[`desktop-v0.8.49`](https://github.com/MinionEnjoyer/OpenChat/releases/tag/desktop-v0.8.49).

## Local dev
Needs the Rust toolchain + your OS's Tauri prerequisites. On Linux, install the WebKitGTK/GTK/xdo
deps (see the *Install Linux build dependencies* step in the release workflow).

```bash
cd apps/desktop && npm install && npm run dev
```
