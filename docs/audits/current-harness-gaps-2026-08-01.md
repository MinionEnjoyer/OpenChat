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
- The remaining items below are still open unless explicitly narrowed by this status section.

## Priority gaps

### P0 — cross-service and release safety

1. **OpenChat-to-OpenShare uploads are skipped in CI.** The characterization job sets
   `CHAR_SKIP_OPENSHARE=1`, so a broken Share URL, credential, route, or response contract can
   pass CI. `apps/api/test/characterization/share.spec.ts` also describes an older architecture
   and needs to be brought in line with the current proxy flow. Add a Compose-backed contract
   suite for file, sticker, and soundboard upload, raw retrieval, deletion, authentication
   failures, and useful upstream error propagation.
2. **No deployment/update smoke test exists.** There is no automated check that a GitHub-passed
   revision can be installed on a clean host, migrate a preserved database, become healthy, and
   roll back. Add an ephemeral Compose deployment test plus a production runbook check that
   verifies the deployed commit and health endpoints.
3. **Desktop updater and native integration have no automated tests.** Auto-update download and
   install, loop prevention, deep-link authentication, tray behavior, autostart, and global
   push-to-talk shortcuts currently depend on manual testing. Add Tauri unit tests for native
   state/command logic and a packaged-client smoke test in the release workflow.

### P1 — high-value feature behavior

1. **The web client's behavioral coverage is still shallow.** The first Vitest/RTL seam tests
   now cover centered header panels, server-domain handoff, YouTube embed routing, and channel
   scroll storage. Critical surfaces such as
   `SettingsModal`, `ChatOptionsTray`, `StickerPicker`, `GifPicker`, `MessageEmbeds`,
   `UpdateGate`, `AppTokens`, `BotsManager`, and watch-party controls remain largely uncovered.
   Add sticker rendering/sending, option selection, updater state, and displayed-version tests
   next, followed by user-level browser flows.
2. **Sticker lifecycle lacks route and UI coverage.** `GET`, `POST`, and `DELETE`
   `/servers/:id/stickers` do not have lifecycle tests, and there is no automated assertion that
   `sticker::/api/media/.../raw` renders as a sticker instead of literal chat text. Add API
   authorization/lifecycle tests and web/mobile render-and-send scenarios.
3. **Watch-party behavior is effectively untested.** Current coverage only checks query-token
   extraction. Add tests for start/state/stop authorization, host changes, WebSocket
   synchronization, proxy byte ranges, expired media, Jellyfin sources, and YouTube sources.
4. **Bots API has no tests.** Create/list/directory/update/reset-token/delete and server
   add/remove operations need authorization, ownership, token-redaction, and rotation tests.
5. **Server member activity is only partially covered.** Unit tests validate message helpers,
   but no end-to-end or characterization test proves that accepting an invite and leaving a
   server create `MEMBER_JOINED`/`MEMBER_LEFT` server-owned messages in the default channel and
   publish the correct realtime event.
6. **External media regressions are not exercised.** GIF provider search is explicitly excluded
   from provider-contract coverage, and YouTube coverage stops at URL classification. Add mocked
   provider-contract tests and a browser-level assertion for the generated YouTube iframe/shim
   policy so a “content blocked” regression is caught.

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

1. Re-enable a real OpenShare service in characterization CI and cover the three upload paths.
2. Expand the new web Vitest/RTL foundation with sticker, settings-version, updater, and
   options-menu seam tests.
3. Add sticker lifecycle, member-activity, bots, and watch-party API integration suites.
4. Make existing Maestro flows produce required traceability receipts in CI.
5. Add packaged desktop update smoke coverage and an ephemeral deployment/rollback test.

This order targets the failure classes already seen in production—cross-service 502s, literal
sticker payloads, blocked embeds, voice/connectivity drift, and stale deployments—before expanding
lower-risk unit coverage.
