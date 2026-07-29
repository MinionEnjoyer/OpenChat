# P0-04 Verification — Independent Audit

**Date:** 2026-07-21
**Verifier:** Separate session (not the remediation author)
**Commit under test:** `0b86397` (`[P0-04] remediation v2`)
**Disposition:** RETURN

---

## 1. Mutation Matrix — Re-executed Independently

All five mutations applied via the bind-mount workflow (`sed`/`python3` on host →
`nest --watch` hot-reload in container) without rebuilds. Observed output confirmed
against the claims in sections §2–§5 of the remediation report.

| # | Mutation | Verdict | Observed Failure |
|---|----------|---------|-----------------|
| 1 | `@HttpCode(200)` on `POST /auth/dev-login` | **CAUGHT — REPRODUCES** | `Expected: 201, Received: 200` — 2/2 dev-login tests fail exactly as claimed |
| 2 | `thumbnailUrl` → `thumbUrl` in `serializeMessage` | **CAUGHT — REPRODUCES** | `messages — list › message with attachment — exercises assertAttachmentShape`: `expect(received).toBeDefined()`, `Received: undefined` — the renamed field causes the attachment message to be unretrievable |
| 3 | `extraSpyField: "HELLO_WORLD"` in `serializeMessage` return | **CAUGHT — COMPILE-TIME** | TS build error: `Object literal may only specify known properties, and 'extraSpyField' does not exist in type 'MessageWithRelations'`. `nest --watch` refuses to restart. This is caught at the build gate (TypeScript type-check), not at the runtime assertion layer. The remediation report claims `assertExactKeys` would catch it — this is true but the assertion layer is never reached because the code won't compile. **A build failure is a catch, but the claim of "assertion code verifies correct" is unobservable without bypassing the type-check.** |
| 4 | `orderBy: 'desc'` → `'asc'` | **CAUGHT — REPRODUCES** | `messages — list › lists messages newest-first`: `expect(received).toBeGreaterThanOrEqual(expected)` — actual timestamp older than expected, ordering violation |
| 5 | `BigInt.toString()` → `Number(…) as any` in `PERMISSION_LIST` | **CAUGHT — REPRODUCES** | `roles — list includes permission catalog`: `Expected: "string", Received: "number"` at `assertBigIntString` → `assertPermissionShape` |

**MUT1, MUT2, MUT4, MUT5 each produce observed runtime output naming the fault exactly as claimed.**
MUT3 is caught at the TypeScript compilation gate, not the runtime assertion gate — a valid catch, but the
remediation report's parenthetical "(build failure, assertion code verifies correct)" is misleading because
the runtime assertion path was never exercised.

---

## 2. Attachment Fixture Fidelity (MUT2 vs E9 Observation)

The remediation report references `contracts/x-attachment-shape.yaml` — **this file does not exist.**
The `contracts/` directory is empty (zero files). Comparison performed against the verbatim E9
observation at `docs/capabilities/experiment-outputs/E9.txt:28`.

### E9 observation (verbatim, from `POST /api/channels/…/messages (with attachments)`):
```json
{
  "id": "872aa799-1a7b-4d04-a3e6-a334e19290ad",
  "messageId": "8e6e37d9-4cca-4f00-86f4-cbae48cdb34e",
  "shareAssetId": "test123",
  "filename": "test.png",
  "mimeType": "image/png",
  "size": "1024",
  "url": "https://placehold.co/600x400",
  "thumbnailUrl": "https://placehold.co/150x150",
  "width": 600,
  "height": 400,
  "durationMs": null
}
```

### Fixture shape (`helpers.ts:319`, `ATTACHMENT_KEYS`):
`['id', 'messageId', 'shareAssetId', 'filename', 'mimeType', 'size', 'url', 'thumbnailUrl', 'width', 'height', 'durationMs']`

### Field-by-field comparison:

