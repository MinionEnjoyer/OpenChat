tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: [Exact evidence retained · 13 KB · inspect with `retrieve_tool_result ref=art_call_00_3uAUVqmyg20qsObHVFdo9379`]

<file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-26T11:28:03-07:00 — fix(e2e): p1-02-sessi...
tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: [Exact evidence retained · 12 KB · inspect with `retrieve_tool_result ref=art_call_00_zXFGNrIvpivD8BLd1OQh8205`]

<file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="201-400" truncated="true" next_start_line="401">
   201│ Defect 2: mention candidates gated behind members d...
tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: [Exact evidence retained · 4 KB · inspect with `retrieve_tool_result ref=art_call_00_DoB4vGzzmdclfsioAg1D0679`]

<file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="401-471" truncated="false">
   401│   gated actions, destructive styling, and safe-area bottom inset.
   402│...
tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_F51dIYp7XHrHHhIKoxrU5123`]

<file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="29-198" truncated="true" next_start_line="199">
    29│   (expoImageProcessor) is used at runtime via useUpl...
tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: <file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="125-144" truncated="true" next_start_line="145">
   125│ - CreateServerScreen calls invalidateQueries({ queryKey: keys.servers })
   126│ - ServerSettingsScreen rename calls invalidateQueries({ queryKey: keys.servers })
  ...
tool: File (path: /tmp/retro/batches/batch-an.md)
tool File completed: [Exact evidence retained · 4 KB · inspect with `retrieve_tool_result ref=art_call_00_AOkA0IT5TEb1IN9aYEtz8500`]

<file path="/tmp/retro/batches/batch-an.md" total_lines="471" shown_lines="145-199" truncated="true" next_start_line="200">
   145│  tools/.unreachable-allow   |  6 ++++++
   146│  too...
## WINDOW
- **First**: 2026-07-26T11:28:03-07:00
- **Last**: 2026-07-26T11:59:12-07:00
- **Span**: 31 minutes, 9 seconds

## WHAT WAS BUILT

1. **Push notifications end-to-end**: Backend push dispatch worker (Redis pub/sub → FCM HTTP v1 with JWT auth, `FR-NOTIF-001` + `FR-NOTIF-003`), device token registry API (`POST/DELETE /devices/:token`, user-scoped, 12/12 integration tests), OpenAPI contract + codegen, and the mobile client (`expo-notifications`, token lifecycle, foreground suppression, tap-through routing, 31 unit tests). Three branches merged.

2. **Mutation cache-invalidation test suite**: A reusable factory (`mutationInvalidationHelper`) that derives expected query keys from the READ side, not from mutation `onSuccess`. Covered all 14 mutation paths across servers, channels, DMs, roles, and notification settings. Surfaces that invalidation *calls* are correct even where the mutation *mechanism* is wrong (raw `api.request` instead of `useMutation`).

3. **Mutation hook refactor**: Extracted all mutation hooks to dedicated definitions (`useCreateServer`, `useRenameServer`, `useDeleteServer`, `useAcceptInvite`, `useDeclineInvite`, `useUpsertNotifSetting`, `useDeleteNotifSetting`), wired them to call sites with proper `mutateAsync` + `onSuccess` invalidation.

4. **E2E harness hardening**: Three fixes in a single burst — made `p1-02-session-restore` self-contained via `# e2e:no-clear` convention, fixed `p1-01` missing rail tap, added per-run verdict file isolation (PID+timestamp) with device-level atomic `mkdir` lock to prevent collision. Also fixed a vacuous API-host bundle check that passed regardless of config.

5. **Android UX fixes**: Replaced `Alert.alert` (3-action Android limit) with `MessageActionSheet` bottom sheet supporting 7 actions with permission gating preserved. Fixed `PollCreate` Modal/KAV nesting race where keyboard padding persisted past close. Fixed mention picker so `@` triggers members fetch without requiring drawer open.

6. **Tooling and gate work**: Wired `check-unreachable.sh` into `devctl verify` as layer 7. Fixed BSD `sed` regex bug producing 6 false positives. Replaced `worktree-up.sh` `npm ci` with shared `node_modules` symlinks.

## FAILURES AND THEIR COST

- **BSD sed false positives**: "the `\?` escape in basic sed is a GNU-ism; BSD sed treats it as literal `?`, so sibname retained `.tsx`/`.ts` suffix, breaking the transitive reachability check and **producing 6 false positives**" — no hours figure given.

- **Vacuous API-host check**: "the check passed regardless of which host the app actually used" — the JS bundle contained *both* the emulator constant and the inlined config value, so `grep` always matched. No explicit cost figure, but implies prior E2E runs may have been against the wrong host.

