# OpenChat Web

<p align="center">
  <img src="https://raw.githubusercontent.com/MinionEnjoyer/OpenChat/main/apps/web/public/logo.png" alt="OpenChat logo" width="144" height="144" />
</p>

The official React web client for
[OpenChat](https://github.com/MinionEnjoyer/OpenChat), a self-hosted communication platform for
real-time text, voice, video, screen sharing, and watch parties.

The image serves the production Vite build through nginx. It supports servers and channels, direct
messages, reactions, stickers, GIFs, uploads through OpenShare, LiveKit voice and video, screen
sharing, watch parties, notifications, accessibility-aware centered dialogs, and responsive web
layouts. API and realtime requests are routed to the OpenChat API on the same deployment origin.

## Recommended deployment

Run this image as part of the maintained public Compose stack rather than as an isolated static
site:

```bash
git clone https://github.com/MinionEnjoyer/OpenChat.git
cd OpenChat
cp .env.example .env
# Configure .env, then render the LiveKit configuration.
./scripts/setup.sh
docker compose -f docker-compose.public.yml pull
docker compose -f docker-compose.public.yml up -d
```

To use the Docker Hub mirrors, set:

```dotenv
OPENCHAT_API_IMAGE=minionenjoyer/openchat-api
OPENCHAT_WEB_IMAGE=minionenjoyer/openchat-web
OPENCHAT_VERSION=0.8.46
```

## Image tags

- `latest`: newest CI-verified `main` build
- `0.8.46`: current client-compatible release
- `sha-<commit>`: immutable build for a verified source commit

Images are published for `linux/amd64` and `linux/arm64`. Docker Hub receives the exact digest
first published to GHCR after the source commit passes the complete OpenChat test suite.

## Related services and documentation

The web client requires the OpenChat API. A complete deployment also uses PostgreSQL, Redis, and
LiveKit; [OpenShare](https://github.com/MinionEnjoyer/OpenShare) enables attachments and rich media.

- [Setup guide](https://github.com/MinionEnjoyer/OpenChat/blob/main/docs/SETUP.md)
- [Deployment guide](https://github.com/MinionEnjoyer/OpenChat/blob/main/docs/DEPLOY.md)
- [Configuration template](https://github.com/MinionEnjoyer/OpenChat/blob/main/.env.example)
- [Source and issue tracker](https://github.com/MinionEnjoyer/OpenChat)

## Support the project

If OpenChat is useful to you, support its continued development through
[Buy Me a Coffee](https://buymeacoffee.com/minionenjoyer).

OpenChat is licensed under the MIT License.
