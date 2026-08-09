# Deployment heartbeats

OpenChat and OpenShare report aggregate installation activity to the public OpenChat collector at
`https://chat.creeger.com/api/telemetry/heartbeat`. Each backend sends once at startup and then every
24 hours. A collector outage is nonfatal and does not affect messaging, files, authentication,
voice, or application startup.

## Payload and persistence

The accepted payload is a strict four-field contract:

```json
{
  "product": "openchat",
  "installId": "persistent-random-uuid",
  "version": "0.8.46",
  "deploymentType": "docker-compose"
}
```

The OpenChat installation ID is stored in PostgreSQL in `DeploymentIdentity`. It survives container
replacement as long as the deployment keeps its PostgreSQL volume. Recreating the database creates
a new installation identity.

No usernames, messages, server names, hostnames, public URLs, contact records, media information,
or request metadata are stored. Network infrastructure can still observe a source IP while routing
the HTTPS request, but the collector controller does not read or persist it.

`OPENCHAT_DEPLOYMENT_TYPE` defaults to `docker-compose`. Other packaged installations can use a
lowercase identifier such as `kubernetes` or `source`. CI, test, and development classifications are
retained for diagnostics but excluded from active-installation totals.

## Collector and report

`POST /api/telemetry/heartbeat` accepts OpenChat and OpenShare heartbeats without user authentication.
The body is strictly validated and unexpected fields are rejected. These counts are directional
adoption metrics and should not be used for billing or security decisions because an unauthenticated
sender can create a synthetic installation ID.

Set a random `TELEMETRY_ADMIN_TOKEN` of at least 32 characters on the collector deployment. Aggregate
counts are then available with:

```bash
curl -H "X-Telemetry-Admin-Token: $TELEMETRY_ADMIN_TOKEN" \
  https://chat.example.com/api/telemetry/summary
```

The report includes all-time, seven-day-active, and thirty-day-active installation counts, broken
down by product and deployment type. The admin endpoint returns an authorization error when the
token is absent or incorrect.

## Test coverage

The API harness verifies:

- immediate delivery and the exact 86,400-second repeat interval;
- persistent identity upsert and the exact outbound payload;
- nonfatal persistence or network failure;
- strict shared payload validation;
- collector upsert behavior without request metadata;
- seven-day and thirty-day aggregation with CI/development exclusion;
- constant-time administrative token comparison.

Run the focused suite with:

```bash
cd apps/api
npm test -- --runInBand telemetry configuration
```
