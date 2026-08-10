# Trusted mirror cluster

OpenChat can replicate persistent message events across a small group of hosts operated by the same administrator. This mode is disabled by default and is intended for resilient self-hosted deployments, not open public federation.

## Security and persistence

- Every peer URL must use HTTPS.
- Requests use a shared HMAC-SHA256 cluster secret, a node identity, and a five-minute anti-replay timestamp window.
- Event IDs are idempotent. Receiving the same event more than once does not duplicate a message.
- Each local event and peer delivery is stored in PostgreSQL before delivery. Failed deliveries retry with bounded exponential backoff.
- The secret is local configuration only. Never commit it or reuse the session/JWT secret.

## Configuration

Set the following on every node, using a unique `FEDERATION_NODE_ID`, the same random 32+ character `FEDERATION_SHARED_SECRET`, and a peer entry for every other node:

```dotenv
FEDERATION_ENABLED=1
FEDERATION_NODE_ID=west
FEDERATION_SHARED_SECRET=<random cluster secret>
FEDERATION_PEERS='[{"id":"east","url":"https://east.chat.example.com"}]'
```

Run `prisma migrate deploy` during the normal API deployment. Confirm each node reports the expected peer count at `/api/federation/v1/status` and that `pending` returns to zero after a test message.

## Operational boundary

This release mirrors message creation, edits, deletions, and attachment references between a pre-provisioned OpenChat network whose user, server, and channel IDs already match. Identity, membership, role, and server-topology changes remain administrator-controlled and must be provisioned consistently on each mirror. OpenShare asset replication is configured separately.
