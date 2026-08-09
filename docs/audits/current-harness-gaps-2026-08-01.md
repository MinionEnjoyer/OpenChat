# OpenChat test-harness gap audit — 2026-08-01

## Scope and method

This audit compares the current OpenChat feature surface with automated tests, Maestro flows,
characterization coverage, CI configuration, and traceability receipts. It is a coverage audit,
not a claim that an untested feature is broken.

Commands used for the snapshot:

```sh
python3 tools/diff-routes.py
bash tools/check-unreachable.sh
bash tools/check-orphans.sh
bash tools/check-unbuilt.sh
bash tools/devctl trace check
rg --files apps bots .github | rg '(spec|test|maestro|workflow)'
```

The mobile reachability and orphan checks pass. Mobile also has many unit tests and Maestro
flows. The largest risks are therefore missing web/desktop coverage, disabled cross-service
coverage, and existing scenarios that do not have a current passing receipt.

## Coverage wave 1 status

- The API's 16 source unit suites (98 tests at the time of this update) now run as a blocking CI
  step instead of existing only in the repository.
- The 26 API integration specs now execute against an explicitly seeded dev stack on every CI
  run. Their first runs are **probationary and non-blocking**, with machine-readable results kept
  as workflow artifacts until their baseline is known and the gate has earned promotion.
- The web client now has Vitest and React Testing Library in CI. Initial regression coverage
  checks the shared centered header panel, safe cross-domain server handoff, browser/native
  YouTube embed routing, and per-channel message-anchor/offset persistence.
- Playwright now runs the production React app in desktop and mobile Chromium with a deterministic
  API/WebSocket boundary. It covers server switching, exact channel anchor restoration, centered
  search/notification/sticker surfaces, username search, notification badge layering and actions,
  attachment upload staging, sticker sending, YouTube iframe generation, mobile containment, and
  the voice/watch-party/screen-share showcase. The exact-scroll browser regression also protects
  against native scroll anchoring, transient top-edge history loads, and late embed resizing.
- Coverage wave 2 adds the sticker wire format, literal-payload image rendering, picker
  selection and permission gating, upload success/rejection handling, plus API sticker
  membership, permission, capacity, cross-server deletion, and persistence boundaries.
- Coverage wave 3 adds context-sensitive chat option actions, Settings release-version identity,
  and desktop updater current/progress/stall behavior.
- The API harness now covers bot ownership, token rotation/redaction, publication, permission,
  idempotent server installation, and scoped removal. Deployment telemetry has unit, HTTP-contract,
  migration, exact-window, failure-recovery, and logger privacy coverage.
- Voice service coverage now exercises server/DM authorization, scoped token creation, DM ringing,
  leave notifications, LiveKit roster reconciliation, stale-session cleanup, and database fallback.
  Watch-party service coverage exercises start/state/stop authorization, YouTube and Jellyfin
  sources, ranged stream and poster proxies, synchronization publication, and failure handling.
  Direct-message service coverage now protects friendship gating, exact-recipient channel reuse,
  creation, DTO projection, and activity ordering.
- Social and push-preference service coverage now protects friend lookup/request/accept/decline,
  reverse-request auto-acceptance, removal, blocking, pending-list projection, notification
  aggregation/settings ownership, and device-token creation, transfer, listing, and deletion.
- Channel-overwrite coverage now protects membership and management authorization, server/channel
  scoping, role/member target validation, BigInt parsing and serialization, upsert defaults, and
  scoped deletion. Presence coverage protects status lifecycle, `@here` activity, invisibility,
  and connect-time snapshots.
- The API unit gate now enforces a 75% global line threshold. Server lifecycle coverage protects
  permissions, creation, channels, soundboard/stickers, roles, invitations, member management,
  timeouts, bans, leave/delete, and overwrite resolution. Auth coverage protects OIDC/native PKCE,
  profiles, desktop handoff, WebSocket tickets, personal tokens, refresh rotation/reuse, and both
  guards. Messaging coverage protects access, cursor/around pagination, creation/attachments,
  polls, edits/deletes, pins, reactions, reads, search, notifications, and federation publication.
  Controller contract tests cover authenticated identity and parameter mapping across the principal
  server, message, social, bot, notification, media, voice, watch-party, and test-world routes.
- A blocking Compose-backed inter-app suite now builds OpenChat and OpenShare together and covers
  service-key rejection/acceptance, multi-class uploads, byte-identical direct and proxied reads,
  ranges, thumbnails, missing-asset errors, sticker messages, and soundboard waveform/registration.
- The remaining items below are still open unless explicitly narrowed by this status section.

## Priority gaps

### P0 — cross-service and release safety

