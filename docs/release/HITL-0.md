# HITL-0 — Human-in-the-loop items requiring Will's action

> Written by agent; items below cannot be performed without human credentials or
> GitHub admin access. Execute in order.

## 1. Enable branch protection on the fork

```bash
# Requires: repo admin on MinionEnjoyer/OpenChat
gh api repos/MinionEnjoyer/OpenChat/branches/main/protection \
  -X PUT \
  -f required_status_checks='{"strict":true,"contexts":["verify","contract","test"]}' \
  -f enforce_admins=false \
  -f required_linear_history=false \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f required_pull_request_reviews='{"required_approving_review_count":0,"dismiss_stale_reviews":true}' \
  -f restrictions=null
```

If `gh` is not authenticated, configure via Settings → Branches → Add rule on
https://github.com/MinionEnjoyer/OpenChat.

## 2. Push a branch so CI lanes execute for the first time

```bash
# CI has NEVER been executed. The ci.yml file defines service containers,
# prisma generate, and a docker compose step in the `contract` job that is
# entirely unvalidated. First-run failures ARE EXPECTED and are NOT regressions.
git push origin main
```

Watch the Actions tab for the run. Expected first-run issues:
- Docker Compose version mismatch in the `contract` job's service containers
- Prisma client generation step may need `npx prisma generate` before tests
- Connection-string env vars may need adjustment for the CI environment

## 3. Credential-requiring items (not automated)

Nothing else is blocked on credentials at this time. If future docs reference
OIDC/Authentik setup, that requires a running IdP instance — not in CI scope.