- **E2E verdict file collision**: "Two concurrent runs on the same device wrote to the same verdict file (`/tmp/e2e-verdicts-$DEV.txt`), silently interleaving results." No explicit hours cost quoted.

- **p1-01 missing rail tap**: "p1-01 scrolled to `rail-server-Fixture Guild` but never tapped it. The channel drawer was showing a different (empty) server's channels, so `channel-#general` did not exist in the hierarchy." Broke all downstream flows depending on `channel-#general`. No explicit hours cost.

- **Modal/KAV regression from `6310dd4`**: "When the modal closes (`visible=false`), the KAV padding adjustment can persist past the close transition, blocking the composer-input underneath." The same pattern exists in **6 other modals** from the same commit — documented but not yet fixed. No cost figure.

- **Mention picker gated behind drawer open**: "Users who never opened the right drawer saw only `@everyone`/`@here` in the mention picker." No cost figure.

- **Agent step-cap loss**: "four agents lost work to step caps" (from the dispatcher lessons doc). No explicit hours figure.

- **Test seam contamination**: `jest.clearAllMocks` left `mockReturnValueOnce` queues persisting across tests; an unconsumed `mockResolvedValueOnce` in the rotation test. No explicit cost figure.

- **Three known-broken invalidation cases all PASS at unit level**: Create/Rename server use raw `api.request` instead of `useMutation` — "No structured `onSuccess`/`onError`, no automatic…" (truncated in source). The invalidation *calls* are correct, but the mechanism carrying them is wrong. No cost figure.

## RECURRING THEMES

- **Silent false passes**: The vacuous host check, the 6 unreachable-code false positives from the BSD `sed` bug, and the three broken invalidation cases all passing at unit level — tooling and tests that say "green" while the system is wrong.

- **Pattern blindness**: Commit `6310dd4` introduced a Modal/KAV nesting defect in PollCreate, and the fix commit notes "Same pattern exists in 6 other modals from `6310dd4`" — the same bug shipped 7 times. The dispatcher lessons doc then codifies "when fixing a pattern always demand the inventory of where else it occurs."

- **Cross-test state leakage**: The `jest.clearAllMocks` → `jest.resetAllMocks` fix, plus unconsumed mocks, plus the `_resetMocksForTest` needing to reset all module state (not just function refs) — three distinct forms of test-to-test contamination in one slice.

- **Work done twice**: The mutation invalidation test suite was built, then immediately followed by "wire extracted mutation hooks to call sites" — the hooks had been extracted but not wired. The invalidation tests found that some mutations weren't even using `useMutation`.

## PROCESS SIGNALS

- **Agent fan-out**: Explicitly documented — "dispatcher lessons from the 2026-07-26 fan-out" commit names seven recurring defects, all dispatcher-side. "four agents lost work to step caps." Multiple `Co-Authored-By: Claude Opus 5` signatures.

- **Branch + merge workflow**: Six merge commits (`gate-wiring`, `diag-singles`, `fix-rail-overflow`, `notif-be-registry`, `notif-be-worker`, `fix-android-actions`), all within a 24-minute window, all into `integration`.

- **Worktrees**: `worktree-up.sh` refactored to use symlinks instead of `npm ci`. "Verified: throwaway worktree + `npx tsc --noEmit` in apps/mobile resolves."

- **Perturb-and-restore**: "Demonstrated mute-rule and one-push-per-device enforcement by temporarily removing the gates and showing 5+1 test failures."

- **Canary proofs**: "Proven: canary DeadCanary export → gate fails → remove → gate passes"; "Proven: old check passes vacuously for wrong host; new check correctly discriminates"; "All four preconditions proven firing via synthetic tests."

- **Verification gates**: `check-unreachable` wired into `devctl verify` as layer 7. Gate evidence cited per-commit: "48/48 tests pass," "12/12 integration tests pass," "31/31 tests passing," "tsc + eslint clean."

- **Explicit non-verification**: "Device verification was NOT performed" (MessageActionSheet commit).

- **Deferred scope**: "Bans, timeouts and role assignment are deliberately backend-only." Stakeholder quote: "i dont really care about bans or timeouts, server roles or any of that for now. Let's get notifications in though."

- **Abandoned work**: HelloScreen deleted (47 lines removed, plus its E2E flow `p0-17-hello.yaml`), part of the `diag-singles` merge.

## PACE
- **Commits**: 23 (including 6 merges)
- **Calendar days**: 1 (2026-07-26)
- **Burst**: Entire window compressed into 31 minutes, 9 seconds (11:28:03 → 11:59:12)
- **Visible gaps**: ~7-minute gap between the merge cluster at 11:32 and the next substantive commit at 11:39; otherwise steady ≤3-minute intervals throughout.
