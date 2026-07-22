# Artifact Inventory — P0-04 remediation v3

**Date:** 2026-07-21
**Purpose:** Confirm every file path claimed as "created" or "required" in any completion
report actually exists. This is the mechanical companion to Rule 5.1 (checks that did
not run); this document covers artifacts that do not exist.

## Required artifacts (phase-independent)

| Path | Status | Notes |
|------|--------|-------|
| contracts/x-attachment-shape.yaml | EXISTS | Created P0-04 remediation v3; verbatim from E9.txt line 28 |
| docs/BACKLOG.md | EXISTS | Created P0-04 remediation v1 |
| docs/DRIFT-LOG.md | EXISTS | P0-03+ |
| docs/LOG.md | EXISTS | All sessions |
| specs/00-MASTER-SPEC.md | EXISTS | P0-01 |
| specs/05-AGENT-OPERATIONS.md | EXISTS | P0-01; Rule 5.1 added in P0-04 remediation v2 |
| specs/templates/T2-AUDIT-CHECKLIST.md | EXISTS | P0-01; Q#10 added in P0-04 remediation v2 |
| tools/devctl | EXISTS | P0-02; doctor subcommand added P0-04 remediation v3 |

## Experiment outputs (E1–E11)

| Path | Status | Notes |
|------|--------|-------|
| docs/capabilities/EXPERIMENTS.md | EXISTS | P0-03 |
| docs/capabilities/experiment-outputs/E1.txt | EXISTS | |
| docs/capabilities/experiment-outputs/E2.json | EXISTS | |
| docs/capabilities/experiment-outputs/E3.json | EXISTS | |
| docs/capabilities/experiment-outputs/E4.txt | EXISTS | |
| docs/capabilities/experiment-outputs/E5.json | EXISTS | |
| docs/capabilities/experiment-outputs/E5.txt | EXISTS | |
| docs/capabilities/experiment-outputs/E6.json | EXISTS | |
| docs/capabilities/experiment-outputs/E7.json | EXISTS | |
| docs/capabilities/experiment-outputs/E8.json | EXISTS | |
| docs/capabilities/experiment-outputs/E9.txt | EXISTS | |
| docs/capabilities/experiment-outputs/E10.txt | EXISTS | |
| docs/capabilities/experiment-outputs/E11.json | EXISTS | |

## Characterization test suite

| Path | Status | Notes |
|------|--------|-------|
| apps/api/test/characterization/helpers.ts | EXISTS | 22 assertion helpers |
| apps/api/test/characterization/global-setup.ts | EXISTS | |
| apps/api/test/characterization/auth.spec.ts | EXISTS | |
| apps/api/test/characterization/servers.spec.ts | EXISTS | |
| apps/api/test/characterization/messages.spec.ts | EXISTS | |
| apps/api/test/characterization/pins-polls.spec.ts | EXISTS | |
| apps/api/test/characterization/reactions.spec.ts | EXISTS | |
| apps/api/test/characterization/dms-friends.spec.ts | EXISTS | |
| apps/api/test/characterization/invites.spec.ts | EXISTS | |
| apps/api/test/characterization/roles.spec.ts | EXISTS | |
| apps/api/test/characterization/voice.spec.ts | EXISTS | |
| apps/api/test/characterization/ws.spec.ts | EXISTS | |
| apps/api/test/characterization/share.spec.ts | EXISTS | |

## Mutation scripts

| Path | Status | Notes |
|------|--------|-------|
| tools/mut1-apply.py | EXISTS | Python-based MUT1 applicator (handles multi-line import) |
| tools/mut1.sh | EXISTS | Bash wrapper for MUT1 |
| tools/mut2.sh | EXISTS | |
| tools/mut3.sh | EXISTS | |
| tools/mut4.sh | EXISTS | |
| tools/mut5.sh | EXISTS | |

## Audit documents

| Path | Status | Notes |
|------|--------|-------|
| docs/audits/P0-04.md | EXISTS | Original audit |
| docs/audits/P0-04-remediation.md | EXISTS | Remediation v1 report |
| docs/audits/P0-04-verification.md | EXISTS | Independent verification (RETURN) |
| docs/audits/artifact-inventory.md | EXISTS | This file |

## Previously missing (now resolved)

| Path | Resolution |
|------|-----------|
| contracts/x-attachment-shape.yaml | Created P0-04 remediation v3 |

## Missing file report

**Zero missing files.** All 42 required/claimed paths verified present on disk.

## Mechanism

`tools/devctl doctor` (added this commit) asserts presence of every path in this
inventory at runtime and exits nonzero with a JSON list of any missing paths.
Wired into `devctl verify` as a pre-flight check.