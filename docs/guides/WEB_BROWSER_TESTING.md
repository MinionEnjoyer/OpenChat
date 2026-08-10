# Web browser testing

OpenChat uses Playwright to run the production React web entry point in Chromium. The suite is a
blocking CI check and complements the faster Vitest component suite and the Compose-backed API and
OpenShare contracts.

## Run locally

From `apps/web`:

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

Playwright starts the Vite server on `127.0.0.1:4174`. Failure traces and screenshots are written
under `apps/web/test-results/`; the HTML report is written under `apps/web/playwright-report/`.
Both directories are ignored by Git.

## Covered behavior

The app-flow suite loads the real `App` component and replaces only its HTTP and WebSocket boundary
with deterministic fixtures. Desktop Chromium covers authenticated startup, server switching,
selected-server state, channel message loading, exact message-and-pixel scroll restoration,
centered search and notification dialogs, username search, notification badge layering and action
requests, attachment staging, sticker selection and outgoing payloads, and YouTube iframe creation.
The mobile project verifies the navigation drawer, centered dialog geometry, horizontal containment,
and the responsive showcase layout.

The showcase suite renders the real call surface for a private call, synchronized watch party,
multi-window screen sharing, and a deterministic realtime public-server update. This catches browser
rendering and responsive regressions without requiring external media or voice services.

## Evidence boundary

These tests prove browser interaction with the production React components; they do not claim that
OIDC, LiveKit, OpenShare, YouTube, Giphy, or a public reverse proxy is available. Those boundaries
remain covered by API/unit contracts, the Compose inter-app suite, the LiveKit probes, or deployment
acceptance tests as appropriate. A future live-browser suite should use disposable accounts and
ephemeral services rather than weakening the deterministic suite.
