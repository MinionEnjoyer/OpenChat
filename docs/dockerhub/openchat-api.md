# OpenChat API

<p align="center">
  <img src="https://raw.githubusercontent.com/MinionEnjoyer/OpenChat/main/apps/web/public/logo.png" alt="OpenChat logo" width="144" height="144" />
</p>

The official backend container for [OpenChat](https://github.com/MinionEnjoyer/OpenChat), a
self-hosted communication platform for real-time text, voice, video, screen sharing, and watch
parties.

This image provides the NestJS API and realtime gateway. It manages OpenID Connect sessions,
servers, channels, messages, roles, presence, notifications, LiveKit coordination, and the optional
OpenShare media integration. It is intended to run with the OpenChat web container, PostgreSQL,
Redis, LiveKit, and optionally [OpenShare](https://github.com/MinionEnjoyer/OpenShare).

## Recommended deployment

Use the maintained public Compose stack so the API, web client, database, cache, and voice service
receive the correct configuration:

```bash
git clone https://github.com/MinionEnjoyer/OpenChat.git
cd OpenChat
cp .env.example .env
# Configure .env, then render the LiveKit configuration.
./scripts/setup.sh
docker compose -f docker-compose.public.yml pull
docker compose -f docker-compose.public.yml up -d
```

The Compose stack defaults to GHCR. To use Docker Hub, set:

```dotenv
OPENCHAT_API_IMAGE=minionenjoyer/openchat-api
OPENCHAT_WEB_IMAGE=minionenjoyer/openchat-web
OPENCHAT_VERSION=0.8.48
```

## Image tags

- `latest`: newest CI-verified `main` build
- `0.8.48`: current client-compatible release
- `sha-<commit>`: immutable build for a verified source commit

Images are published for `linux/amd64` and `linux/arm64`. Docker Hub receives the exact digest
first published to GHCR after the source commit passes the complete OpenChat test suite.

## Configuration and documentation

OpenChat has no production credentials or environment-specific defaults baked into the image.
Configure OIDC, PostgreSQL, Redis, LiveKit, public URLs, and optional integrations in a local
gitignored `.env` file.

- [Setup guide](https://github.com/MinionEnjoyer/OpenChat/blob/main/docs/SETUP.md)
- [Deployment guide](https://github.com/MinionEnjoyer/OpenChat/blob/main/docs/DEPLOY.md)
- [Configuration template](https://github.com/MinionEnjoyer/OpenChat/blob/main/.env.example)
- [Source and issue tracker](https://github.com/MinionEnjoyer/OpenChat)

## Support the project

If OpenChat is useful to you, support its continued development through
[Buy Me a Coffee](https://buymeacoffee.com/minionenjoyer).

OpenChat is licensed under the MIT License.
