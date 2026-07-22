# DR-001 — Attachment read authorization model

Date: 2026-07-20 · Work item: P0-03 (E5/E10/E11 correction) · Status: **proposed**

## Trigger
Phase-0 falsification (00 §0.2.7 trigger: "Phase-0 experiment falsifies stated assumption"). E5 and E10 established that OpenShare `/raw` and `/thumb` endpoints are **public** — no authentication required to read any asset if you know its ID. The G3 gap statement in 00 §0.3 was incorrect in claiming reads were blocked; only uploads are blocked.

E11 established that asset IDs are 8 random characters from a 62-char alphabet (47 bits of entropy, CSPRNG), making for 0/10 hits on adjacent-ID probing.

## Decision
PENDING HUMAN RULING. The attachment read model must be chosen from the options below before Phase 5 begins. Until then, no code modifying `/raw` or `/thumb` auth behavior shall be written.

## Options considered

| Option | Description | Cost | Risk | Evidence |
|--------|-------------|------|------|----------|
| **A: Public reads (unguessable-URL)** | Keep `/raw` and `/thumb` public. Mobile renders them directly without proxy. Media proxy serves metadata only (content-type, dimensions, filename) so the message serializer can populate `url`/`thumbnailUrl` with Share public URLs + proxy `metaUrl`. | Phase 5 shrinks significantly: P5-02 and P5-04 are metadata-only; no raw/thumb bytes flow through OpenChat. Mobile makes direct HTTP requests to Share. | Any user who learns an asset ID (e.g. from a DM message payload visible in their own client) can retrieve the raw file. 47-bit ID space means brute-forcing is infeasible but targeted ID extraction is trivial. DM attachments are available to DM recipients via the message payload anyway; the threat is if IDs leak outside the DM (logs, screenshots, link sharing). | E11 (0/10 adjacent-ID hits), E5 (public `/raw` confirmed), source: `secrets.choice(62-chars, 8)` |
| **B: Proxy-only reads** | Lock `/raw` and `/thumb` behind session-or-service auth. OpenChat media proxy passes bytes through. | **BREAKING** for web client — web currently loads Share `/raw` URLs directly. Requires a web-side characterization update ritual per 02 §P0-04 before Phase 5 work begins. Phase 5 grows: pass-through proxy for every attachment render on both clients. | Zero risk of unauthorized reads. Cost is engineering time + regression risk on web. | Source code inspection shows web DOM referencing Share `/raw` URLs directly. |
| **C: Signed URLs from OpenShare** | OpenShare issues time-limited HMAC-signed URLs (`/raw/{id}?expires=&sig=`). OpenChat requests signed URLs via service API and populates them as the `url`/`thumbnailUrl` fields. Legacy `/raw` path retained for web until web migration. | Middle cost: new `/api/assets/{id}/signed-url` endpoint in Share; OpenChat calls it when serializing messages. Web migrates at its own pace (legacy public path remains until then). | Signed URLs expire — long-lived message renders need refresh logic. Token validity window must be generous enough for scrolling message history (hours, not seconds). Key management overhead. | Similar patterns in S3 presigned URLs, Discord CDN. |

## Consequences
- **If Option A**: FR-MED-003 narrows to metadata-only proxy. Phase 5 scope shrinks by ~30% (no byte-proxy for reads). E11's 47-bit entropy finding is the security justification.
- **If Option B**: Phase 5 grows. Web characterization must be re-baselined first. Requires a `docs/decisions/DR-00X-web-read-migration.md` companion DR.
- **If Option C**: `contracts/share-assets.yaml` grows a `POST /api/assets/{id}/signed-url` entry. Legacy path must be preserved per 00 §0.2.10 (backward compatibility).

## Affected specs (marked PENDING DR-001)
- `14-PHASE5-MEDIA.md` — §P5-02, §P5-04 (read proxy scope)
- `01-REQUIREMENTS.md` — FR-MED-003 (media proxy requirement)
- `00-MASTER-SPEC.md` — §0.3 G3 (gap statement corrected; fix method pending)

## Recommendation
**Option A** if E11 entropy (47 bits) is accepted by the human as sufficient for an unguessable-URL model. Fallback: Option C if a time-bound access control is desired without breaking the web client. Option B is NOT recommended due to the web breakage and Phase 5 schedule impact.