1. **OpenShare asset deletion is not integrated with OpenChat lifecycle cleanup.** The blocking
   inter-app gate now covers file, sticker, and soundboard creation, retrieval, authentication,
   registration removal, and useful upstream errors. OpenChat still removes sticker/sound records
   without deleting the underlying OpenShare asset because no scoped service deletion contract is
   implemented. Design that ownership-safe contract before adding destructive lifecycle tests.
2. **No deployment/update smoke test exists.** There is no automated check that a GitHub-passed
   revision can be installed on a clean host, migrate a preserved database, become healthy, and
   roll back. Add an ephemeral Compose deployment test plus a production runbook check that
   verifies the deployed commit and health endpoints.
3. **Desktop updater and native integration have no automated tests.** Auto-update download and
   install, loop prevention, deep-link authentication, tray behavior, autostart, and global
   push-to-talk shortcuts currently depend on manual testing. Add Tauri unit tests for native
   state/command logic and a packaged-client smoke test in the release workflow.

### P1 — high-value feature behavior

1. **The web browser harness does not yet exercise every management surface.** Deterministic
   Chromium coverage now protects the principal chat/navigation/upload/notification flows, while
   unit and component coverage protects additional seams. Settings, application-token management,
   bot management, server administration, GIF selection, polls, and failure-state accessibility
   still need browser-level workflows.
2. **Sticker coverage is split across deterministic browser and real service-boundary tests.** The
   browser suite proves tray selection, centered picker rendering, and the outgoing sticker wire
   payload. The blocking inter-app suite proves real OpenShare upload, server registration, message
   creation, listing, and registration removal. A single browser flow against the Compose-backed
   OpenChat/OpenShare boundary remains open.
3. **Watch-party multi-client realtime integration behavior remains open.** Unit coverage now
   protects start/state/stop authorization, host-only controls, synchronization publication,
   proxy byte ranges, missing posters, Jellyfin sources, and YouTube sources. Add a multi-client
   deterministic Chromium rendering covers the connected watch-party and viewer roster. Add a
   multi-client browser flow that proves WebSocket synchronization, host departure behavior, and
   playback against a real configured provider.
4. **Bots API browser and live HTTP coverage remains open.** Unit coverage now protects
   create/list/directory/update/reset-token and server add/remove authorization, ownership,
   token-redaction, rotation, role restrictions, idempotency, and scoped removal. Add a real HTTP
   lifecycle and browser-level management flow before promoting this surface to a release gate.
5. **Server member activity is only partially covered.** Unit tests validate message helpers,
   but no end-to-end or characterization test proves that accepting an invite and leaving a
   server create `MEMBER_JOINED`/`MEMBER_LEFT` server-owned messages in the default channel and
   publish the correct realtime event.
6. **External media provider behavior remains partially exercised.** Browser coverage now asserts
   the generated YouTube iframe URL and policy, while unit coverage protects browser/native shim
   selection. GIF provider search and real YouTube playback are still excluded from blocking
   provider-contract coverage; add controlled provider contracts and a deployment smoke check.

### P2 — evidence and maintenance quality

1. **Existing E2E flows lack current passing receipts.** `tools/devctl trace check` reports 33
   evidence-kind or receipt failures. Affected areas include application/server management,
   profile, uploads, message edit/delete/reply/reactions/pins, notifications, role mentions,
   friends/DMs, invite/kick/leave, and voice/video. Run the existing flows in CI on a supported
   emulator/device and publish receipts rather than treating flow-file presence as coverage.
2. **Unread, poll, and voice behavior have the wrong evidence level.** Traceability requires
   integration evidence for unread state, polls, voice participants, and screen sharing, but the
   current evidence is unit-only. Add boundary tests around persistence and realtime delivery.
3. **Capability/backlog metadata has drifted.** `check-unbuilt.sh` still reports open or gated
   requirements that overlap implemented server and role behavior. `diff-routes.py` also reports
   broad path-normalization disagreement between the API and capability specifications. Reconcile
   the maps before using either check as a release gate.
4. **The GitHub release bot has no tests.** Add fixture-driven tests for release filtering,
   deduplication, message formatting, and transient GitHub/OpenChat failures.

## Recommended implementation order

1. Add a real browser flow on top of the blocking OpenChat/OpenShare upload boundary.
2. Extend the Playwright app harness into settings, tokens, bots, server administration, GIFs,
   polls, and explicit failure-state accessibility.
3. Add member-activity and bots API integration suites, then a multi-client watch-party browser
   flow on top of the now-covered service boundary.
4. Make existing Maestro flows produce required traceability receipts in CI.
5. Add packaged desktop update smoke coverage and an ephemeral deployment/rollback test.

This order targets the failure classes already seen in production—cross-service 502s, literal
sticker payloads, blocked embeds, voice/connectivity drift, and stale deployments—before expanding
lower-risk unit coverage.