| Field | E9 type | E9 example | Fixture type check | Match? |
|-------|---------|------------|-------------------|--------|
| `id` | string (UUID) | `872aa799-...` | `assertUuid` | ✓ |
| `messageId` | string (UUID) | `8e6e37d9-...` | `assertUuid` | ✓ |
| `shareAssetId` | string | `"test123"` | `typeof === 'string'` | ✓ |
| `filename` | string | `"test.png"` | `typeof === 'string'` | ✓ |
| `mimeType` | string | `"image/png"` | `typeof === 'string'` | ✓ |
| `size` | string (BigInt) | `"1024"` | `assertBigIntString` | ✓ |
| `url` | string | `"https://..."` | `typeof === 'string'` | ✓ |
| `thumbnailUrl` | string or null | `"https://..."` | `string \| null` | ✓ |
| `width` | number or null | `600` | `number \| null` | ✓ |
| `height` | number or null | `400` | `number \| null` | ✓ |
| `durationMs` | null | `null` | `number \| null` | ✓ |

**No divergence.** All 11 fields match in name, type, and nullability between the E9 observation
and the `assertAttachmentShape` assertion. The seed fixture sends values that pass through the
same API serialization path (not direct DB insertion), so the returned shape faithfully reflects
the real system's wire format.

### Note on contracts directory:
`contracts/x-attachment-shape.yaml` is referenced in the task instructions but does not exist.
The `contracts/` directory is empty. The comparison was performed against the E9 experiment output
as specified in the fallback instruction ("verbatim E9 observation").

---

## 3. Reproducibility from Clean Checkout

### DEV_AUTH=1 committed:
`docker-compose.dev.yml:102`: `DEV_AUTH: "1"` is present in the committed file on the OpenShare
service. This is not a local-only change.

### Bind mount committed:
`docker-compose.dev.yml:60`: `./apps/api/src:/app/src:ro` bind-mount volume is present in the
committed file.

### Baseline 84/84:
Executed `npx jest --config jest-char.config.js --forceExit` from `apps/api/` against the running
stack (with the bind mount providing the committed source). Result:
```
Test Suites: 11 passed, 11 total
Tests:       84 passed, 84 total
```
This confirms the suite passes from a checkout of commit `0b86397` with the stack running from
`docker compose -f docker-compose.dev.yml up`.

### E5 reproducibility note:
The task instructs: "Note whether E5's evidence would reproduce on this stack. If E5 ran against a
hand-modified environment, its outputs are not reproducible — flag for DRIFT-LOG, do not re-run E5."

E5 (`docs/capabilities/experiment-outputs/E5.json`) is an OpenShare upload experiment. The stack
now has `DEV_AUTH=1` committed, so the pre-requisite for E5 (dev-auth bypass) is met. However,
E5 was originally run against a hand-modified environment (per the DRIFT-LOG systemic entry:
`2026-07-20 — E5 downgraded to source inspection`). While E5 was subsequently re-executed per the
DRIFT-LOG, the exact environment of the re-execution is unclear. The E5 output file exists but
whether it was produced on the same committed stack configuration is not verifiable without re-running E5.
**Flagged for DRIFT-LOG as an observation, not a defect.**

---

## 4. Spot-Check — Coverage Table

Five assertion helpers selected from the 22-entry coverage table:

### 4.1 `assertChannelShape` — claimed at `servers.spec.ts:30`
**FINDING: NOT REACHED.** The assertion helper is imported at `servers.spec.ts:2` but is **never called**
in any test file. The `servers — list channels › lists (≥2)` test at `servers.spec.ts:63-67` only asserts
`expect(res.body.length).toBeGreaterThanOrEqual(2)` — it does not iterate channels or call
`assertChannelShape`. The coverage table line number `servers.spec.ts:30` is incorrect; that line
is inside the `servers — get` block (`it('returns detail (200)'...)`) which calls `assertServerShape`,
not `assertChannelShape`.

This contradicts the remediation report's claim: "Zero unreachable assertions. Every helper is
exercised by at least one test." **assertChannelShape is defined but never exercised.**

### 4.2 `assertInvitePreviewShape` — claimed at `invites.spec.ts:19`
Verified. `invites.spec.ts:19`: calls `assertInvitePreviewShape(res.body)` after a `GET /invites/:code`
request that returns a populated invite preview with `server` and `inviter` sub-objects. ✓

### 4.3 `assertWsReadyDataShape` — claimed at `ws.spec.ts`
Verified. `ws.spec.ts` calls `assertWsReadyDataShape(client.frames[0].d)` on the WebSocket `ready`
frame data, which contains `{user, servers}` with populated sub-objects. ✓

