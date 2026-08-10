tool: File (path: /tmp/retro/batches/batch-av.md)
tool File completed: [Exact evidence retained · 11 KB · inspect with `retrieve_tool_result ref=art_call_00_Yu62xPgp3urNDeamX3011248`]

<file path="/tmp/retro/batches/batch-av.md" total_lines="330" shown_lines="1-200" truncated="true" next_start_line="201">
     1│ ### 2026-07-27T00:46:21-07:00 — e2e: add p1-auth-006b...
tool: File (path: /tmp/retro/batches/batch-av.md)
tool File completed: [Exact evidence retained · 7 KB · inspect with `retrieve_tool_result ref=art_call_00_62ao8srxP89EnBA0ToiZ8394`]

<file path="/tmp/retro/batches/batch-av.md" total_lines="330" shown_lines="201-330" truncated="false">
   201│ ---
   202│ 
   203│ ### 2026-07-27T00:50:44-07:00 — wip: salvaged from s...
## WINDOW
First: `2026-07-27T00:46:21-07:00` ("e2e: add p1-auth-006b-profile-verify")
Last: `2026-07-27T00:51:49-07:00` ("Merge branch 'e2e-msga'")
Span: **5 minutes 28 seconds**, single calendar day.

## WHAT WAS BUILT

1. **E2E flow suite for messaging (FR-MSG-001–015).** Seven single-device flows: list-load, send, edit, delete, copy-text, channel-list/unread, and error-toast. Two two-device flow pairs: typing propagation (FR-MSG-009) and pin cross-device sync (FR-MSG-011). Plus a finding on FR-MSG-005: the reply trigger is not wired in the mobile action sheet, so the reply flow file is a template only.

2. **Multi-actor server-management E2E flows (FR-SRV-006, FR-SRV-008).** Invite-accept flow: owner creates invite, fresh invitee accepts via code entry, verifies server appears in rail. Kick-lose-access flow: owner kicks friend, verifies member-list removal, then clears state and logs in as the kicked user to prove server-gone from rail. Both use single-device `runScript` provisioning.

3. **Opt-in PKCE for desktop auth.** Server-side opt-in branch in `AuthController.desktopLogin` with 12 new tests (7 unit, 5 characterization), plus an upstream proposal document (`docs/AUTH-PKCE-PROPOSAL.md`). ApiToken model left untouched. 577 lines added.

4. **Mobile role-assignment UI (FR-ROLE-001).** Role toggle switches in `MemberProfileSheet`, gated on `MANAGE_ROLES` permission, with `useAssignRole`/`useUnassignRole` hooks, structural tests, invalidation tests, and an E2E Maestro flow. Preceded by a fix adding three missing `PERMISSION_LIST` entries (`BAN_MEMBERS`, `SEND_MESSAGES`, `READ_MESSAGES`) to the web permissions module and two missing mobile strings.

5. **Soundboard React Native mock.** Merged branch `sb-mock`: `SoundboardPanel` component with 245-line test file, `VoiceChannelView` wiring, `publishSeam` module, new UI strings, OpenAPI contract extension, and a 320-line spike document.

6. **Shared E2E infrastructure.** `_login_friend.yaml` shared subflow (mirror of `_login.yaml` for the friend user); `app-error-toast.yaml` flow for FR-APP-006 (Zod 400 → toast + retry testIDs); and `p1-auth-006b-profile-verify.yaml` for the device-B half of display-name verification.

## FAILURES AND THEIR COST

**No explicit cost figures are stated in this slice.** No commit in this window uses language like "hours lost," "runs invalidated," "tests faked," or "incidents." The failures named are narrative, not quantified:

- **Reply trigger not wired (FR-MSG-005).** "The reply trigger is not wired in the mobile UI action sheet. setReplyTarget(msg) is never called from any user-interaction path." Severity: blocks FR-MSG-005 E2E acceptance. The flow file "includes a TEMPLATE for when the reply action is wired." No cost figure.

