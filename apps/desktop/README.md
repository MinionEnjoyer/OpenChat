# OpenChat Desktop (Tauri)

A thin Tauri shell around the OpenChat web app (`apps/web`). Frameless window with a
custom title bar, system tray + close-to-tray, and (planned) native notifications and
global hotkeys. Authenticates with a bearer **app token** (Settings → 🔑 Tokens on the
web app) against a configurable server URL — no browser cookie needed.

## How it fits together
- The frontend is the built web app (`apps/web/dist`), loaded locally by Tauri.
- The web app reads its server origin + token from `lib/serverConfig` (first-run setup
  screen, or a build-time `VITE_SERVER_URL`), so the bundled app talks to a remote API.
- `withGlobalTauri` exposes `window.__TAURI__`, which the title bar uses for window
  controls (no Tauri dependency in the web bundle).

## Build & release (Windows)
Cross-building Windows from macOS/Linux isn't supported — builds run on a Windows CI
runner. The workflow signs the build and publishes a GitHub Release with the installer
and the updater manifest.

### One-time setup (signing keys — required)
An updater signing keypair already exists locally at `~/.tauri/openchat-updater.key`
(private) and `.pub` (public, committed in `tauri.conf.json`). Add the **private** key
as a repo secret so CI can sign:

1. Copy the private key: `cat ~/.tauri/openchat-updater.key` (keep it secret).
2. GitHub → repo **Settings → Secrets and variables → Actions**:
   - Secret `TAURI_SIGNING_PRIVATE_KEY` = the contents from step 1.
   - Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = empty (the key has no password).
   - (Optional) Variable `SERVER_URL` = your server origin, to skip the first-run URL field.

> Keep `~/.tauri/openchat-updater.key` safe — losing it means installed clients can no
> longer receive signed updates.

### Cut a release (installer + auto-update)
1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Tag and push: `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`.
3. CI builds, signs, and publishes a GitHub Release. Download the `.exe` from the release
   and install. Installed clients auto-check that release's `latest.json` on launch and
   update themselves when a newer version is published.

- **Just an installer, no release:** Actions → **desktop-windows** → Run workflow →
  download the `openchat-windows-installer` artifact.
- **Local dev** (needs Rust + Tauri prereqs): `cd apps/desktop && npm install && npm run dev`.

## Status
Phase 1 MVP: shell + custom title bar + tray + close-to-tray + first-run setup.
Planned: native notifications, dock/taskbar badge, global mute hotkey, deep links,
auto-update, OIDC-in-browser login (see the local desktop plan).
