# BACKLOG — Frozen Bugs from Characterization Suite

Each entry records a behavior frozen by the P0-04 characterization suite that is
either incorrect, incomplete, or merely tolerated. All entries include evidence
(test name + file:line), user-visible impact, priority, and the phase where the
fix should be applied.

**Rule:** When fixing any entry below, the characterization test that froze it
must be updated in the same commit (with the spec work-item ID in the commit
message) per `02-PHASE0-DISCOVERY.md §P0-04`. Never silently edit a
characterization test to match new behavior.

---

## BUG-001: 500 Internal Server Error on server leave

- **Evidence:** `servers.spec.ts:112` — `expect([200, 500]).toContain(res.status)`
  with comment `// characterizes: leave returns 200 or 500 (freeze whichever)`
- **User-visible impact:** Users see an error when leaving a server. This is a
  common user action and a 500 is never acceptable.
- **Priority:** HIGH — shipping a 500 on an ordinary user action is not
  acceptable parity.
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps). The root cause is likely
  in the `ServersService.leave()` method.
- **Fix note:** When fixed, update `servers.spec.ts:112` to `expect(res.status).toBe(200)`
  in the same commit, with `[P0-04]` in the commit message.

## BUG-002: 500 Internal Server Error on member kick

- **Evidence:** `servers.spec.ts:122` — `expect([200, 500]).toContain(res.status)`
  with comment `// characterizes: kick returns 200 or 500 (freeze whichever)`
- **User-visible impact:** Server owners see errors when kicking members.
  Same as BUG-001 — not acceptable parity.
- **Priority:** HIGH
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps).
- **Fix note:** When fixed, update `servers.spec.ts:122` to `expect(res.status).toBe(200)`
  in the same commit.

## BUG-003: 403 Forbidden on DM creation between non-friends (no happy path)

- **Evidence:** `dms-friends.spec.ts:16-17` — `expect(res.status).toBe(403)`
  with comment `// characterizes: DM creation between non-friends returns 403`
- **User-visible impact:** Users cannot create DMs with anyone who is not already
  a friend. The DM system is gated on friendship, which is the current design,
  but the 403 error path is characterized; the happy path (DM between friends)
  has no characterization test.
- **Priority:** MEDIUM — design decision, not a bug in the strict sense, but
  needs a happy-path characterization test.
- **Phase:** Phase4 (Social) — implement DM happy-path test.

## BUG-004: null friendCode (lazy backfill)

- **Evidence:** `auth.spec.ts:16-18` — `if (res.body.friendCode !== null) { ... }`
  with comment `// characterizes: friendCode may be null (lazy backfill in getCurrentUser)`
- **User-visible impact:** New users created via dev-login may have a null
  friendCode until `GET /auth/me` is called (which triggers lazy backfill).
  This is a minor UX issue — friend codes may briefly appear null.
- **Priority:** LOW — the backfill runs on next `/me` request, so this is
  self-healing. Tighten if needed.
- **Phase:** Phase7 (Parity Gaps) or any later phase.

## BUG-005: member-role assignment status <500 (too permissive)

- **Evidence:** `roles.spec.ts:40` — `expect(res.status).toBeLessThan(500)`
  with comment `// characterizes: role assignment behavior — freeze whichever status code`
- **User-visible impact:** Role assignment endpoint behavior is not pinned down.
  Could silently change from one 2xx/3xx/4xx to another.
- **Priority:** LOW — tighten to exact status code once behavior is stable.
- **Phase:** Phase4 (Social) or Phase7 (Parity Gaps).

## BUG-006: poll vote accepts [200, 201] range

- **Evidence:** `pins-polls.spec.ts:44` — `expect([200, 201]).toContain(res.status)`
  with comment `// characterizes: poll vote returns 200 or 201`
- **User-visible impact:** Poll voting behavior is not pinned down.
- **Priority:** LOW — tighten to exact status code.
- **Phase:** Phase4 (Social) or any later phase.

## BUG-007: logout accepts [200, 201] range

- **Evidence:** `auth.spec.ts:113` — `expect([200, 201]).toContain(res.status)`
- **User-visible impact:** Minimal. Logout behavior is not precisely pinned.
- **Priority:** LOW.
- **Phase:** Phase1 (Auth) or any later phase.

## BUG-008: DM requires friendship — no happy path test

- **Evidence:** `dms-friends.spec.ts:12-18` — only the 403 error path is tested
  for `POST /dms`. No test currently verifies successful DM creation between
  friends.
- **User-visible impact:** The DM happy path is uncovered. A regression could
  break DM creation without a test failure.
- **Priority:** MEDIUM — coverage gap.
- **Phase:** Phase4 (Social) — add DM happy-path characterization test.

## BUG-009: Fixed waits in WS tests (potential flake)

- **Evidence:** `ws.spec.ts:44,58,60,64,76` — `setTimeout(r, 300-500)` fixed
  waits instead of polling-with-timeout.
- **User-visible impact:** WS tests may flake under CI load or on slower
  machines.
- **Priority:** LOW — hardening item. No user-visible bug.
- **Phase:** Phase2 (Messaging) or Phase8 (Notifications/Release) — convert
  fixed waits to polling loops.

## BUG-010: Inter-test coupling via shared seed state

- **Evidence:** `jest-char.config.js:13` `maxWorkers: 1` hides coupling.
  `pins-polls.spec.ts:14` references `s.messageIds[0]` which may have been
  modified by prior tests. `dms-friends.spec.ts:39` uses conditional logic
  based on prior test results.
- **User-visible impact:** A partial rerun (`--testNamePattern`) could behave
  differently than a full suite run.
- **Priority:** LOW — infrastructure hardening.
- **Phase:** Phase0 (Discovery) or Phase8 — isolate seed per-test or document
  ordering assumptions.

## BUG-011: P0-06 seed deviation undocumented in decision record

- **Evidence:** `docs/LOG.md:91` — "Seed strategy: API-driven seed in helpers.ts
  via seed(). No P0-06 dependency." No formal decision record exists.
- **User-visible impact:** The 1000-message `#volume` channel required for
  NFR-02 baselining and E6 has no home. P0-06's `fixture-ids.json` does not
  exist.
- **Priority:** MEDIUM — homeless requirement; P0-06 rescope needed.
- **Phase:** P0-06 (when rescoped) — write T3 decision record documenting the
  deviation.

## BUG-012: WS error handler silently swallows connection errors

- **Evidence:** `helpers.ts:97` — `ws.on('error', () => {})` — WS connection
  errors are silently dropped. Test failures manifest as timeouts, not
  descriptive errors.
- **User-visible impact:** Debugging test failures is harder than necessary.
- **Priority:** LOW — infrastructure hardening.
- **Phase:** Phase2 (Messaging) — log errors and surface in test failure output.

## BUG-013: Coverage thinner than claimed — several 03 §2 routes untested

- **Evidence:** `DELETE /friends/:userId`, `POST /friends/requests/:id/decline`,
  `POST /block/:userId`, `DELETE member-roles` have no tests. `POST /dms` has
  only error path, no happy path. `GET /friends/requests` and `GET /notifications`
  are only covered by the 401 matrix.
- **User-visible impact:** These endpoints have no characterization protection.
  A regression could silently change their behavior.
- **Priority:** MEDIUM — coverage gap.
- **Phase:** P0-04 extension or Phase7 (Parity Gaps) — add characterization
  tests for uncovered routes.

---

*Last updated: 2026-07-21 (P0-04 remediation)*