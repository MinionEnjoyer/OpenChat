# Priorities — set by the project owner, 2026-07-25

This is the authoritative ordering. It overrides the spec's phase sequencing where the
two conflict, **except** that phase signoff gates still apply to work already done.

## 1. All features implemented at a basic level, Android only

Breadth over depth. A feature that works simply and is proven counts; a feature that is
polished but partial does not. **Android only** — do not spend effort on iOS (see §5).

Remaining as of 2026-07-25 (27 of 74 FRs):

| Block | FRs | Notes |
|---|---|---|
| Social | FR-SOC-001..007 | friends, DMs, group DMs, presence, profiles, blocking — biggest perceived gap |
| Voice | FR-VOX-001..007, 060 | LiveKit; needs a two-device rig working first |
| Media | FR-MED-001, 010, 011, 020, 030 | attachments, inline images, avatars; needs OpenShare wired |
| Push | FR-NOTIF-001..004 | device registry + dispatch worker; needs FCM credentials |
| Odds | FR-AUTH-007, FR-ROLE-007, FR-SRV-010 | presence picker, @role mentions, announcement channels |

Recommended order: **Social → Media → Voice**. Social is the largest gap in perceived
completeness and parallelizes across ~4 agents. Voice last because it needs two devices.

## DEFERRED — FR-VOX-060 (watch party): do NOT implement before the upstream merge

Owner's decision, 2026-07-25: **watch party has recent changes in upstream mainline.**
Implementing it here first would build against a spec upstream has already moved, creating
divergence that priority 2 would then have to unpick — the exact reconciliation cost the
"upstream contracts win" rule exists to avoid.

Consequences, so nobody re-derives this:

- FR-VOX-060 is NOT part of "priority 1 complete". Priority 1 is satisfied by
  FR-VOX-001..007 plus the rest; VOX-060 is explicitly out of scope until after §2.
- Do not dispatch an agent for FR-VOX-060. If one is proposed, this is why it was declined.
- After the upstream merge, take upstream's watch-party design/implementation as the base
  rather than porting anything written here.
- It is P2 with a manual-validation criterion, so nothing else depends on it.

## Standing rule — E2E flows are part of DONE, not a separate phase

Learned the expensive way, 2026-07-25: this project reached 69 implemented FRs with only
4 Maestro flows, all stopping at Phase 2. Phases 3-8 had ZERO E2E coverage.

That gap hid a real bug. FR-VOX-001 "join/leave voice channel" was fully built and
unit-tested, but the channel list was never wired to call join() — tapping a voice channel
did nothing. 706 unit tests passed, because every component was individually correct. No
test asserted the SEAM between them.

Root cause was in the work orders, not the agents: every order required unit + integration
tests, tsc, eslint, jest, codegen — and never required an E2E flow. Device/E2E work had
been designated architect-only, so agents could not write flows and the architect did not.

Rules going forward:

- **Any FR with a user-visible surface ships with a Maestro flow.** State it in the work
  order alongside the unit-test requirement. Agents CAN write flows — they select by
  testID and need no device to author them.
