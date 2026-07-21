# 01 — REQUIREMENTS: Discord Parity Definition

Status: FROZEN v1.0. This file is the single authoritative definition of "feature parity to
Discord" for this project. Any behavior not traceable to an FR here is scope creep.
Change control: product owner edits only, recorded as a Decision Record.

## 1. OUT OF SCOPE (written first, binding)

The following are excluded from v1 regardless of how easy they look. Log ideas to
`docs/BACKLOG.md`; do not build them.

Nitro/monetization/boosts/shop · server discovery/community browsing · stage channels ·
forum channels · activities/embedded games · Go Live game streaming (viewing screenshare IS in
scope) · slash-command/bot application framework (rendering bot/webhook-authored messages IS
in scope) · stickers & sticker shop · soundboard on mobile beyond playback (P2 playback only) ·
AutoMod · scheduled events · vanity URLs · profile decorations/effects · message translation ·
Krisp-style ML noise suppression (LiveKit built-in audio processing only) · multi-account
switching · tablet/iPad-optimized layouts (must run, not be optimized) · offline-first full
history sync (bounded cache only, NFR-05) · end-to-end encryption · federation ·
Windows/macOS/web builds of the RN app · watch-party hosting from mobile (joining/viewing is
P2, FR-VOX-060).

## 2. Parity tiers

- **P0 — Parity MVP**: an active Discord user can move their community's daily text+social
  life to the app without noticing missing table stakes.
- **P1 — Standard parity**: voice, media, moderation, notifications — the full daily driver.
- **P2 — Extended**: build only when every P0+P1 FR is green and traced.

## 3. Functional requirements

Format: ID · Requirement (client behavior unless prefixed [BE]=backend work required) ·
Acceptance criterion (the test oracle — deterministic where possible) · Priority · Phase.

### AUTH — Identity & session
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-AUTH-001 | [BE] Native OIDC login: system-browser PKCE against Authentik, code exchanged at new `POST /api/auth/token` for bearer access+refresh tokens | E2E: fresh install → login → `GET /api/auth/me` 200 with bearer; no cookies used | P0 | 1 |
| FR-AUTH-002 | [BE] Token refresh with rotation; revoked/reused refresh token is rejected | Integration: refresh twice with same token → second returns 401; sessions killed on logout | P0 | 1 |
| FR-AUTH-003 | Secure token storage (Keychain/Keystore); survives app restart | E2E: kill app → relaunch → still authenticated without login UI | P0 | 1 |
| FR-AUTH-004 | Logout ends local session, revokes refresh token, returns to login | Integration: old refresh token 401 after logout | P0 | 1 |
| FR-AUTH-005 | [BE] WS ticket obtainable via bearer auth | Integration: bearer → `/api/auth/ws-ticket` → WS connect accepted | P0 | 1 |
| FR-AUTH-006 | Profile edit: username, display name, avatar (avatar upload depends FR-MED-020) | E2E: change display name → visible in a message from a second client | P0 | 1/5 |
| FR-AUTH-007 | Presence status picker: online/idle/dnd/invisible, persists | WS `presence.update` sent; second client sees change ≤2s | P0 | 4 |
| FR-AUTH-010 | Session expiry handling: silent refresh; hard 401 → login screen, state cleared | Integration (mock 401 storm): no crash, no request loop (≤3 retries) | P1 | 1 |

### APP — Shell, navigation, settings
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-APP-001 | Discord-shaped shell: server rail + channel drawer + chat pane + members drawer, gesture drawers on phone | Maestro flow walks all four surfaces | P0 | 1 |
| FR-APP-002 | Cold start restores last viewed channel | E2E: open channel → kill → relaunch → same channel visible | P0 | 2 |
| FR-APP-003 | Connection banner: offline / reconnecting states; auto-resubscribe + refetch on reconnect | Integration: drop WS → banner ≤3s; restore → banner clears, missed message appears without manual refresh | P0 | 1 |
| FR-APP-004 | Settings screens: account, appearance (dark/light/system), notifications, about/licenses | Maestro walk; theme change applies immediately | P1 | 8 |
| FR-APP-005 | Deep links: `openchat://invite/<code>`, `openchat://channels/<serverId>/<channelId>` | E2E: `adb shell am start` with URI → correct screen | P1 | 3 |
| FR-APP-006 | In-app error toasts for failed mutations with retry affordance; no silent failures | Unit: mutation error path renders toast | P0 | 2 |

