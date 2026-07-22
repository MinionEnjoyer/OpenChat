#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Clean up stale backup
rm -f apps/api/test/contract/provider.spec.ts.bak

# Stage all modified and new files
git add \
  apps/api/test/contract/provider.spec.ts \
  contracts/openapi.yaml \
  docs/BACKLOG.md \
  docs/DRIFT-LOG.md \
  tools/devctl \
  apps/api/package.json \
  apps/api/package-lock.json \
  tools/mut1.sh \
  tools/mut2.sh \
  tools/mut3.sh \
  tools/mut4.sh \
  tools/mut5.sh \
  tools/mut3-contract.cjs \
  tools/mutate-contract-tests.sh \
  tools/prove-contract-gate.sh \
  tools/diag-provider.mjs \
  tools/snoop-keys.mjs \
  tools/probe-shapes.mjs

git commit -m "[P0-09] provider rebuild: contract-validated with ajv + additionalProperties:false; all 14 failures diagnosed and fixed (logout cookie leak, server-shape mismatches); mutation matrix 3/3 caught; DRIFT-LOG vacuous-gate entry; devctl selftest" -m "## Provider rebuild

- Replaced manual toHaveProperty assertions with ajv schema validation
- Schemas extracted from contracts/openapi.yaml (js-yaml incompatibility — schemas inline)
- additionalProperties: false on all response schemas — undocumented fields fail
- Coverage: auth, servers, channels, messages, reactions, pins, invites, dms, friends, notifications, voice join (all Phase 1-4 routes)

## 14 failures diagnosed and fixed

- 10 were logout cookie leak: logout test destroyed alice session, never restored it
- 1 was /config requiring auth (server has SessionGuard, contract was wrong — server wins)
- 2 were response shape mismatches: /notifications returns {friendRequests,serverInvites,count}, /friends/requests returns {incoming,outgoing}
- 1 was members count: bob added as PENDING, not instantly a member

## Mutation matrix

3 mutations (username integer, createdAt removed, serverLayout removed) — all 3 caught with nonzero exit. Mutation test at tools/mut3-contract.cjs.

## Vacuous-gate fix

devctl verify now shifts before cmd_verify so layers actually run. Proven: deliberately broken health test → exit 1.

## devctl selftest

Breaks one thing per layer (doctor, contract, char) and asserts nonzero exit. NOT wired into verify (it mutates)."

echo "SHA: $(git rev-parse HEAD)"