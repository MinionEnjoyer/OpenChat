tool: File (path: /tmp/retro/batches/batch-aw.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_9nD5upsmcl18i6dQnEzr2365`]

<file path="/tmp/retro/batches/batch-aw.md" total_lines="344" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-27T00:51:49-07:00 — Merge branch 'pkce-de...
tool: File (path: /tmp/retro/batches/batch-aw.md)
tool File completed: [Exact evidence retained · 8 KB · inspect with `retrieve_tool_result ref=art_call_00_iUhMJYxyAxH6hfLPrcak2492`]

<file path="/tmp/retro/batches/batch-aw.md" total_lines="344" shown_lines="201-344" truncated="false">
   201│ cookie/session auth (require_user via Depends), not Bearer tokens — the
 ...
## WINDOW
**First:** 2026-07-27T00:51:49-07:00  
**Last:** 2026-07-27T10:38:15-07:00  
**Span:** ~9h 46m, single calendar day (July 27), with an ~8h overnight gap between 00:53 and 08:58.

## WHAT WAS BUILT

1. **PKCE auth implementation** — Auth controller + service (+252 lines of spec tests), +149 lines of characterization tests, and a 137-line proposal doc. Full OIDC PKCE flow landed in one merge.

2. **E2E messaging flow suite (10 flows)** — copy-text, pins-cross-device (A/B pair), polls-cross-device (A/B pair), typing (A/B pair), unread, app-error-toast, and a reusable `_login_friend` subflow. 466 lines in one merge.

3. **night-watch.sh — unattended safeguard sweep** — Encodes 7 failure modes (W1–W7) observed in the prior 24h into a 101-line script so "recovery does not depend on a human noticing." Co-authored with Claude Opus 5.

4. **Upload shadow fix** — Upstream merge introduced a second `@Controller('uploads')` in ShareModule. NestJS resolved to the first-registered (ShareModule's Bearer auth), silently shadowing the working cookie-auth controller. Fix: remove the duplicate from ShareModule. Backed by a contract guard test with perturb-and-restore, plus an end-to-end integration test (byte-identical round-trip through OpenShare).

5. **Attachment BigInt type fix** — Prisma serialises BigInt as a decimal string; four mobile interfaces declared `size: number`. Integration test caught it: `Expected: "number" Received: "string"`. Fix spanned 8 files, 932 tests (was 926P/1F).

6. **E2E clearState fix** — `_login.yaml` and `_login_friend.yaml` had `clearState: false`, so 46/49 runnable flows inherited dirty app state. `msg-005-reply` landed on "No text channels here yet" because a prior flow left a server-without-text-channels selected. Fix: toggle clearState to true in the two shared subflows + one inline login, backed by a 131-line per-flow audit.

## FAILURES AND THEIR COST

1. **W1 — stalled agent**: "zero-byte log, processes alive — **40 min lost**"

2. **W2 — orphan processes**: "still driving a device **44 min** after their agent was killed"

3. **W3 — step-cap work loss**: "uncommitted work lost to step caps (**7+ occurrences**)"

4. **W4 — worktree collision**: "two agents in one worktree (they broke each other's tests)" — cost unquantified

5. **W5 — host OOM**: "emulators 2.6–5.3GB each; an OOM killed **8 agents + the fleet**"

6. **W6 — red base branch**: base branch red after a merge — cost unquantified

7. **Duplicate /uploads controller shadow**: upstream merge introduced a second `@Controller('uploads')` with Bearer auth; NestJS resolved to it first, silencing the working cookie-auth controller. "Bearer auth → 401" on every upload, no crash, no error surfacing. Cost: silent degradation until discovered.

8. **Maestro longPressOn incompatibility**: "STUCK(**6**). Maestro 2.7.0 longPressOn does not trigger React Native onLongPress on Android." Root cause: Maestro uses UIAutomator `longClick()`; RN gesture system expects raw touch events. Fix (tap-before-longPress) was first landed in verify-b merge, then **reverted**, then re-landed as verify-a2.

9. **E2E dirty state**: `clearState: false` default in login subflows meant **46/49 runnable flows** inherited UI state from prior flows. `msg-005-reply` landed on wrong screen. Cost: unknown number of false negatives across the suite.

10. **msg-001 seed text mismatch**: "authored without device access and used 'Welcome to the test world' which doesn't match the actual seeded message text." 1 iteration.

11. **Attachment size type mismatch**: 1 test failing (`926P/1F`) — `Expected: "number" Received: "string"` — caught by integration test before prod impact.

12. **expo-secure-store leakage**: p3-06-invite-accept "appeared to fail on the probed device; the YAML was correct but expo-secure-store leakage on that Android version may have survived pm clear." Cost: unquantified; hardening deferred to follow-up.

## RECURRING THEMES

- **Silent degradation without crashes**: The duplicate /uploads controller produced 401s on every request with no error surface. The `clearState: false` default caused 46 flows to inherit arbitrary UI state with no failure — just wrong screens. Neither crashes nor alerts.

- **Off-device authoring produces wrong assertions**: msg-001 was "authored without device access" and asserted the wrong seed text. The polls-cross-device flow was committed "UNVERIFIED — pending two-device run" with the `@satisfies` tag "withheld." The clearState fix itself was "UNVERIFIED — code-only, no device available."

- **Work landed, reverted, re-landed**: verify-b merge (pins-cross-device longPressOn fix) was merged at 09:15, reverted at 09:23, then superseded by verify-a2 at 09:28. The diagnosis held; the branch workflow didn't.

- **Infrastructure failures encoded as tools**: All 7 night-watch failure modes (W1–W7) are prior-session incidents now encoded into a recovery script — the project treats its own operational failures as requirements for tooling.

## PROCESS SIGNALS

- **Heavy merge-branch fan-out**: 11 named branches merged in this slice: `pkce-desk`, `e2e-srv`, `role001-fix`, `e2e-msgb`, `trace-criteria`, `unbuilt-gate`, `verify-a`, `verify-b`, `fix-upload-shadow`, `verify-a2`, `fix-size-type`, `run-p3`.

- **Device-anchored verification**: Commits reference specific emulators (5554, 5556). Flows are marked PASSED, STUCK(n), or UNVERIFIED — verification status travels with the commit.

- **Perturb-and-restore testing**: The upload route guard test used a "PERTURB (re-register duplicate): FAIL / RESTORE (remove): PASS" pattern — deliberate injection and reversal to prove the fix.

- **Revert workflow**: The verify-b merge was explicitly reverted ("This reverts commit b6baa93…") — not amended, not force-pushed, a proper revert commit in history.

- **Salvage mechanism**: W3 references `--salvage` flag that commits uncommitted work before step caps hit.

- **Co-authored tooling**: night-watch.sh is "Co-Authored-By: Claude Opus 5."

- **Conflicts on shared artifacts**: Both `trace-criteria` and `unbuilt-gate` merges show `# Conflicts: artifacts/trace/matrix.json` — parallel branches colliding on a shared JSON artifact.

## PACE

- **Commits in slice**: 24
- **Calendar days touched**: 1 (July 27)
- **Bursts**:
  - **00:51–00:53** (6 commits in ~2 min) — merges + night-watch tooling
  - **08:58–09:00** (5 commits in ~2 min) — msg fixes, trace, unbuilt-gate
  - **09:12–09:28** (6 commits in ~16 min) — verify-b, revert, upload fix, verify-a2
- **Gap**: ~8h between 00:53 and 08:58 (overnight pause)
- **Last 3 commits spread over 42 min** (09:52–10:38) — size types, p3-01 verify, clearState fix
