# TRACE-TRIAGE — 17 unannotated requirements

**Date:** 2026-07-26
**Gate:** `node tools/trace.mjs check` — RED, exit 1
**Author:** Codewhale (root)

## Summary

| Case | Count | IDs |
|------|-------|-----|
| A — Implemented, just unannotated | 0 | — |
| B — Implemented, no test | 1 | FR-MSG-014 |
| C — Not implemented (UNBUILT) | 4 | FR-APP-004, FR-APP-005, FR-SOC-003, FR-SOC-006 |
| D — Deferred by decision | 1 | FR-VOX-060 |
| E — NFR harness covers | 11 | NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-08, NFR-09, NFR-10, NFR-11, NFR-12 |
| **Total** | **17** | |

Zero case A — no requirement was genuinely proven but merely missing the
annotation. One misleading annotation was removed (FR-APP-005 on
parseInviteLink); one was narrowed (FR-SOC-006 removed from
p4-04-presence-profile.yaml). Both were claiming tests proved criteria they
did not — the same failure mode that hid FR-AUTH-001 (UNBUILT-001).

---

## Per-requirement triage

### FR-APP-004 — Settings screens (account, appearance, about, licenses)

- **Case:** C — NOT IMPLEMENTED
- **Acceptance criterion:** Maestro walk; theme change applies immediately
- **Current state:** Zero settings screens. `ui/tokens.ts` defines only a dark
  palette (comment: "light and system follow in FR-APP-004" — they don't). No
  `useColorScheme`, no `Appearance` API usage, no theme context, no theme toggle.
  No account screen (the profile form is inline in `ShellScreen.tsx:870-913`).
  No about/licenses screen. No E2E flow. Phase 8 spec P8-04 calls for this
  work — unstarted.
- **Action:** Filed as UNBUILT-002.

### FR-APP-005 — Deep links (invite, channels)

- **Case:** C — NOT IMPLEMENTED (half done)
- **Acceptance criterion:** E2E: `adb shell am start` with URI → correct screen
- **Current state:** `openchat://invite/<code>` works — parsing in
  `links.ts:40-69`, routing in `ShellScreen.tsx:126-145`, E2E test in
  `screen-readiness/invite-preview.yaml`. But `openchat://channels/<serverId>/<channelId>`
  is completely missing — no parser, no route handler, no navigation target.
  The `@satisfies FR-APP-005` on `links.ts:38` and `links.test.ts:31` was
  removed in this triage — `parseInviteLink` only proves the invite half.
- **Action:** Filed as UNBUILT-003. `@satisfies FR-APP-005` removed.

### FR-MSG-014 — GIF picker (Giphy search, hidden when no API key)

- **Case:** B — IMPLEMENTED, NO TEST
- **Acceptance criterion:** E2E behind config flag
- **Current state:** Full implementation. Mobile: `GifPicker.tsx` (229 lines)
  with search + grid, `gifFeature.ts` (Zustand store, probes backend to derive
  enabled flag), `ChatPane.tsx:803` conditionally renders GIF button only when
  `gifEnabled === true`. Backend: `GifsService.search()` returns 400 when
  `GIPHY_API_KEY` is absent. **The feature works correctly.** But no test proves
  the acceptance criterion — `gifPickerModalStructure.test.tsx` only validates
  Modal DOM nesting, not config-gating behavior. The backend test
  `provider.spec.ts:512` is a placeholder (`expect(true).toBe(true)`).
- **Action:** No annotation added. Needs an E2E or integration test that
  proves the button is hidden when the API key is absent.

### FR-SOC-003 — Group DMs (create, add/remove recipients, rename)

- **Case:** C — NOT IMPLEMENTED
- **Acceptance criterion:** E2E
- **Current state:** Prisma schema supports `GROUP_DM` channel type and
  `ChannelRecipient`, but no API endpoint exists for creating a group DM
  (2-10 recipients), adding/removing recipients, or renaming. `POST /dms`
  only opens 1:1 DMs. Mobile `useOpenDm()` only handles 1:1. No E2E flow.
  Phase 4 spec (P4-02) calls for this — unstarted.
- **Action:** Filed as UNBUILT-004.

### FR-SOC-006 — User profile sheet (avatar, mutual servers, actions)

- **Case:** C — NOT IMPLEMENTED
- **Acceptance criterion:** E2E
- **Current state:** `MemberProfileSheet.tsx` exists but is scoped to server
  members (FR-SRV-007), not a general user profile. It shows name + presence
  only — no avatar, no mutual servers, no DM/friend/block actions. Phase 4
  spec explicitly defers the full profile to P4-05 ("Profile sheet v2").
  The `@satisfies FR-SOC-006` on `p4-04-presence-profile.yaml:3` was removed
  in this triage — the E2E flow only proves the sheet opens and shows a name.
- **Action:** Filed as UNBUILT-005. `@satisfies FR-SOC-006` removed.

### FR-VOX-060 — Watch party (Jellyfin stream in voice channel)

- **Case:** D — DEFERRED BY DECISION
- **Acceptance criterion:** Manual-validation script only
- **Current state:** Backend code exists (`apps/api/src/watchparty/` — 3 files,
  300+ lines) as pre-merge scaffolding, registered in `app.module.ts`. Web
  client has full UI. Mobile has zero watch party UI (only a type definition).
  Zero tests. Owner's decision (`docs/PRIORITIES.md`, 2026-07-25): "do NOT
  implement before the upstream merge" — upstream has recent watch-party
  changes, and implementing here first would create divergence.
- **Action:** No change. Deferral is documented and correct. This FR should
  remain unannotated until after the upstream merge.

### NFR-01 — Cold start timing

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-01-cold-start.sh` — blocked at phase 1
  (no APK, no channel list). `ARM_AT_PHASE=1`. Will become overdue if
  `.phase` advances past 1 without implementation.
- **Trace gate:** Should exempt NFRs covered by `tools/nfr/nfr-runner.mjs`.
  The NFR harness is the dedicated verification mechanism for NFRs; adding
  `@satisfies` annotations in product code for infrastructure measurements
  would be misleading.

### NFR-02 — Message list scroll jank

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-02-jank-scroll.sh` — blocked at phase 2.
  `ARM_AT_PHASE=2`.

### NFR-03 — Release APK size

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-03-apk-size.sh` — baseline recorded (universal
  APK 67.1MB, est. per-ABI 26.9MB). `ARM_AT_PHASE=1`. Not gating yet because
  delivery artifact is undecided. Will flip overdue if phase advances without
  resolution.

### NFR-04 — Steady-state memory in voice call

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-04-memory-voice.sh` — blocked at phase 6.
  `ARM_AT_PHASE=6`. Voice not built yet.

### NFR-05 — Offline read

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-05-offline.sh` — blocked at phase 2.
  `ARM_AT_PHASE=2`.

### NFR-06 — Outbound queue ordering

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-06-outbox.sh` — blocked at phase 2.
  `ARM_AT_PHASE=2`.

### NFR-08 — Type safety (tsc --strict, no any)

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-08-types.sh` — **armed and passing** (api 0
  errors, mobile 0 errors, 0 explicit any). `ARM_AT_PHASE=1`. Real measurement
  running, gate passes.

### NFR-09 — Accessibility (labels, font scaling)

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-09-a11y.sh` — blocked at phase 2.
  `ARM_AT_PHASE=2`.

### NFR-10 — Backend backward compatibility

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-10-backcompat.sh` — blocked at phase 1.
  `ARM_AT_PHASE=1`. CI web-smoke job exists but has never executed.

### NFR-11 — i18n readiness (no literal JSX strings)

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-11-i18n.sh` — **armed and passing** (0 literal
  JSX strings via `react/jsx-no-literals`). `ARM_AT_PHASE=1`. Real measurement
  running, gate passes.

### NFR-12 — Crash-free harness sessions

- **Case:** E — NFR HARNESS COVERS
- **Harness:** `tools/nfr/nfr-12-reliability.sh` — blocked at phase 8.
  `ARM_AT_PHASE=8`. No product E2E suite yet.

---

## NFR harness assessment

All 12 NFRs (NFR-01 through NFR-12) have dedicated measurement scripts in
`tools/nfr/`, a shared runner (`tools/nfr/nfr-runner.mjs`), and a shared
library (`tools/nfr/lib.sh`) implementing the phase-ratchet mechanism. The
latest run (`node tools/nfr/nfr-runner.mjs --json`, sha `92bb88c`) shows:

- **2 armed and passing:** NFR-08 (type safety), NFR-11 (i18n)
- **1 baseline:** NFR-03 (APK size — recorded but not gating)
- **9 blocked:** NFR-01, NFR-02, NFR-04, NFR-05, NFR-06, NFR-07, NFR-09, NFR-10, NFR-12
- **0 overdue, 0 error**

The NFR harness is the authoritative verification mechanism for NFRs, separate
from the `@satisfies` trace gate. The trace gate does not scan `.sh` files and
does not know about the NFR harness — this is a tooling gap, not a coverage gap.
The NFR harness should be recognized by the trace gate, either by exempting NFR
IDs from the `@satisfies` scan or by teaching the gate to consult
`artifacts/nfr/report.json`.

**NFR-07** already has `@satisfies NFR-07` in `apps/mobile/src/realtime/__tests__/backoff.test.ts:3`
in addition to its NFR harness script — it passes both gates. This is the
exception, not the rule.

---

## Annotation corrections made

Three misleading `@satisfies` annotations were removed or narrowed:

| File | Before | After | Reason |
|------|--------|-------|--------|
| `apps/mobile/src/domain/links.ts:38` | `@satisfies FR-SRV-006, FR-APP-005` | `@satisfies FR-SRV-006` | `parseInviteLink` only handles the invite pattern; `openchat://channels/...` is unbuilt |
| `apps/mobile/src/domain/__tests__/links.test.ts:31` | `@satisfies FR-SRV-006, FR-APP-005` | `@satisfies FR-SRV-006` | Same — invite-link test does not prove FR-APP-005 |
| `apps/mobile/e2e/flows/p4-04-presence-profile.yaml:3` | `@satisfies FR-SOC-004, FR-SOC-006` | `@satisfies FR-SOC-004` | E2E only proves sheet opens + name; no avatar, mutual servers, or social actions |

No new `@satisfies` annotations were added — no test genuinely proves an
unannotated requirement's full acceptance criterion.

---

## UNBUILT entries filed

| UNBUILT | FR | Priority |
|---------|-----|----------|
| UNBUILT-002 | FR-APP-004 (settings screens) | LOW (Phase 8) |
| UNBUILT-003 | FR-APP-005 (channels deep link) | MEDIUM (Phase 3) |
| UNBUILT-004 | FR-SOC-003 (group DMs) | HIGH (Phase 4) |
| UNBUILT-005 | FR-SOC-006 (profile sheet v2) | MEDIUM (Phase 4) |

All entries follow UNBUILT-001's format: evidence, user-visible impact,
priority, and phase.
