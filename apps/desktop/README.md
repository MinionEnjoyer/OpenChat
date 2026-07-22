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

## Build
Cross-building a Windows binary from macOS/Linux isn't supported — build on the target
OS or via CI.

- **Windows installer (CI):** GitHub → Actions → **desktop-windows** → Run workflow.
  The `.exe` (NSIS) is uploaded as an artifact. Optionally set a repo variable
  `SERVER_URL` to bake in the default server origin.
- **Local dev** (needs Rust + Tauri prereqs): `cd apps/desktop && npm install && npm run dev`.
- **Local release build:** `npm run build` (produces installers for the host OS).

## Status
Phase 1 MVP: shell + custom title bar + tray + close-to-tray + first-run setup.
Planned: native notifications, dock/taskbar badge, global mute hotkey, deep links,
auto-update, OIDC-in-browser login (see the local desktop plan).
