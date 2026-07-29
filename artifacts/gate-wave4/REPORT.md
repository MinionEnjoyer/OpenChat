# Gate Report — gate-wave4 (merged integration)

**Date:** 2026-07-25
**Branch:** `gate-wave4`
**Port:** 3140

## Checks

| # | Command | Exit Code | Suites | Tests | Baseline |
|---|---------|-----------|--------|-------|----------|
| 1 | `node tools/codegen/gen.mjs --check` | 0 | — | — | — |
| 2 | `cd apps/mobile && npx tsc --noEmit` | 0 | — | — | — |
| 3 | `cd apps/mobile && npx eslint . --max-warnings=0` | 0 | — | — | — |
| 4 | `cd apps/mobile && npx jest` | 0 | 34 | 446 | ≥30 / ≥405 |
| 5 | `cd apps/api && npx prisma generate` | 0 | — | — | — |
| 6 | `cd apps/api && npx tsc --noEmit` | 0 | — | — | — |
| 7 | `cd apps/api && npx eslint "src/**/*.ts" "test/**/*.ts"` | 0 | — | — | 46 `any` warnings (expected, ≤48) |
| 8 | `cd apps/api && npx jest --config jest-char.config.js --forceExit` | 0 | 11 | 89 | 11 / 89 |
| 9 | `cd apps/api && npx jest --config jest-integration.config.js --forceExit` | 0 | 15 | 97 | ≥13 / ≥87 |

## Details

### Codegen
Generated types match committed files. No drift.

### Mobile tsc
Clean — no type errors.

### Mobile eslint
Clean — no errors, no warnings.

### Mobile jest
All 34 suites passed (446 tests). Increases over baseline (30/405) — merged branches added test coverage.

### API tsc
Clean — no type errors.

### API eslint
46 `any` warnings, 0 errors. All are pre-existing `@typescript-eslint/no-explicit-any` warnings in service/controller/gateway files. Under the 48-warning expected threshold.

### API characterization
All 11 suites passed (89 tests). Exact baseline hit.

### API integration
All 15 suites passed (97 tests). Above baseline (13/87) — merged branches added integration coverage.

## Verdict

**GREEN** — all gates pass. No failures, no regressions, no missing tests.
