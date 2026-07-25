# HANDOFF — Autonomous work order: Phase 3 (Servers) + Phase 4 (Social)

You are picking up a working React Native app mid-project. Read this whole file
before touching anything.

## Prime directive

**Nothing is "done" until you have run it and pasted the output.**

The single most expensive failure in this project's history is work that looked
finished but was never executed: a seed script committed with a syntax error, a
"frozen" API contract that described the wrong wire format, an E2E flow that
could never pass twice, a lint gate that had never fired once, and four commit
SHAs reported that did not exist. Every one of those passed a review that read
the code instead of running it.

So: for every claim you make, paste the command and its real output. If you did
not run it, say "not run" — that is an acceptable answer. A false "done" is not.

## Where things stand

- `.phase` = 1. Phases 0 and 1 are signed off (`docs/signoffs/T4-phase0-signoff.md`).
- The app **works**: dev-login → server rail → channel list → live messages.
  Two clients exchange messages over the WebSocket in under 5s, proven on device.
- Backend: bearer auth is live (`POST /api/auth/token`, rotation + family
  revocation). Every guarded route accepts bearer OR cookie. Web client untouched.
- Test suites, all green: 89 characterization, 38 contract, 8 integration,
  52 mobile unit. `./tools/devctl verify` passes all seven layers.

## Your scope

Work items from `specs/12-PHASE3-SERVERS.md`, then `specs/13-PHASE4-SOCIAL.md`.
The authoritative requirement list is `specs/01-REQUIREMENTS.md` — the FR tables
for SRV / ROLE (Phase 3) and SOC (Phase 4). Read those tables; do not invent
requirements, and do not skip ones you find boring.

Task 0 and Task 1 below come first, in order, before any Phase 3 work.

## Environment — do this first, every session

```bash
cd ~/work/OpenChat
source tools/env.sh          # JDK + Android SDK are NOT on PATH without this
./tools/devctl stack up      # docker: postgres, redis, api, web, livekit, openshare
./tools/devctl stack health  # must print all "ok"
./tools/devctl stack seed    # creates alice/bob/carol/dave + Fixture Guild
./tools/devctl device up     # boots the Pixel 6a emulator (skip if already up)
```

Build + install the app after **any** JS or native change:

```bash
cd apps/mobile/android && ./gradlew assembleRelease && cd ../../..
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

That takes ~40s. There is no hot reload in this loop — if you change JS and do
not rebuild, you are testing the old bundle. This has already burned an hour
of someone's time.

## Traps that will cost you hours (all learned the hard way)

| Trap | Reality |
|---|---|
| `adb`/`java` "not found" | `source tools/env.sh` first. JDK 17 is an unlinked Homebrew keg. |
| Changed JS, behavior unchanged | You did not rebuild + reinstall. See above. |
| Gateway `subscribe` | Takes `{channelId}` **singular**, one frame per channel. NOT `channelIds[]`. |
| Gateway `message.created` | Payload is `{message, nonce?}` — the message is **wrapped**, not bare. |
| Message list order | **Newest-first** (E6). The list renders `inverted`. |
| Adding server members | `POST /servers/:id/members` only sends an *invitation*. To actually add someone: create an invite, then `POST /invites/:code/accept` as that user. The seed does this correctly — copy its pattern. |
| Maestro `assertVisible` | Has **no** `timeout` property. Use `extendedWaitUntil` when waiting. |
| Server rail in E2E | It virtualizes. Use `scrollUntilVisible`, not bare `assertVisible`. |
| testIDs contain `#` | Channel testIDs are `channel-#general`, not `channel-general`. |
| `git commit` fails on lint | `apps/api` has no ESLint config, so the pre-commit lint step can never pass. Use `git commit --no-verify` and say so in the commit message. Run `npx tsc --noEmit` manually instead. |
| `./tools/devctl commit` | Broken — it aborts on any dirty tree. Use plain `git`. |
| `./tools/devctl verify --json` | Emits no JSON. Use the text output. |
| Release build + `http://` | Already solved via `expo-build-properties`. Do not remove it. |

## Task 0 — Correct a false traceability claim (do this first, ~15 min)

`apps/api/test/integration/bearer-auth.spec.ts` carries `@satisfies FR-AUTH-001`
on a test that only proves bearer tokens work via **dev-login**. FR-AUTH-001 is
native **OIDC** login via the system browser — `expo-auth-session` is not even
installed. The trace matrix therefore asserts a requirement that is not built.

Do this:
1. Change that annotation to `@satisfies FR-AUTH-005` (ws-ticket via bearer,
   which the test genuinely proves).
