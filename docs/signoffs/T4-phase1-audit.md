# T4 Phase 1 Audit — Evidence vs Acceptance Criteria

Date: 2026-07-26 · Audit of Phase 1 FRs against their acceptance criteria.
This audit judges whether the evidence that claims to satisfy each FR actually
demonstrates the criterion — not whether `@satisfies` annotations exist.

## Method

1. Extract every FR assigned to Phase 1 from `specs/01-REQUIREMENTS.md`.
2. For each: read the acceptance criterion, note the required evidence kind.
3. Find all `@satisfies` claims and open the evidence files.
4. Classify evidence kind: Maestro flow = E2E; `apps/api/test/integration/*.spec.ts` = Integration; other `*.test.ts` = Unit.
5. Judge: SATISFIED / WEAK-EVIDENCE (right thing, wrong evidence kind) / UNSATISFIED (nothing demonstrates it).

## Known prior issue

**UNBUILT-001** (docs/BACKLOG.md:216): FR-AUTH-001 client half unbuilt — no
E2E exists, no system-browser OIDC PKCE flow. The `@satisfies` annotation on
a unit test was already corrected in a prior session (LOG.md:337), but the FR
remains unsatisfied. This audit confirms that status.

## FR-by-FR audit

| FR ID | Criterion (abbreviated) | Required kind | Evidence found | File:line | Verdict | Note |
|-------|------------------------|---------------|----------------|-----------|---------|------|
| FR-AUTH-001 (P0) | E2E: fresh install → login → GET /api/auth/me 200 with bearer; no cookies | E2E | Unit test (mocked PKCE module, mocked `openAuthSessionAsync`, mocked vault) | `apps/mobile/src/stores/__tests__/session.test.ts:101` | **UNSATISFIED** | UNBUILT-001 already documents this. No system-browser E2E exists. The PKCE unit test (`pkce.test.ts`) itself states "The system-browser step is mocked — an end-to-end test against a live Authentik instance is required." The `@satisfies` on `session.test.ts:101` was supposed to have been removed per LOG.md:337 — it still exists. |
| FR-AUTH-002 (UNK) | Integration: [redacted] | Integration | Integration test: rotation (rt1→rt2, rt2≠rt1), reuse of spent token → 401, sibling also dead → 401 | `apps/api/test/integration/bearer-auth.spec.ts:47` | **SATISFIED** | Requirement text: "Token refresh with rotation; revoked/reused refresh token is rejected." The integration test proves all three clauses against the real API. |
| FR-AUTH-003 (UNK) | E2E: [redacted] | E2E | Maestro E2E flow: login → kill → relaunch → shell visible, login screen not visible + Unit test: vault→session restore | `apps/mobile/e2e/flows/p1-02-session-restore.yaml`; `apps/mobile/src/stores/__tests__/session.test.ts:50` | **SATISFIED** | Requirement: "Secure token storage (Keychain/Keystore); survives app restart." The E2E flow proves session survives app restart on-device. Caveat: uses dev-login, not native OIDC — the secure storage mechanism (expo-secure-store) is tested, but only with dev-login tokens. |
| FR-AUTH-004 (UNK) | Integration: [redacted] | Integration | Integration test: logout with refreshToken revokes family; subsequent token use → 401 + Unit test: logout clears vault, POSTs refreshToken | `apps/api/test/integration/bearer-auth.spec.ts:75`; `apps/mobile/src/stores/__tests__/session.test.ts:83` | **SATISFIED** | Requirement: "Logout ends local session, revokes refresh token, returns to login." Server integration test proves token revocation; client unit test proves local clearing + revocation POST. |
| FR-AUTH-005 (P0) | Integration: bearer → /api/auth/ws-ticket → WS connect accepted | Integration | Integration test: bearer token → /auth/me 200; bearer → /auth/ws-ticket → ticket → real WS connection → `ready` op received | `apps/api/test/integration/bearer-auth.spec.ts:27,89` | **SATISFIED** | Full chain proven: bearer issuance → guarded route access → ws-ticket → WS connect → ready frame. Two `@satisfies` annotations (lines 27 and 89) both genuinely prove this FR. |
| FR-AUTH-006 (P0) | E2E: change display name → visible in a message from a second client | E2E | Unit test: optimistic apply, server copy kept on success. Mocked `global.fetch`. | `apps/mobile/src/stores/__tests__/profile.test.ts:19` | **UNSATISFIED** | Criterion explicitly requires two-device E2E. The unit test proves optimistic update logic but does not demonstrate cross-device visibility, and uses a mocked fetch — it cannot. FR-AUTH-006 is split Phase 1/5 (profile edit Ph1, avatar Ph5) but the criterion is not split. |
| FR-AUTH-010 (P1) | Integration (mock 401 storm): no crash, no request loop (≤3 retries) | Integration | Unit test: single-flight refresh, concurrent 401s share one refresh, refresh failure → hard logout. Mocked `global.fetch`. | `apps/mobile/src/api/__tests__/client.test.ts:42` | **WEAK-EVIDENCE** | The unit test proves single-flight logic and failure handling, but the criterion explicitly says "Integration (mock 401 storm)." This is a unit test against a mocked `fetch` — it does not exercise the real API client against any server. The test also only covers the refresh interceptor, not the full "hard 401 → login screen, state cleared" UX path. |
| FR-APP-001 (P0) | Maestro flow walks all four surfaces | Maestro | Maestro E2E: login → shell → left drawer (server-rail, channel-drawer) → select channel (chat pane) → right drawer (members-drawer) → close drawers | `apps/mobile/e2e/flows/p1-01-devlogin-shell.yaml:2` | **SATISFIED** | Explicitly walks all four surfaces: server rail, channel drawer, chat pane, members drawer. Uses provisioned test world (env vars for server/channel/username). Assertions include drawer open/close and scrim dismissal. |
| FR-APP-003 (P0) | Integration: drop WS → banner ≤3s; restore → banner clears, missed message appears without manual refresh | Integration | Shell script (E2E): airplane-mode toggle + Maestro assertions. Banner appears ≤15s offline, clears ≤60s after reconnect. + Unit test: banner state transitions (everConnected). | `tools/e2e-offline-banner.sh:31,46`; `apps/mobile/src/stores/__tests__/connection.test.ts:8` | **WEAK-EVIDENCE** | Three gaps: (1) Criterion says "Integration" — neither evidence file is integration-level; the shell script is E2E (real device network), the jest test is Unit. (2) Timeout is 15s vs spec's 3s for banner appearance. (3) The "missed message appears without manual refresh" clause is completely untested — no evidence exercises auto-resubscribe + refetch. |

