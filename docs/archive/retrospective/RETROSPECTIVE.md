# OpenChat Mobile — Retrospective

Compiled 2026-07-28 from `origin/main..integration`. Hard numbers are computed
from git; qualitative findings come from 24 agents that each read a 24-commit
slice of history independently and reported without seeing each other's work.
Their raw reports are archived beside this file as `retro-batch-*.md`.

---

## 1. Scope

| | |
|---|---|
| Commits | **572** |
| Files changed | **700** |
| Lines | **+103,090 / −332** |
| Calendar span | 2026-07-20 → 2026-07-27 (8 days) |
| Deletions as % of changes | **0.32%** |

The deletion figure is the single most load-bearing number in this document.
Across 118 files under `apps/api`, 332 lines were removed and no individual file
lost more than two. The work is overwhelmingly additive, which is what made a
clean upstream PR possible at all.

`origin/main` has no `apps/mobile`. The entire client — 335 files, 53,843 lines —
is new surface.

---

## 2. Pace

### Commits per day

```
07-20    2  ▏
07-21   19  █▏
07-24    8  ▌
07-25  263  ████████████████████████
07-26  204  ██████████████████▌
07-27   76  ███████
```

Two thirds of the project landed in 48 hours (07-25 and 07-26).

### Working time vs elapsed time

| | |
|---|---|
| Elapsed span | 169.3 h |
| Active (gaps ≤45 min) | **31.6 h** |
| Idle (gaps >45 min) | 137.7 h |

**572 commits in 31.6 active hours ≈ 18 commits/hour sustained.**

### Commit cadence

| | |
|---|---|
| Median gap | **1.0 min** |
| p90 gap | 13.1 min |
| Longest gap | 4,058 min (2.8 days, 07-21 → 07-24) |

A one-minute median is not a human typing. It is parallel agent branches being
merged in bursts — the signature of the fan-out model. Twelve commits landed in
six minutes on 07-25; six feature commits landed inside 2.5 minutes across
mobile, backend and contracts simultaneously.

### Longest idle windows

| Gap | Window |
|---|---|
| 4,058 min | 07-21 23:54 → 07-24 19:32 |
| 1,045 min | 07-21 00:23 → 07-21 17:48 |
| 485 min | 07-27 00:53 → 07-27 08:58 |
| 356 min | 07-26 03:47 → 07-26 09:44 |
| 286 min | 07-25 03:30 → 07-25 08:16 |

The 485-minute window on 07-27 is the one the owner called out directly: the
session ended a turn with no agents running, so nothing carried the work forward
until a human returned. Task inertia — not a timer — is what keeps a fan-out
alive, and when the last task completes the whole system stops.

---

## 3. Where the work went

Files touched per area per day:

| Day | api | mobile | tools | docs | specs | contracts |
|---|---|---|---|---|---|---|
| 07-20 | 1 | 0 | 1 | 1 | 19 | 0 |
| 07-21 | 39 | 4 | 40 | 36 | 8 | 9 |
| 07-24 | 20 | 42 | 36 | 10 | 4 | 2 |
| 07-25 | 164 | **495** | 43 | 55 | 0 | 21 |
| 07-26 | 34 | **326** | 52 | 44 | 0 | 3 |
| 07-27 | 14 | 73 | 11 | 22 | 2 | 2 |

The shape is deliberate: specs first (07-20), then contracts and API
(07-21/24), then the client at volume (07-25/26), then verification and
hardening (07-27).

**`tools/` was touched every single day.** 10,234 lines of harness — device
runners, provisioning, trace gates, night-watch. Roughly one line of test
infrastructure for every five lines of product code.

---

## 4. Commit mix

| Type | Count |
|---|---|
| fix | 101 |
| feat | 62 |
| wip | 43 |
| docs | 40 |
| chore | 22 |
| test | 11 |

| | |
|---|---|
| Merge commits | **160** |
| Reverts | **2** |
| WIP/salvage commits | 43 |

**Fixes outnumber features 101 to 62.** Two readings: the codebase demanded
heavy repair, or defects were being found and recorded rather than shipped. The
qualitative reports support the second — most `fix:` commits repair *harness and
tooling*, not product behaviour.

160 merges against 2 reverts is the number that best describes the working
model: many short-lived agent branches, gated before merge, almost never backed
out. The gate caught problems *before* they landed rather than after.

43 WIP/salvage commits are the cost of step caps — see below.

---

## 5. What went well

**Branch-per-agent with a human merge gate.** Every agent worked in an isolated
worktree; merges were performed by the architect after running gates. Merge
commits record their evidence inline — *"tsc 0, lint 0, 19 suites / 233 tests"*.
The 160:2 merge-to-revert ratio is the result.

**Perturb-and-restore as the standard for trusting a test.** The most-cited
practice across all 24 reports (25 mentions). Break the implementation, watch the
test go red, restore, watch it go green. It caught, among others, a set of
notification tests that passed while the feature was entirely disconnected.

**Agent output verified rather than trusted.** Recorded repeatedly in commit
bodies — *"Verified before merge, not taken on the agent's word."* Agents were
caught claiming success they had not achieved, and on at least two occasions an
agent was more careful than the architect: one stopped to flag that a rename's
blast radius included a contract file the architect's own survey had missed.