### MSG — Messaging core
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-MSG-001 | Message list: newest-anchored, infinite upward pagination via `?before` cursor, day dividers, author grouping ≤7min | Integration vs seeded 1000-msg channel: exact page joins, no dupes/gaps (assert by id sequence) | P0 | 2 |
| FR-MSG-002 | Send text (Enter/send button), optimistic render with `nonce`, reconcile on `message.created`, failed-send retry/delete | Unit: optimistic→ack replaces by nonce; E2E two-device: B sees A's msg ≤2s | P0 | 2 |
| FR-MSG-003 | Edit own message (long-press menu), `(edited)` marker | E2E two-device propagation ≤2s | P0 | 2 |
| FR-MSG-004 | Delete own message; MANAGE_MESSAGES may delete others'; soft-deleted renders as removed | E2E + permission unit tests | P0 | 2 |
| FR-MSG-005 | Reply with quoted preview; tap preview jumps to original (loads older page if needed) | E2E: reply across a page boundary jumps correctly | P0 | 2 |
| FR-MSG-006 | Reactions: add/remove, counts, reactor list, emoji picker (unicode set, search) | E2E two-device: reaction visible ≤2s | P0 | 2 |
| FR-MSG-007 | Markdown render: bold/italic/underline/strike/`inline`+```block``` code/spoiler(tap-to-reveal)/blockquote/links/lists | Snapshot unit tests: one fixture per construct, matches web client semantics | P0 | 2 |
| FR-MSG-008 | Mentions: `@user` autocomplete + highlight; `@everyone/@here` gated by MENTION_EVERYONE; mention pushes unread badge | Unit: composer emits canonical mention syntax identical to web; E2E badge | P0 | 2 |
| FR-MSG-009 | Typing indicators (throttled ≥3s send interval; multi-user aggregation) | Integration: two senders → "A and B are typing…" | P0 | 2 |
| FR-MSG-010 | Unread/read state: per-channel unread divider, bold channel names, mention counts; `POST read` on view | Integration: exact ReadState round-trip; badge math unit-tested | P0 | 2 |
| FR-MSG-011 | Pins: pin/unpin (permission-gated), pins panel per channel | E2E: pin on device A → panel on device B ≤2s or on open | P0 | 2 |
| FR-MSG-012 | Polls: create (question+2..10 options), vote, live results | Integration: vote counts converge across two clients | P1 | 2 |
| FR-MSG-013 | Link auto-embeds: URL/YouTube/Share links render cards (server-provided or client unfurl matching web behavior — Phase 0 determines which) | Snapshot tests per embed type | P1 | 2/5 |
| FR-MSG-014 | GIF picker (Giphy search) inserting GIF as embed; hidden when no API key | E2E behind config flag | P1 | 2 |
| FR-MSG-015 | Copy text / copy link on long-press | Maestro: clipboard assert | P1 | 2 |
| FR-MSG-016 | [BE] Jump-to-message deep loading (`?around=<id>` pagination) | Integration: fetch around id returns id ± N | P1 | 2 |
| FR-MSG-020 | [BE] Message search: per-channel and per-server, by text + author filter, paginated | Integration vs seeded corpus: exact result set | P1 | 7 |

### SRV / CHN — Servers, channels, invites
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-SRV-001 | Server rail with unread dots/mention badges; respects user `serverLayout` folders+order; long-press reorder writes layout | Integration: layout JSON round-trip equals web format byte-for-byte | P0 | 3 |
| FR-SRV-002 | Create server (name, icon later via MED); owner lands in default channel | E2E | P0 | 3 |
| FR-SRV-003 | Server settings (rename, delete w/ confirm) permission-gated | Unit permission matrix + E2E | P0 | 3 |
| FR-SRV-004 | Channel list: categories, collapse state persisted locally, voice channels show live participant names | E2E with fixture server | P0 | 3 |
| FR-SRV-005 | Create/edit/delete text & voice channels; assign category; reorder via existing `PATCH channels/reorder` | Integration: order persists and matches web rendering | P0 | 3 |
| FR-SRV-006 | Invites: create (view existing code UX), share sheet, accept via code entry + deep link; invite preview screen | E2E: fresh user joins via `openchat://invite/<code>` | P0 | 3 |
| FR-SRV-007 | Member list drawer: role-grouped, presence-sorted, profile sheet on tap | E2E | P0 | 3 |
| FR-SRV-008 | Kick member (MANAGE_MEMBERS); leave server | E2E + permission unit | P0 | 3 |
| FR-SRV-009 | [BE] Granular realtime for guild structure: channel/category/role/member create-update-delete events (gateway additions, additive) | Integration: create channel on A → appears on B ≤2s WITHOUT refetch-all | P1 | 3 |
| FR-SRV-010 | Announcement-type channels render read-only for members without send rights (post-overwrites) | Unit gate matrix | P1 | 7 |