### 4.4 `assert401Shape` — claimed at `auth.spec.ts:87`
Verified. `auth.spec.ts:133`: calls `assert401Shape(res.body)` inside the `401 matrix` describe block
(`GET /auth/me → 401 without cookie`). Confirmed: `res.body` is `{message, error, statusCode}` from
API response. ✓

### 4.5 `assertSoundShape` — claimed at `servers.spec.ts:81`
**FINDING: Line number is wrong, but helper IS reached.** `servers.spec.ts:130` (not 81) calls
`assertSoundShape(add.body)` after a `POST /servers/:id/sounds` that creates a sound record.
The response body is non-null and populated. The function is genuinely exercised, but the coverage
table's line number is incorrect — line 81 is inside the `servers — channels reorder` describe block,
not the `servers — sounds` describe block at line 124. ✓ (reached; line number erroneous)

### Spot-check summary:
- 3/5 definitively reachable (`assertInvitePreviewShape`, `assertWsReadyDataShape`, `assert401Shape`)
- 1/5 reached but at wrong line number (`assertSoundShape`)
- **1/5 NOT REACHED** (`assertChannelShape` — imported, never called)

---

## 5. Systemic Rule Confirmation

### 05 §5.1
`specs/05-AGENT-OPERATIONS.md:78-85` — Rule 5.1 is present, committed, and worded as an
enforceable check:
> INCONCLUSIVE IS NOT A TERMINAL STATE. Any pre-registered check, mutation, or experiment
> that cannot be executed has exactly two valid dispositions: (a) the obstacle is removed
> and the check is executed, or (b) an escalation file is opened. Source inspection,
> "verified correct by reading", "caught by design", and "assertion logic confirms" are
> explicitly **forbidden** as evidence that a check passed.

The language is precise and enforceable. ✓

### T2 Q#10
`specs/templates/T2-AUDIT-CHECKLIST.md:31-34` — Question 10 is present, committed, and
worded as an enforceable check:
> Non-execution audit: List every check in this item that did not execute. For each,
> which of the two valid dispositions was taken (per 05 §5.1)?

Expected format with (a)/(b) dispositions. ✓

### DRIFT-LOG systemic entry
`docs/DRIFT-LOG.md:78-101` — Entry titled "Systemic: inconclusive treated as terminal
(three occurrences)" records all three instances (E5, MUT5 first pass, MUT1/2/5 remediation
pass) as one systemic line with one remedy, not three isolated entries. ✓

All three components of the systemic fix are committed and worded correctly. ✓

---

## Verdict: RETURN

### Minimum work required before re-submission:

1. **Fix `assertChannelShape` gap (MANDATORY):** Either:
   - (a) Add an `assertChannelShape` call to the `servers — list channels › lists (≥2)` test
     in `servers.spec.ts` (iterate returned channels), OR
   - (b) Remove `assertChannelShape` from the coverage table and acknowledge it as an
     unreachable helper with a backlog item.

   This is a factual error in the remediation report: "Zero unreachable assertions" is false.

2. **Fix coverage table line numbers (RECOMMENDED):** `assertSoundShape` is reached at
   `servers.spec.ts:130`, not `servers.spec.ts:81`. Correct the table.

3. **Clarify MUT3 catch mechanism (RECOMMENDED):** The remediation report claims MUT3 is
   caught by `assertExactKeys`, but the mutation never reaches the runtime assertion layer —
   it's caught by the TypeScript compiler. Note that this is a build-gate catch, not a
   runtime-assertion catch. The assertion code "verifying correct" is unobservable without
   bypassing the type system.

4. **E5 reproducibility flag (INFORMATIONAL):** The E5 output may not be reproducible on
   the committed stack configuration. Append a DRIFT-LOG entry noting this as an observation,
   not a defect requiring immediate action.

### What passes:
- 4/5 mutations caught with observed runtime output naming the fault; MUT3 caught at
  compile-time (valid catch, mechanism different from claim).
- Attachment fixture fidelity is correct — zero field-level divergence from E9 observation.
- DEV_AUTH=1 and bind mount are committed; suite passes 84/84.
- Systemic rule 05 §5.1, T2 Q#10, and DRIFT-LOG systemic entry all land correctly.
- 3/5 spot-checked helpers genuinely populate structures; 1 reaches at wrong line; 1 is
  unreachable.

### P0-05 gate status:
P0-05 may NOT begin until the `assertChannelShape` gap is resolved (item 1). The other
findings do not block P0-05.