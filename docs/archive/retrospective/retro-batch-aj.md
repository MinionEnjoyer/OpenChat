tool: File (path: /tmp/retro/batches/batch-aj.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_Lok8pVEAqOGnNQCKw4c64248`]

<file path="/tmp/retro/batches/batch-aj.md" total_lines="386" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-25T13:49:47-07:00 — merge: soc-dms (direc...
tool: File (path: /tmp/retro/batches/batch-aj.md)
tool File completed: [Exact evidence retained · 10 KB · inspect with `retrieve_tool_result ref=art_call_00_O55hG2AT0twkyOyyxd9q7224`]

<file path="/tmp/retro/batches/batch-aj.md" total_lines="386" shown_lines="201-386" truncated="false">
   201│ 
   202│ The test 'removes blocked user after unblock' was calling DELET...
## WINDOW
- **First**: 2026-07-25T13:49:47-07:00
- **Last**: 2026-07-25T19:52:27-07:00
- **Span**: ~6h 3m, single calendar day

## WHAT WAS BUILT
1. **Direct Messages feature** — DmsList component, hooks, integration tests, schema types, ShellScreen integration (soc-dms merge, 511+ lines)
2. **Presence indicators** — PresenceDot component, Zustand presence store, integration tests, member-list wiring (soc-presence merge, 513+ lines)
3. **Voice channel occupancy via WebSocket events** (FR-VOX-004) — `VOICE_OCCUPANCY_CHANGED` bus event, S2C `voice.occupancy` frame in gateway-events contract, targeted query-cache invalidation on mobile, 5-test convergence suite
4. **Voice connection layer on mobile** (FR-VOX-001) — VoiceService API wrapper, VoiceStore (Zustand: idle/joining/connected/leaving lifecycle), `useVoiceConnection` hook wiring livekit-client Room, VoicePill call banner, 24 tests (16 unit + 8 integration), public extension contract documented for downstream agents
5. **Notification persistence migrations** (DD-022) — generated missing migration for `NotificationSetting` and `DeviceToken` tables/enums/indices, CI drift guard (`tools/db/check-migration-drift.sh`) wired into verify job
6. **Integration wave4 merge** — foreground notification handler, server settings screen, codegen contract regeneration, openapi.yaml expansion (64 files, 6645+ insertions)

## FAILURES AND THEIR COST
- **Schema.prisma replaced by `prisma db pull` artifact** (commit 56d1eee): "capitalized relation names, stripped `@default(uuid())` from id fields, stripped `@updatedAt`, and replaced named relations with auto-generated names." Cost: **~159 tsc errors**, full restore from last-good commit required.
- **Stale tsbuildinfo caused silent no-op builds**: "a stale tsbuildinfo outside `dist/` caused silent no-op builds." Build reported success but produced no output. No hours figure stated, but the fix (`tsBuildInfoFile: ./dist/tsconfig.tsbuildinfo`) was coupled with rootDir/include repairs.
- **Wrong endpoint for unblock**: test called `DELETE /friends/:userId` → `friendsService.remove()`, which "only matches ACCEPTED friendships, not BLOCKED ones." Returned 404. Cost: test failure, fix required endpoint change to `POST /friends/unblock/:userId`.
- **Non-hermetic notif-settings test**: `'notif-test-user'` reused across runs; leftover `NotificationSetting` rows broke the 'starts with no settings' assertion ("expected 0, got 2+"). Cost: flaky test until unique-per-run usernames + afterAll cleanup added.
- **Eslint regression from tsconfig build fix**: narrowing `include` to `["src/**/*"]` for the NestJS build broke eslint, which needs `test/` files too. Cost: required a separate `tsconfig.eslint.json` to widen include without breaking the build.
- **Mobile API tests fail opaquely when `API_BASE` unset**: "has been misread as a regression three times." Cost: **3 false diagnoses** of regression.
- **Misleading convergence test**: "simulate 4s delay" test "only waited 10ms" — passed but proved nothing. Cost: test was a lie; replaced with synchronous elapsed-time measurement and perturb-and-restore verification.
- **node_modules committed as tracked symlinks**: occurred twice in this window (14:09 and again at 18:14). Second instance described as "fleet-wide donor breakage." No hours cost stated, but the repetition is itself a cost signal.

## RECURRING THEMES
- **Silent degradation**: stale tsbuildinfo → silent no-op builds; "4s delay" test that waited 10ms; non-hermetic tests passing in isolation but failing in suite; node_modules symlinks recommitted after being removed
- **Tooling that lied**: `prisma db pull` silently discarded `@default(uuid())`, `@updatedAt`, and renamed relations; stale incremental build cache produced green builds with no output; mobile tests fail opaquely when env is unset
- **Work redone in-window**: node_modules symlinks removed at 14:09, then removed *again* at 18:14; schema restored from last-good commit then manually re-added genuinely new models; tsconfig build fix at 19:04 required eslint follow-up fix at 19:19
- **Non-hermetic test state**: shared usernames across runs; same class of problem recurred (notif-settings) even after the unblock-endpoint fix landed in the same burst

## PROCESS SIGNALS
- **Agent fan-out**: six feature branches merged in this window (soc-dms, soc-presence, integ-wave4, role002-proptest, fix-blocked-unblock, and the voice work); independent agents worked on DMs, presence, voice, and notifications in parallel
- **Worktrees in use**: `.gitignore` fix explicitly mentions "preventing accidental commits in worktrees"
- **Verification gates cited**: `tsc --noEmit`, `eslint --max-warnings=0`, jest suite counts, `codegen --check` appear as gating evidence on multiple commits
- **Perturb-and-restore**: explicitly performed on the FR-VOX-004 convergence test — "Perturbed the assertion (`expect(elapsed).toBeGreaterThan(3000)`), captured failure (`Received: 0`), then restored correct assertion"
- **Schema restore from git history**: "Restored schema from last-good commit c497ef3, then re-added genuinely new models"
- **CI guard added in response to failure**: `tools/db/check-migration-drift.sh` wired into `.github/workflows/ci.yml` verify job after DD-022 was discovered
- **Backlog item recorded live**: "mobile API tests fail opaquely when API_BASE is unset" documented in `docs/BACKLOG.md` the moment it was recognized as a recurring misdiagnosis
- **Extension contract left for successors**: voice feature `index.ts` "documents public surface for FR-VOX-002/003/005/006/007 agents"

## PACE
- **Commits in slice**: 24
- **Distinct calendar days**: 1
- **First burst**: 13:49–14:55 (6 commits in ~66 min) — merges and integration fixes
- **Gap**: ~3h 19m (14:55 → 18:14)
- **Second burst**: 18:14–19:52 (14 commits in ~98 min) — intense: schema restore, 2 dependency resolutions, presence merge, 4 test/endpoint fixes, eslint regression, migration generation, voice occupancy, voice connection layer, convergence proof
- Peak density: 19:04–19:52 saw 9 commits in 48 minutes, including the entire voice feature landing
