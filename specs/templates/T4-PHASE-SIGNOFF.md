# Phase <n> Signoff — <name>

Date: · Base tag: phase<n-1>-signoff · New tag: phase<n>-signoff

## Deterministic gates (paste the JSON, don't summarize it)
- `devctl verify --json`:
- `devctl e2e --json` (full suite ×2; attach flake census):
- `devctl trace check --phase <n> --json`:
- `devctl nfr --json` (phases ≥2; note armed vs baseline-only):
- web-smoke + characterization suite result (backend-touching phases):
- contracts: regen diff clean? CHANGELOG entries listed:

## Judgment gates
- Demo script executed (path + recording/screens artifact):
- Screenshot review: `artifacts/screens/<sha>/` reviewed against the phase's screens —
  layout truncation at 1.3× font, dark+light, empty states. Findings:
- DRIFT-LOG retirement: all lines this phase triaged (fixed / BACKLOG-<id> / accepted+reason):
- Open escalations: must be zero — list closures:
- Backlog additions this phase (count + top 3):

## Deviations from spec
Decision Records accepted this phase: <list or none>

## Product-owner note (human, milestones only — else "n/a per 17 §6")