**Failures written into the permanent record.** Commit messages state what broke
and what it cost. This retrospective was possible in minutes precisely because
that discipline existed — the history is self-documenting rather than requiring
reconstruction from diffs.

**Deliberate "NOT PROVEN" annotations.** Code and tests carry explicit markers
where evidence is absent rather than implying coverage that does not exist.

---

## 6. Pain points

Ranked by how many independent readers flagged them.

### 6.1 Step caps — 36 mentions

The single largest source of waste. Agents hit their budget mid-edit and exit
having committed nothing, leaving a working tree that looks like progress but
carries no verification. This produced all 43 WIP/salvage commits. One report
records *"four agents lost work to step caps"* in a single wave.

**Mitigation that worked:** narrower work orders. Agents given one requirement
finished; agents given seven did not.

### 6.2 Vacuous tests — 15 mentions

Tests that pass whether or not the feature works. Found repeatedly, including
notification tests that passed with the WS-to-notification bridge entirely
removed, and 27 `@satisfies` annotations pointing at six requirement IDs that
were never written down.

**Only perturb-and-restore reliably detected these.** A green suite proved
nothing.

### 6.3 Silent degradation — 7 mentions, and the most expensive class

Every one of these reported success while doing nothing:

- `NoopPushTransport` — push notifications were structurally incapable of working
  for the entire project; the transport logged politely and dropped everything.
  FR-NOTIF-001..004 were marked complete.
- `api.cache(true)` in `babel.config.js` — froze `EXPO_PUBLIC_*` from the first
  build, so every physical-device APK dialled an unroutable address. Rebuilding
  "with" a new host changed nothing.
- `provision_world` sourcing shell values — a server name containing a space was
  truncated to its first word, silently corrupting seeded worlds and producing
  false E2E failures at scale.
- The trace gate exiting 0 while reporting violations, because enforcement lived
  behind a subcommand nobody invoked.

**The pattern: a component degrades quietly by design, and nothing distinguishes
"working" from "disabled."** Every one was found by a human looking at a device
or reading output, never by a test.

### 6.4 Built but unreachable — 7 mentions

Code that exists, is tested, and has no consumer. `markdown.ts` and `unread.ts`
shipped with zero call sites. An attachment tray was built and unreachable. The
notification bridge landed untested. A dedicated `check-unreachable.sh` gate was
written in response and, as of this writing, still is not wired into anything
that runs.

### 6.5 Environment and portability — BSD vs GNU, 5 mentions

`sed`, `grep` and `timeout` behaving differently on macOS silently produced wrong
results: `\?` treated literally, `\|` alternation unsupported, `timeout` absent
entirely. Compounded by `zsh` not word-splitting unquoted variables, which caused
loops to run once over a whole string instead of per item.

### 6.6 Exit codes through pipes

`cmd | tail` reports the pipe's status, not the command's. Produced at least four
false readings, including a build reported as successful that had failed.

---

## 7. The measurement crisis

The most important finding is not a defect. It is that **the instruments were
less trustworthy than the code they measured.**

On the final day the owner manually tested features the E2E suite reported as
broken. Of 14 reported failures, **13 were harness defects** — the blocked-users
tab existed, blocking worked, rename worked, invites worked, voice channel
creation worked. One was real: a missing error toast.

Four separate adjudications delivered with confidence were overturned by a human
looking at the device:

1. "7 voice defects" → 6 were emulator artifacts; voice works on hardware
2. "friends/singles failures" → features work, flows were wrong
3. "voice-pill persists after disconnect" → a 5px sliver mid-animation, invisible
4. "9 deterministic defects, 9/9 reproduced" → reproduced against corrupted worlds

**The one real bug found that day came from the owner watching two UI indicators
disagree** — a mute button and a mute badge backed by different state. No
assertion on a testID could have caught it, because the button was correct.

---

## 8. Economics

Precise token spend is not recoverable from git. What history does show:

- Roughly **one line of test/tooling infrastructure per five lines of product code**
- **43 WIP commits** representing agent budget spent with nothing committed
- **101 fixes vs 62 features** — most repair effort went to harness, not product
- **31.6 active hours** produced 103k lines across 8 calendar days

The clearest economic lesson: **a wasted agent run costs more than its tokens.**
A step-capped agent leaves a plausible-looking working tree that must be reviewed
and usually redone. A vacuous test costs more than no test, because it is
believed. The expensive failures were all cases where the system reported
success.

---

## 9. Carried forward

**Working practices to keep**
- Perturb-and-restore before trusting any test
- Branch-per-agent, human-gated merges, evidence quoted in the merge commit
- Record failure costs in commit messages
- One requirement per agent, never seven
- Human eyes on a real device before any UI claim

**Recurring hazards**
- Anything that degrades silently must be made to announce itself loudly
- A gate that is not wired into a command that runs is not a gate
- Green tests are not evidence; a test never seen failing proves nothing
- Emulators cannot test voice — `adb reverse` is TCP, WebRTC media is UDP
- Read exit codes directly, never through a pipe

**Open at time of writing**
- 12 evidence-type violations, 17 requirements lacking `@satisfies`
- E2E suite reliability — the false-failure rate makes it unusable as evidence
- `SOUND-SCOPE`: six endpoints with no requirement behind them
- Phases 1–3 signoffs NOT GRANTED
- `check-unreachable.sh` still not wired to anything
