# Contracts Changelog

## 2026-07-21 — P0-06 confirmations (pre-P0-07)
- [CHANGE] `POST server-invitations/:id/accept` — corrected from `/notifications/server-invitations/:id/accept` in 03-CONTRACTS.md §2. The NotificationsController uses `@Controller()` with no prefix, so the route is `/api/server-invitations/:id/accept`, not under `/notifications/`. Evidence: `apps/api/src/notifications/notifications.controller.ts:21`, capability `invites.spec.ts#notif-accept`.
- [CHANGE] `POST server-invitations/:id/decline` — same correction. Evidence: `apps/api/src/notifications/notifications.controller.ts:26`, capability `invites.spec.ts#notif-decline`.