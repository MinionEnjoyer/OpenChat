# Contracts Changelog

## 2026-07-21 — P0-10 shape corrections (three routes)

- **[CHANGE] `GET /config` — removed `security: []`.** Server response is 401 without session cookie (`@UseGuards(SessionGuard)` in `config.controller.ts:6`). Contract now matches observed behavior. Evidence: `provider.spec.ts:433` "GET /config → 200 (requires auth — characterized)", live `curl` returning 401. Pre-auth public subset (`GET /config/public`) deferred to Phase 1 per DR-002.
- **[CHANGE] `GET /friends/requests` — response shape corrected from bare array to `{incoming, outgoing}`.** Server returns an object with two array fields, not a bare array. Evidence: `provider.spec.ts:395-402` asserting `.toHaveProperty('incoming')` and `.toHaveProperty('outgoing')`, 36/36 contract suite passing with `additionalProperties:false`.
- **[CHANGE] `GET /notifications` — response shape corrected from bare array to `{friendRequests, serverInvites, count}`.** Server returns an object with `friendRequests` array, `serverInvites` array, and `count` integer. Evidence: `provider.spec.ts:406-413` asserting all three fields, 36/36 contract suite passing with `additionalProperties:false`.

All three corrections are server-observed; server behavior beats aspirational contract. The ajv suite (36/36 with `additionalProperties:false`) confirms the corrected shapes are exact.

## 2026-07-21 — P0-06 confirmations (pre-P0-07)
- [CHANGE] `POST server-invitations/:id/accept` — corrected from `/notifications/server-invitations/:id/accept` in 03-CONTRACTS.md §2. The NotificationsController uses `@Controller()` with no prefix, so the route is `/api/server-invitations/:id/accept`, not under `/notifications/`. Evidence: `apps/api/src/notifications/notifications.controller.ts:21`, capability `invites.spec.ts#notif-accept`.
- [CHANGE] `POST server-invitations/:id/decline` — same correction. Evidence: `apps/api/src/notifications/notifications.controller.ts:26`, capability `invites.spec.ts#notif-decline`.