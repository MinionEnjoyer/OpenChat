# FR-MSG-014 Investigation — BUILT + UNTESTED

**Date:** 2026-07-26
**Author:** Codewhale (root)
**Verdict:** **A — BUILT + UNTESTED**

The entire feature exists on both server and client sides. The code is production-grade, not a stub or dev-gated path. No test proves the acceptance criterion — the two existing "tests" are a structural DOM assertion and a trivially-passing placeholder. This is not the FR-AUTH-001 shape (one side missing).

---

## 1. Requirement

| Field | Value |
|-------|-------|
| ID | FR-MSG-014 |
| Text | GIF picker (Giphy search) inserting GIF as embed; hidden when no API key |
| Criterion | E2E behind config flag |
| Priority | P1 |
| Phase | 2 |

---

## 2. Evidence — server side (FULLY BUILT)

### GifsService: full Giphy API integration
- **`apps/api/src/gifs/gifs.module.ts:17-36`** — `GifsService.search(q)`:
  - Reads `GIPHY_API_KEY` from config
  - Returns `BadRequestException('GIF search is not configured')` when absent
  - Calls Giphy `search` or `trending` endpoint with `api_key`, `limit=24`, `rating=pg-13`
  - Maps response to `Gif[]` interface (`id`, `url`, `previewUrl`, `width`, `height`)
  - Filters out entries with no URL

### GifsController: authenticated route
- **`apps/api/src/gifs/gifs.module.ts:41-49`** — `@Controller('gifs')`, `@UseGuards(AuthGuard)`, `GET search` delegates to `GifsService.search()`

### Module registration
- **`apps/api/src/app.module.ts:18`** — `import { GifsModule } from './gifs/gifs.module'`
- **`apps/api/src/app.module.ts:51`** — `GifsModule` in `imports` array

### Contract
- **`contracts/openapi.yaml:1812-1829`** — `GET /gifs/search` documented with `x-evidence: "route exists in controller; no characterization test; requires external API key"`

---

## 3. Evidence — mobile client (FULLY BUILT)

### GifPicker component (229 lines)
- **`apps/mobile/src/features/messages/GifPicker.tsx:1-229`** — Full-featured Modal:
  - Search TextInput with autoFocus
  - Debounced search (300ms for typed queries, immediate for trending)
  - 2-column FlatList GIF grid with pressable preview images
  - Loading, error, and empty states
  - "Powered by GIPHY" footer
  - Calls `api.request('/gifs/search?q=…')` directly

### Feature flag store
- **`apps/mobile/src/features/messages/gifFeature.ts:1-24`** — Zustand store `useGifFeature`:
  - Probes `GET /gifs/search?q=` once on first call — 200 → `enabled: true`, 400 → `enabled: false`
  - Idempotent: second `probe()` call is a no-op
  - Derives feature flag from reality rather than assuming a config field exists

### ChatPane integration
- **`apps/mobile/src/features/messages/ChatPane.tsx:37-38`** — imports `GifPicker`, `GifResult`
- **`apps/mobile/src/features/messages/ChatPane.tsx:40`** — imports `useGifFeature`
- **`apps/mobile/src/features/messages/ChatPane.tsx:128`** — `const gifEnabled = useGifFeature((s) => s.enabled)`
- **`apps/mobile/src/features/messages/ChatPane.tsx:138`** — `void useGifFeature.getState().probe()` on mount
- **`apps/mobile/src/features/messages/ChatPane.tsx:803-812`** — GIF button conditionally rendered: `{gifEnabled === true && (<Pressable … testID="composer-gif">…</Pressable>)}`
- **`apps/mobile/src/features/messages/ChatPane.tsx:850-856`** — `<GifPicker>` modal with `onSelect` → `doSend(gif.url, [])`

### Embed rendering
- **`apps/mobile/src/features/messages/MessageEmbeds.tsx`** — GIF URLs are rendered as inline embeds (via `classifyEmbeds` from `domain/embeds.ts`)

---

## 4. Evidence — web client (BUILT, minor defect)

### GifPicker component
- **`apps/web/src/components/GifPicker.tsx:1-68`** — Full GifPicker with search, debounce, 2-col grid, error/loading states

