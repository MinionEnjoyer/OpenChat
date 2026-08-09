# OpenChat and OpenShare inter-app testing

OpenChat CI includes a blocking test boundary that runs the real OpenChat API and OpenShare
application together. It is separate from the probationary general integration suite: failures in
the inter-app suite fail CI because uploads, stickers, and soundboard media depend on this contract.

## Covered behavior

The suite verifies:

- both applications become healthy before tests start;
- missing and incorrect OpenShare service credentials are rejected, while the configured shared
  key and delegated OpenChat user identity are accepted;
- image, text, and audio multipart uploads traverse OpenChat and are stored by OpenShare;
- returned attachment references use authenticated OpenChat proxy paths;
- direct and proxied downloads return byte-identical content;
- range requests, thumbnail responses, and missing-asset errors retain useful HTTP behavior;
- sticker upload, server registration, message creation, listing, and registration removal;
- soundboard upload, waveform analysis, registration, listing, and registration removal.

The suite does not delete underlying OpenShare assets when sticker or soundboard registrations are
removed. OpenShare does not yet expose an ownership-safe service deletion contract for that action.

## CI topology

The Contract job checks out OpenShare into the OpenChat workspace and passes its path through
`OPENSHARE_BUILD_CONTEXT`. Compose starts PostgreSQL, Redis, OpenShare, and the OpenChat API on one
isolated network. Both applications receive the same test-only `SHARE_API_KEY`; CI classifies both
instances as `ci` for deployment heartbeat reporting.

The OpenShare image includes ffmpeg and ffprobe. CI sets `INTERAPP_EXPECT_MEDIA_PROCESSORS=1`, which
makes waveform and duration assertions mandatory. A source installation without those optional
executables may omit the flag while testing the rest of the boundary.

## Local execution

With OpenShare checked out beside OpenChat:

```bash
cp .env.dev.example .env.dev
docker compose -f docker-compose.dev.yml up -d --build postgres redis openshare api
cd apps/api
CHAR_API_BASE=http://localhost:3001/api \
CHAR_SHARE_BASE=http://localhost:8800 \
SHARE_API_KEY=dev-share-key \
INTERAPP_EXPECT_MEDIA_PROCESSORS=1 \
npx jest --config jest-interapp.config.js --forceExit
cd ../..
docker compose -f docker-compose.dev.yml down -v
```

The test only uses development identities and isolated test storage. Do not point these commands at
a production OpenChat API or production OpenShare instance.
