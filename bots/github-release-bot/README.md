# OpenChat GitHub Release Bot

An example bot on the OpenChat bot framework. It watches GitHub repos and posts a message
to a channel whenever a new release is published. Configured live, per-channel, via chat
commands — no redeploy to change what it watches.

## How it works
A bot is just an OpenChat user with `isBot=true` that authenticates with an API token. This
service uses that token to (a) connect the WebSocket and read messages in channels it's a
member of, and (b) POST release announcements. Watch config is per-channel and stored in
`data/watches.json`.

## Chat commands
- `!gh watch owner/repo` — announce new releases of that repo in this channel
- `!gh unwatch owner/repo` — stop
- `!gh list` — repos watched in this channel
- `!gh` — help

(`!gh` is configurable via `CMD_PREFIX`.) The current latest release is *not* re-announced
when you first watch a repo — only releases published afterward are posted.

## Setup
1. **Create the bot account** (as any logged-in user) and grab its token — shown once:
   ```bash
   curl -sX POST https://chat.creeger.com/api/bots \
     -H "Authorization: Bearer <your-user-token>" -H "Content-Type: application/json" \
     -d '{"username":"releasebot","displayName":"Release Bot","description":"Posts GitHub releases"}'
   ```
2. **Configure + run:**
   ```bash
   cp .env.example .env    # set BOT_TOKEN (from step 1)
   docker compose up -d --build
   ```
3. **Add the bot to a server** — either publish it (`PATCH /api/bots/:id {"published":true}`) and
   use the in-app add-bot browser, or directly:
   `POST /api/servers/<serverId>/bots/<botUserId>` (needs Manage Server).
4. In a channel the bot can see: `!gh watch owner/repo`.

## Env
See `.env.example` — `OPENCHAT_URL`, `BOT_TOKEN`, optional `GITHUB_TOKEN` (higher rate limit),
`POLL_INTERVAL_SEC`, `CMD_PREFIX`, `DATA_FILE`.
