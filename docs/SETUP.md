# Setup

How to get OpenChat running from scratch. All environment-specific values come from a single
local config file — **`.env`** — which is never committed.

## Prerequisites

You need these services reachable (use your own instances — any equivalents work):

| Need | What it provides | Config keys |
|---|---|---|
| **Docker + Docker Compose** | runs the whole stack | — |
| **PostgreSQL** | created automatically by compose | `POSTGRES_*` |
| **Redis** | created automatically by compose | `REDIS_URL` |
| **Authentik (or any OIDC provider)** | login / SSO | `OIDC_*` |
| **[OpenShare](https://github.com/MinionEnjoyer/OpenShare)** *(optional)* | file/image uploads, avatars, previews | `SHARE_*` |
| **Jellyfin** *(optional)* | watch parties | `JELLYFIN_*` |
| **A public IP / edge** | LiveKit media reachability | `LIVEKIT_NODE_IP` |
| **Giphy API key** *(optional)* | GIF picker | `GIPHY_API_KEY` |
| **Patreon OAuth client** *(optional)* | membership-gated server invitations | `PATREON_*` |
| **A reverse proxy (e.g. Nginx Proxy Manager)** | TLS + routing the domain to the web container and `wss://` to LiveKit | — |

### Provider notes

- **Authentik:** create an OAuth2/OpenID *Provider* + *Application* named `chat`. Set the
  redirect URI to `https://<your-chat-domain>/api/auth/callback`. Copy the client ID/secret
  into `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`, and the issuer into `OIDC_ISSUER`.
- **OpenShare (file backend):** deploy [OpenShare](https://github.com/MinionEnjoyer/OpenShare)
  (its README has full steps), then in **OpenChat's** `.env` set `SHARE_BASE_URL` to OpenShare's
  public URL and `SHARE_API_KEY` to a random secret (`openssl rand -hex 32`). Put the **same**
  `SHARE_API_KEY` in **OpenShare's** `.env` — uploads route through OpenChat's API, which stores
  to OpenShare on the user's behalf using the `/api/assets` service contract (with a legacy
  `/upload` fallback). Raw media, thumbnails, and waveform analysis also pass through authenticated
  OpenChat API routes, so clients do not need OpenShare credentials or a direct browser session.
  Point both apps at the *same* OIDC provider. Optionally set OpenShare's `OPENCHAT_PUBLIC_URL` to
  the OpenChat web address so contact cards can open the Friends screen with a username or friend
  code prefilled. Leave `SHARE_*` blank to run OpenChat without uploads.
- **Patreon:** create a Patreon OAuth client with
  `https://<your-chat-domain>/api/patreon/callback` as its exact redirect URI. Set
  `PATREON_ENABLED=1`, the client ID and secret, and `PATREON_REDIRECT_URI`. Server owners can then
  configure a campaign and support threshold in Server Settings → Patreon. See
  [Patreon invitations](guides/PATREON_INVITES.md) for the security model and complete flow.
- **Reverse proxy:** point `chat.<domain>` → the web container's host port (`WEB_PORT`, default
  `8810`), and `livekit.<domain>` → the LiveKit signaling port `7880` (WebSocket upgrade
  enabled). Forward LiveKit media to the host: **UDP 50000** and **TCP 7881**.

## 1. Configure

```bash
cp .env.example .env
```

Open `.env` and replace every `CHANGE_ME`. Generate strong secrets with:

```bash
openssl rand -hex 32     # use for SESSION_SECRET, POSTGRES_PASSWORD, LIVEKIT_API_SECRET
```

`.env` is the **only** file with your real values. It is gitignored — it never leaves the host.

