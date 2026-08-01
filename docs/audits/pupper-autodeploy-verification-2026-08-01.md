# Pupper CI-gated auto-deploy verification — 2026-08-01

## Result

The OpenChat production host `pupper` now polls the public GitHub Actions API every five minutes
and deploys a new `main` revision only when the workflow named `CI` has completed successfully for
that exact SHA.

The first production run deployed and verified:

```text
068abf22e94471885434240b75041af8204df96d
```

## Observed runtime evidence

- The systemd service completed with `Result=success` and `ExecMainStatus=0`.
- A subsequent no-op run logged the same candidate and deployed SHA, `ci=success`, and skipped the
  rebuild because the revision was already active.
- `openchat-autodeploy.timer` was enabled, active, and waiting with its next run approximately five
  minutes away (plus the configured jitter).
- `/opt/chat-releases/current` resolved to `/opt/chat-releases/068abf22e944`.
- `/opt/chat-current` resolved through the stable inner pointer to the same release.
- The release checkout's full Git HEAD exactly matched the SHA above.
- `chat-api`, `chat-web`, `chat-postgres`, `chat-redis`, and `chat-livekit` were running.
- PostgreSQL and Redis reported healthy.
- `http://127.0.0.1:8810/api/health` returned `status=ok`, `db=up`, and `redis=up`.
- The local web root returned HTTP 200.
- A nonempty custom-format database backup for the deployed SHA exists under `/opt/chat/backups`.
- `/etc/openchat` remained root-owned with mode `0750`; protected config contents were never
  printed.
- The legacy dirty `/opt/chat` checkout retained its original 2026-08-01 13:08 mtime and was not
  used as a build checkout.

## Failure controls exercised during installation

Two hardening failures occurred before the successful run, and both failed closed:

1. `ProtectHome=true` prevented Docker Compose from creating client state under `/root/.docker`.
   The service kept its root identity and now uses a dedicated writable
   `/opt/openchat-deployer/docker-config` directory.
2. The original release pointer lived directly under `/opt`, outside the service's narrow
   `ReadWritePaths`. The service initially left the pointer unchanged. The final design uses an
   inner pointer at `/opt/chat-releases/current`; `/opt/chat-current` is a fixed administrative
   symlink to it. The service retains write access only to its deploy root, releases, backups, and
   runtime lock path.

The failed attempts retained their database backups and did not restore or delete database data,
volumes, releases, images, or backups.