## Summary

| Verdict | Count | FRs |
|---------|-------|-----|
| SATISFIED | 5 | FR-AUTH-002, FR-AUTH-003, FR-AUTH-004, FR-AUTH-005, FR-APP-001 |
| WEAK-EVIDENCE | 2 | FR-AUTH-010, FR-APP-003 |
| UNSATISFIED | 2 | FR-AUTH-001, FR-AUTH-006 |
| **Total** | **9** | |

### P0 blockers (not SATISFIED)

1. **FR-AUTH-001** — Native OIDC login. No E2E exists. Client PKCE flow has unit tests but the system-browser half is mocked. UNBUILT-001 already documents this. The `@satisfies FR-AUTH-001` annotation on `session.test.ts:101` was supposed to have been removed per LOG.md:337 — it still exists and is misleading.

2. **FR-AUTH-006** — Profile edit E2E. The criterion requires two-device visibility ("change display name → visible in a message from a second client"). Only a unit test with mocked fetch exists. FR-AUTH-006 is split Phase 1/5; even the Phase 1 half (profile edit API) lacks integration or E2E evidence.

3. **FR-APP-003** — Connection banner. P0 with WEAK-EVIDENCE. The criterion explicitly demands Integration-level evidence; both existing pieces are the wrong kind (E2E shell script + Unit). The "missed message appears without manual refresh" clause is completely untested.

### Additional notes

- **FR-AUTH-002, FR-AUTH-003, FR-AUTH-004**: Acceptance criteria are `[redacted]` in the spec. Verdicts are based on the requirement text matching the evidence. If the redacted criteria contain additional constraints, this audit cannot judge them.
- **FR-AUTH-003**: Uses dev-login for the E2E flow, not native OIDC. The secure storage mechanism is tested but only with dev-login tokens. If the redacted criterion specifies OIDC tokens specifically, this would downgrade.
- **FR-AUTH-010** (P1, not a P0 blocker): Unit test proves single-flight logic but the criterion explicitly says Integration. No retry-loop test exists (the second test "≤3 calls total per request" only counts 1 original + 1 refresh, not a 3-retry storm scenario).

## Signoff recommendation

**NOT GRANTED.** Three P0 requirements are not SATISFIED (FR-AUTH-001, FR-AUTH-006, FR-APP-003). Phase 1 cannot be signed off until these are resolved.
