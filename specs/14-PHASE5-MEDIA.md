# 14 — PHASE 5: Media & Attachments (closes G2 + G3)

Goal: mobile users can attach, view, and share media with full fidelity, without OpenShare
session cookies, while the web client's cookie path keeps working untouched.
FRs: MED-001..030, AUTH-006 completion, MSG-013 Share-embed completion.

Out of scope: OpenShare's HTML viewers on mobile (native viewers instead; "Open in Share"
link is fine) · folder management UI · 3D model rendering (generic file row + open-in-Share).

## Backend work items

**P5-01 [BE·OpenShare] Service asset API** (FR-MED-001) — new module `service_api.py`:
- Auth: `Authorization: Bearer <SHARE_SERVICE_KEYS>` (new env, comma-separated; constant-time
  compare). Cookie routes untouched.
- `POST /api/assets` multipart `{file, source?}` → reuse the EXACT internal save path of
  `/upload` (extract shared function; dedup preserved) → 201
  `{id, filename, mimeType, size, mediaType, width?, height?, durationMs?, sha256}`.
- `GET /api/assets/{id}` → same metadata · `GET /api/assets/{id}/raw` and `/thumb` → bytes
  with `Content-Type`, ETag=sha256, `Accept-Ranges: bytes` + Range support (video seeking).
- Tests: pytest unit + provider contract tests (from `share-assets.yaml`) + regression:
  cookie `/upload` + `/raw` unchanged (OpenShare characterization from Phase 0).

**P5-02 [BE·OpenChat] Repoint `ShareService`** at the real API (`POST /api/assets` multipart
instead of the dead `upload-url` flow; keep the interface it exposes to Nest). Add:
- `POST /api/uploads` (auth'd; multipart up to N files; per-file limit from config env
  `UPLOAD_MAX_MB` default 100; mime allowlist mirroring OpenShare's) — streams through to
  Share (no buffering >8MB in memory), returns `[{shareAssetId, filename, mimeType, size,
  mediaType, url, thumbnailUrl, width?, height?}]` where `url`/`thumbnailUrl` are **proxy
  URLs** (below) — same array shape the web's `uploadToShare` produces so `POST messages`
  accepts it unchanged (FR-MED-002; byte-compare shape in integration test).
- `GET /api/media/:assetId/raw|thumb` (auth'd): proxies Share with service key, forwards
  Range/ETag/Content-Type, adds `Cache-Control: private, max-age=86400` (FR-MED-003).
- URL policy (contract `x-media-urls`): server stores whatever the client sent (web keeps
  absolute Share URLs); message serializer adds computed `proxyUrl`/`proxyThumbnailUrl` per
  attachment so BOTH clients render from one source of truth; mobile always uses proxy
  fields. Characterization: existing message payloads gain fields only (additive).
- Tests: integration mobile-shaped upload → message renders on WEB client (Playwright smoke
  step) and on mobile; Range request test on a seeded video; 401 without auth.

## Mobile work items

**P5-03 Attachment composer** — picker (library/camera/files), multi-select ≤10, thumbnails
in composer tray, per-file progress (uploads run before send; message sends when all
complete or user removes failures), cancel, client compression per FR-MED-030 with
"original" toggle (FR-MED-010). E2E `p5-01-attach-photos` with `adb emu` injected images;
unit: compression dimensions; integration: 10-file boundary + oversize rejection toast.

**P5-04 Media rendering** — image grid layouts (1/2/3/4+ like Discord), tap → fullscreen
gallery (pinch zoom, swipe, save-to-device, share sheet), inline video player (poster=thumb,
tap-to-play, fullscreen), audio row player, generic file chip (name/size/open-in-Share
browser) (FR-MED-011). Snapshot per media type from seeded fixtures; Maestro gallery flow;
NFR-02 re-baseline with media-heavy channel fixture.

**P5-05 Avatars & server icons** — crop-square upload via `POST /uploads` → `PATCH /me
avatarUrl` / `PATCH servers/:id` with proxy URL (verify web's stored-URL convention Phase 0
and match it) (FR-MED-020, AUTH-006 complete). Two-device E2E avatar propagation.

**P5-06 Share embeds** — Share links in message content render rich cards via
`GET /api/assets/{id}` metadata through a new `GET /api/media/:id/meta` proxy (add in
P5-02) completing FR-MSG-013's Share branch.

**P5-07 Audit & refactor + signoff.** Demo: phone camera photo → appears on web with thumb →
web uploads file → phone renders + gallery + save → avatar change both directions → video
seek. Gates: standard + OpenShare pytest/contract suites now in CI + web-smoke extended
with one upload step + trace check.