### API
- **`apps/web/src/lib/api.ts:final line`** — `export const gifSearch = (q: string) => request<Gif[]>('/gifs/search?q=…')`

### App integration
- **`apps/web/src/App.tsx:1643`** — `const [gifAnchor, setGifAnchor] = useState<{x,y}|null>(null)`
- **`apps/web/src/App.tsx:1817-1821`** — GIF button in composer, **unconditionally rendered** (no feature gating)
- **`apps/web/src/App.tsx:1838-1841`** — `<GifPicker>` modal

**Defect:** The web GIF button has no `gifEnabled` check. Mobile probes the backend and hides the button when the API key is absent; web always shows it. This is a benign defect (clicking it when unconfigured shows a 400 error to the user) but does not fully satisfy the "hidden when no API key" requirement text for the web client specifically.

---

## 5. Evidence — tests (PLACEHOLDER / STRUCTURAL ONLY)

### Mobile: structural-only, no config-gating
- **`apps/mobile/src/features/messages/__tests__/gifPickerModalStructure.test.tsx:1-37`** — Validates only Modal DOM nesting (direct child is opaque overlay, not KAV). No assertions about:
  - GIF button visibility when API key is absent
  - GIF button visibility when API key is present
  - Search functionality
  - GIF selection → message send flow
  - No `@satisfies FR-MSG-014` annotation

### Backend: trivially-passing placeholder
- **`apps/api/test/contract/provider.spec.ts:512`** — `it('GET /gifs/search — requires external API key', () => { expect(true).toBe(true); });`
  - Always passes. No HTTP call. No assertion about 400 when key absent.
  - No `@satisfies FR-MSG-014` annotation

### Trace gate
- `node tools/trace.mjs check` — lists FR-MSG-014 among 17 unannotated requirements (exit 1)

---

## 6. Audit history

| Audit | Date | Verdict | Note |
|-------|------|---------|------|
| Phase 2 audit | 2026-07-26 | UNSATISFIED | Structural modal test with no @satisfies annotation |
| Phase 2 signoff | 2026-07-26 | NOT GRANTED | FR-MSG-014 is the only UNSATISFIED P1 in Phase 2 |
| Phase 3 audit | 2026-07-26 | N/A (out of scope) | Mentioned as "not a Phase 3 FR" |
| TRACE-TRIAGE | 2026-07-26 | Case B — IMPLEMENTED, NO TEST | Confirmed full implementation; action: needs E2E/integration test proving config-gating |

---

## 7. What is actually missing

A test that proves the acceptance criterion: **"E2E behind config flag."**

Specifically: prove that the mobile GIF button (`testID="composer-gif"`) is **absent from the render tree** when the backend returns 400 from `GET /gifs/search?q=` (API key absent), and **present** when the backend returns 200 (API key configured).

The test must exercise the real `useGifFeature.probe()` flow — not mock it into a single state. Testing both paths is the minimum; a single-path test that only proves one configuration is inadequate because the feature's distinguishing behavior is conditional visibility.

### Test design options

1. **Maestro E2E (preferred):** Deploy backend without `GIPHY_API_KEY` → navigate to any channel → assert `composer-gif` is not visible. Deploy with key → assert it is visible.
2. **Integration test:** Intercept the `fetch` to `/gifs/search?q=` and return either 200 or 400; assert the conditional render via `render` + `waitFor`. Must NOT mock `useGifFeature` — must exercise the real probe path.
3. **Contract test (backend):** Replace the `expect(true).toBe(true)` placeholder with an actual HTTP call that asserts a 400 response when `GIPHY_API_KEY` is absent.

Option 1 or 2 is required for the `@satisfies FR-MSG-014` annotation. Option 3 alone is insufficient because the criterion is E2E (client-side visibility gating), not server-side error handling.

---

## 8. Not Case B or C — no UNBUILT entry

The code is complete on both sides. This is a testing gap, not a build gap. Per the investigation instructions, UNBUILT entries are only appended for cases B or C.

The web client's missing feature gating is a minor defect (not a missing half) and should be tracked separately as a Phase 7 parity gap, not as an UNBUILT.
