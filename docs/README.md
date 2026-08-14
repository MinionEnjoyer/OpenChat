# OpenChat documentation

The current public desktop/web UI release is **0.8.49**. The hosted web/API deployment follows
CI-passing `main` and may advance without changing the desktop version.

## Start here

- [Setup](SETUP.md) covers prerequisites, configuration, networking, and local development.
- [Deployment](DEPLOY.md) covers manual and CI-gated production updates.
- [Architecture](ARCHITECTURE.md) describes the production design and integration boundaries.
- [Project status](PROJECT-STATUS.md) records current health, verification, and open risks.
- [Specialized guides](guides/README.md) contains integrations, testing, mobile distribution, and
  focused operator runbooks.

Component documentation lives alongside the component:

- [Desktop client](../apps/desktop/README.md)
- [Development control tool](../tools/devctl-README.md)
- [Production probes](../tools/probe/README.md)

## Repository records

The root-level `BACKLOG.md`, `DRIFT-LOG.md`, `LOG.md`, and `PRIORITIES.md`, along with the
`audits/`, `capabilities/`, `debug-logs/`, `decisions/`, `release/`, and `signoffs/` directories,
are inputs to existing repository gates. They stay at their established paths.

Dated handoffs, proposals, completed work orders, and retrospective batches are under
[archive](archive/README.md). Archived text is a frozen record of the commit or date it names and
must not be treated as current product documentation.

## Verification

After changing current documentation, run:

```bash
node tools/docs/verify-current-docs.mjs
```

The verifier derives release and architecture facts from their producing source files, rejects
known stale claims, validates local links, and prevents new Markdown files from accumulating at the
documentation root without an explicit index decision.