### ROLE / MOD — Roles, permissions, moderation
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-ROLE-001 | Role list + editor: name, color, permission toggles (bitfield), assign/remove per member | Integration: BigInt bitfield round-trip exact; UI matches `PERMISSION_LIST` labels | P0 | 3 |
| FR-ROLE-002 | Client permission calculator identical to server (`permissions.ts` semantics; owner⇒admin) — single shared lib | Property tests: 1000 random (roles,flags) cases agree with server lib verbatim | P0 | 3 |
| FR-ROLE-003 | [BE] Channel permission overwrites (allow/deny per role/member, Discord precedence order) + client editor | Golden-table tests: 25 canonical Discord precedence cases pass server AND client | P1 | 7 |
| FR-ROLE-004 | [BE] Ban (with reason, message purge option) + unban list; banned users cannot rejoin via invite | Integration lifecycle test | P1 | 7 |
| FR-ROLE-005 | [BE] Timeout (mute until timestamp): composer disabled client-side, sends rejected server-side | Integration: send during timeout → 403 | P1 | 7 |
| FR-ROLE-006 | [BE] Audit log read API + screen (existing AuditLog model; write coverage for all mod actions) | Integration: each mod action appends exactly one entry | P1 | 7 |
| FR-ROLE-007 | [BE] @role mentions (mentionable flag) with notification fan-out | E2E badge on member of role | P2 | 7 |

### SOC — Friends, DMs, presence, notifications inbox
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-SOC-001 | Friends: list (online/all/pending/blocked tabs), add by username/friendCode, accept/decline, remove, block | Integration state machine covers all `FriendStatus` transitions | P0 | 4 |
| FR-SOC-002 | DMs: open from friend/profile, DM list sorted by activity, full MSG feature set applies | E2E reuses MSG suite against DM channel | P0 | 4 |
| FR-SOC-003 | Group DMs: create (2..10), add/remove recipients per server rules, rename | E2E | P1 | 4 |
| FR-SOC-004 | Live presence dots everywhere users render; OFFLINE fallback | Integration: presence event updates ≤2s | P0 | 4 |
| FR-SOC-005 | Notifications inbox: mentions + server invitations with accept/decline | E2E: invite→accept→server appears | P0 | 4 |
| FR-SOC-006 | User profile sheet: avatar, banner-less v1, mutual servers, actions (DM, friend, block) | E2E | P0 | 4 |
| FR-SOC-007 | Blocked users' messages collapse ("Blocked message — tap to show") | Unit | P1 | 4 |

