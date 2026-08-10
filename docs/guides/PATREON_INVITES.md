# Patreon membership invitations

OpenChat can verify a supporter&apos;s current Patreon membership before allowing them to join a
server. This integration is optional and disabled by default. It is intended for self-hosted
creators who want membership-based community access without making Patreon an identity provider or
retaining Patreon credentials.

## Host configuration

Create an OAuth client in Patreon and register this exact callback URL:

```text
https://chat.example.com/api/patreon/callback
```

Add the client values to the host&apos;s gitignored `.env`:

```dotenv
PATREON_ENABLED=1
PATREON_CLIENT_ID=<Patreon OAuth client ID>
PATREON_CLIENT_SECRET=<Patreon OAuth client secret>
PATREON_REDIRECT_URI=https://chat.example.com/api/patreon/callback
```

Restart or redeploy the API after changing these values. The API refuses to start with Patreon
enabled unless all three OAuth settings are valid.

## Creator setup

Only the OpenChat server owner can configure a membership gate.

1. Open Server Settings → Patreon.
2. Enter the numeric Patreon campaign ID.
3. Set the minimum current monthly support amount. Use zero to accept every active patron.
4. Save the settings and copy the supporter invitation URL.
5. Publish that URL in the creator&apos;s normal supporter communications.

The gate can be paused without deleting it, or removed entirely. Existing OpenChat members are not
removed when a gate is paused or when their Patreon membership later changes.

## Supporter flow

1. The supporter opens the creator&apos;s OpenChat Patreon invitation URL.
2. OpenChat creates a random OAuth state in Redis with a ten-minute lifetime and redirects the
   supporter to Patreon.
3. Patreon returns the supporter to OpenChat after authorization.
4. OpenChat requests the supporter&apos;s current memberships directly from Patreon and checks the
   configured campaign, active-patron status, and current entitled amount.
5. An eligible supporter receives a random invitation that expires after one hour and can be used
   once. After OpenChat login, the web client accepts it automatically.

Membership is checked live for each join attempt. OpenChat does not rely on a Patreon webhook or a
cached supporter list.

## Security properties

- OAuth client secrets remain in host configuration and are never sent to an OpenChat client.
- Patreon access tokens are held only while processing the callback and are not written to
  PostgreSQL, Redis, logs, or browser storage.
- OAuth state is random, expires after ten minutes, and is deleted before the membership lookup so
  a callback cannot be replayed.
- Eligibility must match the configured campaign and current threshold.
- The resulting OpenChat invitation is random, expires after one hour, and is claimed atomically so
  concurrent requests cannot use it more than once.
- Callback errors are reduced to safe user-facing messages before redirecting to the web client.

The integration grants initial server access only. Continuous entitlement enforcement and automatic
member removal are deliberately outside this release.
