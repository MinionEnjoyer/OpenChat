# 17 — PHASE 8: Push Notifications, Hardening & Release

Goal: the app notifies like Discord, meets every NFR budget, and ships as store-ready
Android + iOS builds. FRs: NOTIF-001..004, APP-004, all NFRs enforced, NFR-12 gate.

Out of scope: store listing copy/screenshots beyond harness output · phased-rollout
infrastructure · self-hosted push transport (UnifiedPush/ntfy = backlog Decision candidate;
v1 = FCM for both platforms, DR-required to change).

## Work items

**P8-01 [BE] Push subsystem (FR-NOTIF-001)** — Prisma `DeviceToken {userId, token, platform,
lastSeen}`; `POST/DELETE /api/devices`; `notifications/dispatch.worker.ts` subscribes the
existing Redis bus (`chat:events`) for MENTION / NOTIFY(dm-message subset — refine payload:
extend NOTIFY publisher to include `{kind, channelId, preview}` additively) / CALL_RING and
sends via FCM HTTP v1 (`FCM_SERVICE_ACCOUNT_JSON` env; absent ⇒ worker idles with a
structured warning — dev stacks keep working). Respects notification-settings table
(P8-03). Delivery contract: at-most-once per event per device, dedupe key = eventId.
Tests: integration against `fcm-emulator` mock container: event matrix → exact push set;
token pruning on FCM `UNREGISTERED`.

**P8-02 Client push (FR-NOTIF-002/004)** — `@react-native-firebase/messaging` + notifee;
token lifecycle (register on login, delete on logout); channels/categories (messages,
mentions, calls); deep-link tap-through (reuses APP-005 routes); CALL_RING push → full-screen
incoming call (notifee fullScreenIntent / iOS critical handling per platform rules);
foreground suppression → in-app toast. E2E on emulator with FCM test transport: mention on
web → notification on locked emulator → tap → correct channel.

**P8-03 [BE+APP] Notification preferences (FR-NOTIF-003)** — `NotificationSetting {userId,
scope server|channel, scopeId, level all|mentions|none, mutedUntil?}` + CRUD endpoints;
long-press mute menus (15m/1h/8h/24h/∞) on channels/servers; dispatch worker + in-app badge
honor it (muted still increments badge, no push — Discord semantics). Integration matrix:
(level × event kind) → push? badge?

**P8-04 Settings completion (FR-APP-004)** — appearance (theme live-switch), notification
prefs UI, account, about/licenses (`npx license-checker` generated screen). Maestro walk +
theme snapshot both modes.

**P8-05 NFR enforcement sweep** — arm every `devctl nfr` budget from `01 §4`; fix breaches
(each breach = its own DL + item `P8-05x`). Startup: hermes + inline-requires audit +
`reportFullyDrawn` correctness; NFR-03 via bundle analysis (`npx react-native-bundle-
visualizer` report committed); NFR-09 label lint + 1.3× font pass; NFR-05/06 airplane flows
finalized. Gate: `devctl nfr` all-pass ×3 consecutive nightly runs.

**P8-06 Reliability census (NFR-12)** — full E2E suite ×3 consecutive; every flake → DL →
fix or quarantine-with-escalation (quarantine list must be empty for signoff); crash
tripwire: any native crash in harness fails the run (`adb logcat` FATAL scanner in devctl).

**P8-07 Release engineering** — Android: signed AAB (upload key from human), versionCode
automation, proguard/R8 with keep-rules tested by release-build E2E lane (release-build
Maestro subset — 10 core flows). iOS: `expo prebuild -p ios`, Fastlane lane checked in;
build + core-flow validation executed on the human-provided macOS runner (M8 milestone,
§6); push entitlements, background modes (audio/voip), privacy manifest + App Store privacy
answers generated into `docs/release/`. Store metadata stubs. Deliverable:
`docs/release/RUNBOOK.md` — exact commands from clean checkout to signed artifacts.

**P8-08 Final validation & signoff** — outer-loop Deploy→Validate at full depth: product-
owner acceptance script = one hour of scripted real usage across phone+web
(`docs/release/ACCEPTANCE.md`, written by this item, covering every P0/P1 FR area);
`devctl trace check --phase all` = 100% P0+P1; DRIFT-LOG fully retired; BACKLOG groomed
with priorities for v1.1. T4 signoff = ship.

## §6 Human-in-the-loop milestones (the only scheduled human dependencies)
M1 (after Phase 1): Authentik prod-realm redirect registration + OIDC login sanity on a
physical phone. M5 (after Phase 5): media sanity on physical devices (camera/gallery/save).
M8 (this phase): macOS runner access, signing assets, store accounts, 1-hour acceptance run.
Each milestone's checklist lives in `docs/release/HITL-<n>.md`; agent prepares everything
(builds, QR install links, scripts) so human time is consumption, not setup.