- **Missing PERMISSION_LIST entries (FR-ROLE-001).** Web `permissions.ts` was missing `BAN_MEMBERS`, `SEND_MESSAGES`, `READ_MESSAGES`; mobile was missing `members.roleLabel` and `members.roleToggleFailed` strings. Fixed in the same window. No cost figure.

- **Two step-capped agents — work salvaged.** Two commits tagged `wip: salvaged from step-capped agent (unverified)` — one containing `queryClient.guildEvents` (473 lines of test + implementation), the other containing `artifacts/trace/matrix.json` (+2599/−193 lines). The agents hit step caps and could not complete verification; their output was committed raw as unverified salvage. No cost figure in hours or lost cycles, but the commits are explicitly labeled "unverified."

- **Seeded-data insufficiency (FR-MSG-001 pre-check).** "Test-world seeds only 3 messages — insufficient" for the 1000-message pagination boundary required by FR-MSG-001. `@satisfies` withheld. No cost figure.

## RECURRING THEMES

- **"UNVERIFIED — pending device run."** Present in 18 of 24 commits. Every E2E flow, every two-device pair, and both salvaged-agent commits carry this tag. Zero flows in this slice were run against a device.

- **"@satisfies deliberately WITHHELD."** Five flows defer satisfaction claims: msg-001 (needs 1000-msg seeding), msg-005 (reply trigger not wired), msg-typing (needs two-device coordination), msg-pins-cross-device (needs two-device coordination), msg-unread (needs second session for ReadState round-trip).

- **Two-device gap acknowledged, flows authored anyway.** Three single-device messaging flows (send, edit, delete) explicitly note "AC gap: two-device propagation ≤2s not covered." Two-device flows (typing, pins) are authored as paired A/B YAML files but remain unrun. The gap is consistently documented rather than ignored.

- **"Salvaged" as a category of commit.** Two commits carry the `wip: salvaged from step-capped agent` tag. The same `queryClient.guildEvents` change appears twice — once as a direct wip commit and again inside the `srv009-wire` merge — suggesting the merge captured the same salvaged content.

## PROCESS SIGNALS

- **Agent fan-out with branch merges.** Four merge commits in this 5.5-minute window: `sb-mock`, `e2e-auth`, `e2e-msga`, `srv009-wire`. Each merges work authored in parallel branches.

- **Step-capped agent recovery.** Two agents exceeded their step budget mid-task. Their partially-complete output was committed as `wip` rather than discarded — evidence of a salvage policy.

- **Two-device flow pattern.** Paired `-A.yaml` / `-B.yaml` files with documented run order ("Run B first, then A concurrently on two devices sharing same test-world"). The pattern assumes two emulators or two physical devices hitting the same test-world.

- **Single-device multi-actor pattern.** FR-SRV-006 and FR-SRV-008 use `runScript` for server-side provisioning on a single device, then `clearAppState` / re-login to switch perspectives. Documented fallback: extend `tools/test-world.mjs`.

- **Shared subflow extraction.** `_login_friend.yaml` extracted as a reusable subflow mirroring `_login.yaml` but for the friend user — DRY for two-device flows.

- **Merge density.** 24 commits in 328 seconds = one commit every ~14 seconds on average. The first 8 E2E flow commits (00:46:21–00:48:51) land at ~19-second intervals; then a 1.5-minute pause before the merge cluster at 00:50:20–00:50:45.

## PACE

- **Commits:** 24 (including 4 merges).
- **Distinct calendar days:** 1 (2026-07-27).
- **Bursts:** One continuous burst across the entire 5:28 window. Sub-bursts visible: eight single-device E2E flows in 2:30 (00:46:21–00:48:51, ~19s/commit), then a merge-and-salvage cluster of six commits in 25 seconds (00:50:20–00:50:45), then a steady rollout of FR-ROLE-001 fixes and final E2E flows (00:51:09–00:51:49).
- **Gaps:** None within the window.