### MED — Media & attachments (closes G2/G3)
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-MED-001 | [BE] OpenShare service asset API: `POST /api/assets` (multipart, Bearer `SHARE_API_KEY`), `GET /api/assets/{id}` (metadata), `GET /api/assets/{id}/(raw|thumb)`; keeps cookie routes intact for web | Contract tests green from OpenChat side; web upload path regression green | P0 | 5 |
| FR-MED-002 | [BE] OpenChat upload broker `POST /api/uploads` (multipart from mobile, size/type limits, streams to Share, returns attachment refs identical in shape to web's `uploadToShare`) | Integration: mobile-shaped upload → message with attachment renders on web client | P0 | 5 |
| FR-MED-003 | [BE] Authenticated media proxy `GET /api/media/{assetId}/(raw|thumb)` with Range support + cache headers; attachment URLs rewritten for mobile | Integration: image+video byte-range fetch with bearer succeeds; unauthenticated 401 | P0 | 5 |
| FR-MED-010 | Compose attachments: photo library, camera, files; multi-select; upload progress; cancel; ≤10 per message | E2E on emulator with injected images | P0 | 5 |
| FR-MED-011 | Inline render: image grids w/ thumbs, tap → fullscreen gallery (zoom/swipe/save/share), video player, audio player, generic file rows | E2E gallery flow; snapshot per media type | P0 | 5 |
| FR-MED-020 | Avatar upload (self) and server icon upload via broker; crop square | E2E: avatar visible on second device | P0 | 5 |
| FR-MED-030 | Image compression client-side (long edge ≤2048, JPEG q80) with "original" toggle | Unit: output dimensions asserted | P1 | 5 |

### VOX — Voice & video (LiveKit)
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-VOX-001 | Join/leave voice channel: `POST /api/voice/:id/join` token → LiveKit RN connect; ongoing-call pill; background audio + CallKit/ConnectionService integration | E2E (Android emulator pair): both participants exchange audio frames (assert via LiveKit stats API, not ears) | P1 | 6 |
| FR-VOX-002 | Participant tiles: speaking rings (audio level events), mute badges | Integration vs LiveKit events | P1 | 6 |
| FR-VOX-003 | Controls: mute mic, deafen (local), speaker/earpiece toggle, disconnect | Unit + stats assertions (muted track publishes silence) | P1 | 6 |
| FR-VOX-004 | Voice channel occupancy shown live in channel list (uses `GET participants` + events) | Integration ≤3s convergence | P1 | 6 |
| FR-VOX-005 | DM calls: ring (`call.ring` op), incoming full-screen accept/decline, in-chat call banner | E2E two-device ring/accept | P1 | 6 |
| FR-VOX-006 | Camera video publish + remote video render in voice/DM calls | E2E: fake camera stream visible remotely (frame checksum) | P1 | 6 |
| FR-VOX-007 | View remote screenshares (subscribe + render; LIVE badge parity with `d0439e2`) | Integration with web-originated share | P2 | 6 |
| FR-VOX-060 | Watch party: join and view synced Jellyfin stream in a voice channel | Manual-validation script only | P2 | 6 |

### NOTIF — Push & notification settings
| ID | Requirement | Acceptance criterion | Pri | Ph |
|----|-------------|----------------------|-----|----|
| FR-NOTIF-001 | [BE] Device token registry (`POST/DELETE /api/devices`) + dispatch worker consuming MENTION/NOTIFY/CALL_RING bus events → FCM HTTP v1 (both platforms via FCM) | Integration with FCM emulator/mock: event → exactly-one push per active device | P1 | 8 |
| FR-NOTIF-002 | Push UX: mention/DM/call notifications, tap-through deep link, call push rings full-screen | E2E on emulator with FCM test transport | P1 | 8 |
| FR-NOTIF-003 | Per-server and per-channel notification levels (all/mentions/none) + mute durations; [BE] respected by dispatch worker | Integration: muted channel event → no push, badge still increments | P1 | 8 |
| FR-NOTIF-004 | In-app foreground handling (suppress push, show toast) | Unit | P1 | 8 |

## 4. Non-functional requirements (each has a deterministic harness — 04 §8)

| ID | Requirement | Budget / oracle |
|----|-------------|-----------------|
| NFR-01 | Cold start → interactive channel list | ≤3.0s p95 on Pixel-6a-class emulator (release build, `reportFullyDrawn`) |
| NFR-02 | Message list scroll on 1000-msg seeded channel | <5% janky frames (`dumpsys gfxinfo` harness) |
| NFR-03 | Release APK size | ≤60MB; JS bundle ≤12MB |
| NFR-04 | Steady-state memory in voice call | ≤400MB PSS |
| NFR-05 | Offline read: last 50 msgs of last 10 viewed channels render with airplane mode | E2E airplane-mode flow |
| NFR-06 | Outbound queue: sends composed offline deliver on reconnect in order (bounded 50) | Integration |
| NFR-07 | Reconnect storm safety: exponential backoff 1s→32s + jitter, resubscribe idempotent | Unit on backoff schedule; chaos test kills WS 20× |
| NFR-08 | Type safety: `tsc --strict` zero errors; no `any` in `apps/mobile/src` (lint-enforced) | CI gate |
| NFR-09 | Accessibility: all tappables have labels; text scales to 1.3× without clipped critical UI | Lint rule + Maestro font-scale pass |
| NFR-10 | Backend backward compatibility: web client E2E smoke green on every backend change | CI gate |
| NFR-11 | i18n-ready: all user-facing strings through a strings module (English-only content v1) | Lint rule: no literal JSX strings |
| NFR-12 | Crash-free harness sessions ≥99.5% across full E2E suite ×3 consecutive runs | CI release gate (Phase 8) |

## 5. Machine-readable index

`tools/trace` extracts every `FR-`/`NFR-` ID from the tables above (regex `\b(FR-[A-Z]+-\d{3}|NFR-\d{2})\b`, first column only) as the canonical requirement set. Do not restate IDs elsewhere as tables; prose references are fine.
