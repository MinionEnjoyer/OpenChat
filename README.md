<p align="center">
  <img src="apps/web/public/logo.png" alt="OpenChat" width="120" height="120" />
</p>

# OpenChat

A self-hosted, communication platform: real-time text, and voice/video calls. Built to **integrate** an
existing self-hosted stack — an OpenID Connect provider (e.g. Authentik) for SSO,
**[OpenShare](https://github.com/MinionEnjoyer/OpenShare)** for file uploads & media, and (optionally)
Jellyfin for watch parties — rather than reinvent them.

> **OpenShare is the companion file service.** Deploy it alongside OpenChat and point
> `SHARE_BASE_URL` at it to enable image/file attachments, avatars, and inline embeds. OpenChat also
> runs fine without it (upload UI simply hides). Setup: **[docs/SETUP.md](docs/SETUP.md)**.

Everything environment-specific
(domains, IPs, keys, passwords) is supplied through a single local config file — see
**[docs/SETUP.md](docs/SETUP.md)**.
## The newest version of desktop clients for Mac and Windows can be found in the clients-newest directory.
## If you found this project useful, consider supporting me here: https://buymeacoffee.com/minionenjoyer Thank you!

## Features

- **Servers, channels & folders** — text + voice channels; drag-to-reorder servers and
  drag-to-create folders in the sidebar, persisted per user.
- **Messaging** — optimistic send, replies, edits, reactions, emoji, GIFs (Giphy),
  link/image/YouTube/Share embeds, and **pinned messages** with a per-channel pins panel.
- **Mentions** — `@user`, plus `@here` / `@everyone` gated behind a `MENTION_EVERYONE`
  permission, with live toast + unread notifications.
- **Voice & video** — self-hosted LiveKit SFU. Always-on voice channels, watch-party
  integration, speaking/mute indicators, and per-user **mic + speaker + output-volume**
  settings.
- **User-to-user calling** — ring a friend in a DM; incoming-call prompt with accept/decline
  and an in-conversation call banner.
- **Watch parties** — synchronized Jellyfin playback inside a voice channel.
- **Roles & permissions** — bitfield permissions with a data-driven role editor.
- **Real-time everything** — WebSocket gateway + Redis pub/sub; presence, typing,
  notifications, and friend/member lists update live (optimistic UI throughout).
- **Mobile-tuned** — responsive layout, off-canvas drawer, dynamic-viewport sizing so the
  composer stays above the keyboard, and a dedicated send button.

## Tech stack

- **Frontend:** React 18 + TypeScript, Vite, Zustand, `livekit-client`. Static build served by nginx.
- **Backend:** NestJS (Node 20), Prisma, PostgreSQL 16, Redis 7 (ioredis), raw `ws` gateway.
- **Auth:** Authentik OIDC (Auth Code + PKCE), server-side Redis sessions.
- **Voice:** self-hosted LiveKit (WebRTC SFU), single-UDP-port mux for NAT stability.
- **Deploy:** Docker Compose behind an existing reverse proxy (Nginx Proxy Manager).

## Repository layout

```
apps/api            NestJS + Prisma backend (auth/OIDC, servers, channels, messages,
                    realtime WS gateway, voice, gifs, watch parties, Share client)
apps/web            React + Vite frontend (single-page app, calls /api same-origin)
docker-compose.yml  postgres + redis + api + web + livekit
livekit.yaml.tmpl   LiveKit config template (rendered to livekit.yaml from .env)
.env.example        the ONE config file — copy to .env and fill in
scripts/            setup.sh (render config) · check-secrets.sh (pre-push) · deploy.sh (pull+build)
docs/               SETUP.md · DEPLOY.md · ARCHITECTURE.md
```

## Quick start

```bash
cp .env.example .env      # fill in every CHANGE_ME
./scripts/setup.sh        # renders livekit.yaml from .env
docker compose up -d --build
```

Full instructions — including OIDC/Share/LiveKit prerequisites, local dev, pushing to git,
and git-based redeploys — are in **[docs/SETUP.md](docs/SETUP.md)** and
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Configuration & secrets

All personal data (API keys, tokens, IPs, passwords) lives **only** in the local, gitignored
`.env` (and the `livekit.yaml` it renders). Committed files contain generic placeholders and
public reference values only. `./scripts/check-secrets.sh` verifies nothing sensitive is tracked
before you push.