2. Add to `docs/BACKLOG.md`: FR-AUTH-001 client half unbuilt — needs
   `expo-auth-session` PKCE against `GET /api/auth/oidc-metadata`; backend
   exchange endpoint already exists and is tested.
3. Run `./tools/devctl trace check` and paste the output.

**Done when:** trace check passes and no annotation claims an unbuilt feature.

## Task 1 — Fix the phone layout (do this before any new screen, ~2h)

`ShellScreen.tsx` renders rail + channels + chat + members as fixed side-by-side
columns. On a 1080px phone the chat pane gets ~450px and text wraps mid-word.
FR-APP-001 requires **"gesture drawers on phone"**. This is wrong, and every
screen you build in Phase 3/4 will inherit it, so fix it now.

Target (Discord's phone layout):
- Chat pane is **full-width** by default.
- Left drawer holds the server rail + channel list; opens by swiping right from
  the left edge, or tapping a hamburger in the top bar. Closed at launch.
- Right drawer holds members; opens by swiping left, or tapping the existing
  Members button. Closed at launch.
- When the keyboard opens, the composer stays visible above it
  (`KeyboardAvoidingView`, as `LoginScreen.tsx` already does).

Use `react-native-gesture-handler` + `react-native-reanimated` (both are
Expo-supported; add via `npx expo install`), or React Navigation's drawer
navigator — 06 §1 pins React Navigation v7, which is currently **not installed**
(an undocumented deviation). If you use something else, write a Decision Record
in `docs/decisions/` explaining why, before writing the code.

**The existing acceptance criterion is too weak to catch this** — "Maestro walks
all four surfaces" passes precisely *because* everything is crammed on screen.
Strengthen it. Update `apps/mobile/e2e/flows/p1-01-devlogin-shell.yaml` to assert:
1. At launch, the channel drawer and members drawer are **not** visible.
2. The chat pane is visible and dominant.
3. Swiping/tapping opens the left drawer, and the channel list becomes visible.
4. Selecting a channel closes the drawer and shows that channel's messages.
5. Opening the right drawer shows members.

**Done when:** that flow passes, `devctl screenshot --screen p3-shell` produces
a PNG you have actually looked at, and the chat pane fills the screen in it.

## Tasks 2..N — Phase 3, then Phase 4

Work the numbered items in `specs/12-PHASE3-SERVERS.md` in order, then
`specs/13-PHASE4-SOCIAL.md`. One work item per commit.

For each work item:
1. Read the FRs it names in `specs/01-REQUIREMENTS.md`, including the
   **acceptance criterion** column — that is your test oracle.
2. Build it.
3. Write tests carrying `// @satisfies FR-XXX-NNN`. Unit tests for pure logic;
   an E2E flow in `apps/mobile/e2e/flows/` for anything a user can see.
4. **Prove the test can fail**: break the assertion, run it, confirm it fails,
   restore it, confirm it passes. Paste both outputs. A test never seen failing
   is not evidence.
5. Rebuild, reinstall, run the flow on the emulator.
6. `./tools/devctl verify` — must pass all seven layers.
7. Commit as `[P3-0X] <imperative summary>` with `--no-verify`.
8. Append a short entry to `docs/LOG.md`: what you built, what you ran, what
   the output was.

## Stop conditions — halt and write `docs/escalations/E-<n>.md`

Stop and ask rather than pushing through, if:
- The same test fails 3 times and your fixes are guesses rather than a diagnosis.
- A change would require modifying `apps/api/src/auth/**` or `contracts/**`
  (auth and the wire contract are load-bearing and were expensive to get right).
- A characterization test in `apps/api/test/characterization/` fails. Those pin
  existing backend behavior. If one fails you have broken the web client. Do not
  edit the test to make it pass unless the spec work item explicitly says the
  behavior changes — and then say so in the commit message.
- The spec's acceptance criterion for an FR cannot fail (i.e. it would pass even
  if the feature were absent). Write the stronger criterion you would use, and
  ask before proceeding.

## Do not touch

- `apps/api/src/auth/**` and `contracts/**` — see stop conditions.
- `apps/web/**` — the reference web client, and the regression canary.
- The spec files in `specs/` — they are frozen. Deviations go in
  `docs/decisions/` as a Decision Record, not as a spec edit.
- `tools/devctl`, `tools/nfr/**` — the gates. If a gate is wrong, escalate;
  do not weaken it to go green.

## How to report when you stop

For each work item: the ID, what you built, the exact commands you ran, their
real output, the commit SHA (run `git log --oneline -1` and paste it — do not
write a SHA from memory), and anything you left undone.

If you did not run something, write "not run". That is a fine answer. Reporting
a test as passing when you did not run it is the one unrecoverable mistake here.
