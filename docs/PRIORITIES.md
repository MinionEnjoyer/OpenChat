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