Upload limits are operator-controlled. `UPLOAD_MAX_FILES` and `UPLOAD_MAX_FILE_BYTES` are unset by
default, so the API does not impose a file-count or per-file limit. The bundled nginx config accepts
request bodies up to 100 MB; raise that value (and the external proxy's body limit) if your instance
should accept larger requests.

Patreon invitations and trusted mirror clustering are also disabled by default. Their credentials
belong only in `.env`. Follow [Patreon invitations](guides/PATREON_INVITES.md) or
[trusted mirror clusters](guides/TRUSTED_MIRROR_CLUSTER.md) before enabling either integration.

## 2. Render the LiveKit config

```bash
./scripts/setup.sh
```

This writes `livekit.yaml` from `livekit.yaml.tmpl`, filling in `LIVEKIT_NODE_IP` and the API
key/secret from `.env` (so the server and the API always share the same key). `livekit.yaml` is
gitignored too. Re-run this any time you change a `LIVEKIT_*` value.

## 3. Start

```bash
docker compose up -d --build
```

To run the prebuilt multi-platform API and web images instead of building them on the host:

```bash
docker compose -f docker-compose.public.yml pull
docker compose -f docker-compose.public.yml up -d
```

This defaults to the public `latest` images on `ghcr.io/minionenjoyer`. Set
`OPENCHAT_VERSION=0.8.47` in the shell or `.env` to pin that release. The same version tag is
published for both OpenChat images after CI passes; `sha-<commit>` tags provide immutable pins.
The public Compose stack uses the same `.env`, persistent volumes, LiveKit configuration, ports,
and reverse-proxy topology as the source-build stack.

When the repository has `DOCKERHUB_USERNAME` and `DOCKERHUB_NAMESPACE` variables plus a
`DOCKERHUB_TOKEN` secret, the release workflow also mirrors the exact GHCR digest to Docker Hub.
The token should be a dedicated Docker Hub personal or organization access token with read/write
permission for `openchat-api` and `openchat-web`. Consumers can select those mirrors without
editing Compose:

```bash
OPENCHAT_API_IMAGE=<dockerhub-namespace>/openchat-api \
OPENCHAT_WEB_IMAGE=<dockerhub-namespace>/openchat-web \
docker compose -f docker-compose.public.yml pull
```

The API applies database migrations automatically on start (`prisma migrate deploy`). Check it:

```bash
docker compose ps
docker compose logs --tail=30 api        # look for "Nest application successfully started"
```

Then browse to your chat domain (through the reverse proxy). Log in via Authentik.

## Local development (without Docker)

Run the two apps directly against your own Postgres/Redis:

```bash
# backend
cd apps/api
npm install
export DATABASE_URL=postgresql://chat:chat@localhost:5432/chat   # or set it in .env
npx prisma generate && npx prisma migrate deploy
npm run start:dev            # http://localhost:3001

# frontend (separate terminal)
cd apps/web
npm install
npm run dev                  # http://localhost:3000, proxied to the API
```

## Troubleshooting

- **Login 500 / OIDC discovery fails from the container:** the service hosts resolve to a public
  edge the container can't reach. Set `LAN_HOST_IP` + `AUTH_HOST/SHARE_HOST/WATCH_HOST/CHAT_HOST`
  in `.env`; compose pins them to the LAN reverse proxy via `extra_hosts`.
- **Voice connects but audio drops out:** ensure LiveKit uses a single UDP port (the template
  sets `udp_port: 50000`) and that your edge forwards **UDP 50000** + **TCP 7881** to the host.
  See [DEPLOY.md](DEPLOY.md) and the media-topology notes.
- **GIF button missing:** `GIPHY_API_KEY` is empty — set it and restart the API.
- **Uploads return 502:** confirm OpenChat and OpenShare have the same `SHARE_API_KEY`, OpenChat can
  reach `SHARE_BASE_URL` from the API container, and OpenShare supports `/api/assets` or the legacy
  `/upload` endpoint. Clients never call OpenShare's dev-login route.
- **Patreon option says the host is not configured:** confirm every `PATREON_*` value is present,
  the redirect URI exactly matches the Patreon OAuth client, and the API was restarted.

Next: **[DEPLOY.md](DEPLOY.md)** — pushing to git and running live updates on the server.