- **Adding a missing testID is a legitimate minimal source change**, not scope creep.
- **A flow must assert an OUTCOME** ("the thing I created is listed", "the message is
  visible after relaunch"), not merely that the screen rendered. And it must be proven
  able to fail, same as any other test.
- **Unit tests verify components; E2E verifies that features are REACHABLE.** A feature
  that is built, correct, and unwired passes every unit test in the suite.

## 1a. Milestone sign-offs — GATE between priority 1 and priority 2

Owner's instruction: sign off the phases already worked on **after priority 1 completes**
and **after a merge plan exists**, but **BEFORE the merge is actually conducted**.

Sequence, strictly:

1. Priority 1 done — all remaining FRs implemented at a basic level on Android.
2. Produce the upstream **divergence report + merge plan** (see §2). Planning only.
3. **T4 sign-offs for Phases 1, 2 and 3.** Only Phase 0 is signed off today
   (`docs/signoffs/`). Each needs: full gate on the merged result, device verification,
   the T4 judgment gates, DRIFT-LOG triage, and any open escalation surfaced to the owner
   (E-01 is open and needs a decision).
4. **Only then** execute the upstream merge.

Rationale: signing off before the merge means the fork's own state is a known-good,
attributable baseline. If sign-off happened after, a defect could never be cleanly
attributed to our work versus the reconciliation.

## 2. Merge with the upstream MinionEnjoyer/OpenChat branch

Honor the **upstream API contracts**. Where this fork diverged, upstream wins by default.

Where our change is genuinely better, do NOT silently keep it — collect it into a proposal
to discuss with the upstream author. Candidates so far live in `docs/DRIFT-LOG.md`
(e.g. the granular guild events in FR-SRV-009, the nonce echo fix, permission overwrites).

Before any merge work: diff our `contracts/` against upstream and produce a written
divergence report. Do not begin reconciling until that report exists.

## 3. UI fit and finish

Explicitly AFTER feature breadth. Do not let polish work preempt priority 1.

## 4. Restructure — split the frontends from each other and from the backend

Target separation: `openchat-backend`, `openchat-webui`, `openchat-rn`, `openchat-desktop`.
This is a large structural change; it must not start before 1 and 2 are settled, since it
would rewrite every path referenced by in-flight work.

## 5. iOS — undecided

Currently: no Xcode project, Xcode not installed, no iOS lane at all. **Do not invest here**
until the owner decides. Flag any spec requirement that assumes iOS as blocked-by-decision
rather than attempting it.

---

## Standing constraint on how the work gets done

The architect does NOT write product code. Agents write code and unit tests; the architect
writes work orders, runs gates, adjudicates, and merges. See
`~/workspace/workflows/codewhale-fanout/` for the operating method, verification model, and
the trap list. Keep the fleet saturated — an idle fleet is the main failure mode.

## Note from Will the human

I want to make something clear. Your bandwidth is highly constrained, your limits are miniscule, and the deepseek agents are effectively free. The price difference is on the order of 50x. We want to use the deepseek agents for everything they can possibly be used for, and use you for only what is absolutely necesarry. Loading a uiautomator dump into context and analyzing it is a monumental waste of tokens, looking at a screenshot makes more sense.


I want you to really drill in how important delegation is. the cost per task on the artificial analysis index for deepseek is $0.04 while yours is north of $2. You are right alot, but Deepseek can iterate and brute force. limit your tokens and go fucking nuts with subagents. I honestly don't care if you spin up 20-30 at a time I want to maximize the ratio of subagent tokens to your tokens used per task while delivering results. 
## Soundboard — owner directive, 2026-07-26

**Mandatory feature.** Not currently in specs/15-PHASE6-VOICE.md (no P6-* item) — treat this
directive as the spec.

**Behaviour:** playing a sound **publishes it into the LiveKit room** so other participants
hear it, and it also plays locally for the person who triggered it. Not local-only.

**Implementation:** port upstream's contract exactly (origin/main has a complete one —
`GET/POST/PATCH /servers/:id/sounds` in servers.controller.ts, plus apps/web
Soundboard.tsx / SoundRecorder.tsx and a server_sounds migration). Our schema already has
the ServerSound model; endpoints and UI are missing. Upstream contracts win per §2, so do
not invent a different shape — divergence here becomes merge cost later.

If upstream's playback differs from the behaviour above, the owner's directive governs the
BEHAVIOUR and upstream governs the CONTRACT; report any conflict rather than silently
choosing.

## Out of scope for mobile — push-to-talk

Owner decision, 2026-07-26: **PTT is out of scope for mobile.**

Upstream's web client HAS it (`apps/web/src/lib/useVoice.ts` — input modes, `pttHeldRef`,
`saveAudioPrefs({ inputMode })`). Anyone porting upstream's voice UI will encounter it and
should deliberately SKIP it rather than assume it belongs.

Voice input on mobile is open-mic with mute; no push-to-talk affordance, no input-mode
preference. If a port includes PTT, strip it.
