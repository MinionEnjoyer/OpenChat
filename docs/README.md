# OpenChat documentation

This index separates maintained guidance from evidence that intentionally describes an earlier
commit or release. The current public desktop/web UI release is **0.8.45**; the web/API production
deployment follows CI-passing `main`.

## Maintained guides

- [Setup](SETUP.md) — service prerequisites, configuration, networking, and local development.
- [Deploy and update](DEPLOY.md) — manual and CI-gated production deployment.
- [Architecture](ARCHITECTURE.md) — the current production design and integration boundaries.
- [Patreon invitations](PATREON_INVITES.md) — optional membership verification and creator setup.
- [Trusted mirror cluster](TRUSTED_MIRROR_CLUSTER.md) — private, authenticated host replication.
- [Project status](PROJECT-STATUS.md) — current release, health, verification, and open risks.
- [Authentication readiness](AUTH-PRODUCTION-READINESS.md) — web, desktop, and mobile OIDC/PKCE.
- [Production push enablement](PRODUCTION-PUSH-ENABLEMENT.md) — FCM/APNs server configuration.
- [Android install](ANDROID-INSTALL.md) and [TestFlight install](TESTFLIGHT-INSTALL.md) — private
  mobile distribution. Mobile artifacts use their own version line and are not desktop 0.8.45.

Component-specific guides also live at
[apps/desktop/README.md](../apps/desktop/README.md),
[tools/devctl-README.md](../tools/devctl-README.md), and
[tools/probe/README.md](../tools/probe/README.md).

Specialized mobile/operator runbooks (`APPLE-DEV-CHECKLIST.md`, `IOS-PUSH-SETUP.md`,
`TESTFLIGHT-INTERNAL-TESTERS.md`, `TWO-DEVICE-TESTING.md`, and `DISK-RECLAIM.md`) are scoped to the
artifact or environment they name. Check their prerequisites before use; they do not define the
desktop/web release version.

After changing a maintained guide, run:

```bash
node tools/docs/verify-current-docs.mjs
```

The check derives the release version and key architecture facts from their producing source files,
rejects known stale claims, and validates local Markdown links.

## Historical and evidence documents

Files under `audits/`, `signoffs/`, `decisions/`, `retrospective/`, `release/`, and `workorders/`,
together with `HANDOFF*`, `LOG.md`, `BACKLOG.md`, `PRIORITIES.md`, `DRIFT-*`, `TRACE-TRIAGE.md`,
`AGENT-*`, `DIAG-SINGLES.md`, and the `UPSTREAM-*` planning reports, are immutable evidence for the
commit or date named in each file. Their old version numbers, test counts, findings, or `UNBUILT`
labels must not be read as the current product state. New conclusions belong in a new dated
artifact or in one of the maintained guides above; do not rewrite signed historical evidence.
