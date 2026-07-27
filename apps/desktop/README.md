# OpenChat Desktop (Tauri v2)

A native desktop client for **Windows, macOS, and Linux** that bundles the OpenChat web app
(`apps/web`) in a Tauri v2 shell — the same UI as the web app, plus native niceties: system
tray, OS notifications, global push-to-talk, drag-and-drop uploads, and signed auto-updates.

## How it fits together
- The frontend is the built web app (`apps/web/dist`), loaded locally by Tauri (`frontendDist`),
  built fresh in `beforeBuildCommand`.
- On first launch a setup screen collects the **server URL** and signs you in — one-click
  **browser SSO** with an `openchat://` deep-link token handoff, or a manual **app token**
  (web app → Settings → 🔑 Tokens). The app authenticates with a bearer token against the
  configured server, so no browser cookie is needed.
- `withGlobalTauri` exposes `window.__TAURI__`; the web layer calls a few custom Rust commands
  through it (`open_external`, `notify`, `run_update`, `register_ptt`/`unregister_ptt`) — there
  is no Tauri dependency in the web bundle.

## Native features
- **Custom title bar** on Windows/Linux (frameless); macOS keeps native window chrome.
- **System tray** + close-to-tray (notifications keep flowing when the window is closed).
- **Native notifications** for DMs, mentions, and incoming calls when unfocused.
- **Global push-to-talk** — a system-wide hotkey that works even when the app is unfocused
  (global-shortcut plugin); pick it in Settings → 🎙 Voice.
- **Drag-and-drop** file uploads onto the window (Tauri's own drop capture is disabled via
  `dragDropEnabled: false` so the webview's HTML5 handler runs).
- **Auto-update** — checks the release's `latest.json` on launch and updates in place behind a
  progress splash; signed with the updater key.

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
1. Bump `version` in **all three**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. Tag + push, e.g. `git tag desktop-v0.8.2 && git push origin desktop-v0.8.2`.
3. CI builds all three platforms, signs, and publishes a GitHub Release with the installers +
   `latest.json`. Installed clients auto-update on next launch.

## Local dev
Needs the Rust toolchain + your OS's Tauri prerequisites. On Linux, install the WebKitGTK/GTK/xdo
deps (see the *Install Linux build dependencies* step in the release workflow).

```bash
cd apps/desktop && npm install && npm run dev
```
