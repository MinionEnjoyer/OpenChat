# Deploy & update

The workflow: **develop locally → clean → push to git → the server pulls and rebuilds.**
After the one-time setup, every future change goes live with `git push` here + a deploy on the
server.

For production mobile push credentials and the required Android/iOS acceptance
test, follow [`PRODUCTION-PUSH-ENABLEMENT.md`](PRODUCTION-PUSH-ENABLEMENT.md).

> Examples below assume the app lives in `/opt/chat` on your server and you run the commands there.
> Substitute your own host and paths.

---

## The golden rule

Real secrets and personal data live **only** in the server's local `.env` (and the `livekit.yaml`
rendered from it). These are gitignored and are never pushed or pulled. Git only ever carries
code + templates. That is what lets you push freely without leaking anything.

---

## A. Clean — verify no secrets before pushing

From the repo root, every time before you push:

```bash
./scripts/check-secrets.sh
```

It fails if `.env`, `livekit.yaml`, or any obvious secret/public-IP is tracked. Fix anything it
flags. To untrack a file that slipped in:

```bash
git rm --cached <file>        # then commit the removal
```

## B. First-time git setup (once)

```bash
# in the repo root
git init
git add -A
./scripts/check-secrets.sh        # must pass
git commit -m "OpenChat: initial import"
git branch -M main

# create the remote (private!) and push — pick one:
gh repo create openchat --private --source=. --push        # GitHub CLI
# — or —
git remote add origin git@github.com:<you>/openchat.git
git push -u origin main
```

Keep the repo **private** — it describes your infrastructure even though it holds no secrets.

## C. First-time server setup (once) — convert the live host to a git checkout

The server currently holds the app files plus the live `.env` / `livekit.yaml` / database volumes.
Turn its app directory into a git checkout **without** disturbing those local files:

```bash
cd /opt/chat

# 1) Safety backup of the whole directory (excluding data volumes, which live in Docker).
sudo tar --exclude=postgres-data --exclude=redis-data -czf /root/chat-backup-$(date +%s).tar.gz .

# 2) Initialise git in place and attach the remote.
sudo git init
sudo git remote add origin <your-remote-url>
sudo git fetch origin

# 3) Adopt the pushed tree. .env, livekit.yaml, and volumes are gitignored, so they are LEFT
#    untouched — only tracked files are reset to match the repo.
sudo git checkout -f -b main origin/main

# 4) Sanity check: your secrets are still there and untracked.
ls -la .env livekit.yaml
git status --short          # .env / livekit.yaml must NOT appear
```

If `git status` shows `.env` or `livekit.yaml`, stop — the `.gitignore` didn't apply; do not commit.

**Add the deployment vars to the server's `.env`.** `docker-compose.yml` now reads these from
`.env` with *generic* defaults (real IPs are kept out of git), so the server must supply its own:

```bash
# append to /opt/chat/.env if not already present — use YOUR real values
LAN_HOST_IP=192.168.1.10        # the LAN IP of the reverse-proxy host
WEB_PORT=8810                    # host port the web container binds
# CHAT_HOST/AUTH_HOST/SHARE_HOST/WATCH_HOST already default to *.example.com
```

Without `LAN_HOST_IP`, `extra_hosts` falls back to a placeholder and server-side OIDC breaks.

Then confirm the stack still builds from the checkout:

```bash
docker compose up -d --build && docker compose ps
```

## D. Ongoing updates — push here, deploy there

**On your machine:**

```bash
./scripts/check-secrets.sh
git add -A && git commit -m "describe the change"
git push
```

**On the server (`/opt/chat`):**

```bash
./scripts/deploy.sh
```

`deploy.sh` does `git pull` → `docker compose up -d --build` → prune. Migrations run
automatically when the API container starts. That's it — the push is now live.

To roll back, check out a previous commit on the server and re-run `deploy.sh`:

```bash
git checkout <good-commit-sha> && ./scripts/deploy.sh
```

## E. Optional — CI-gated auto-deploy

The systemd scaffold in `ops/systemd/` polls every five minutes. It deploys a new `main` SHA only
when the GitHub Actions workflow named `CI` has completed successfully for that exact SHA. It uses
a separate HTTPS mirror and immutable release directories, so it never pulls into the active or a
dirty checkout.

On the server, install the protected runtime configuration once:

```bash
sudo install -d -m 0750 /etc/openchat /opt/openchat-deployer /opt/chat-releases
sudo install -m 0640 /opt/chat/.env /etc/openchat/.env
sudo install -m 0640 /opt/chat/livekit.yaml /etc/openchat/livekit.yaml
sudo install -m 0640 ops/systemd/deploy.conf.example /etc/openchat/deploy.conf
```

Review `/etc/openchat/deploy.conf`, particularly the repository, health URLs, and paths. Then
create the stable public pointer. The deployer only writes the inner pointer under its narrowly
writable release directory; `/opt/chat-current` itself never needs to be writable by the service:

```bash
sudo ln -sfn "$(readlink -f /opt/chat-current)" /opt/chat-releases/current
sudo ln -sfn /opt/chat-releases/current /opt/chat-current
```

Then install the script and units:

```bash
sudo install -m 0755 ops/systemd/openchat-autodeploy.sh /usr/local/sbin/openchat-autodeploy
sudo install -m 0644 ops/systemd/openchat-autodeploy.service /etc/systemd/system/
sudo install -m 0644 ops/systemd/openchat-autodeploy.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openchat-autodeploy.timer
```

The safe check mode resolves `main`, checks the exact workflow result, and reports whether it would
deploy without changing containers or files:

```bash
sudo systemctl stop openchat-autodeploy.timer
sudo bash -c 'set -a; . /etc/openchat/deploy.conf; exec /usr/local/sbin/openchat-autodeploy --check'
sudo systemctl start openchat-autodeploy.timer
```

For normal operation and diagnostics:

```bash
systemctl list-timers openchat-autodeploy.timer
sudo systemctl start openchat-autodeploy.service
sudo journalctl -u openchat-autodeploy.service --since today
```

Before changing containers, the deployer creates a validated custom-format PostgreSQL backup in
`/opt/chat/backups`. It requires API/database/Redis health, a 200 web response, and all five
containers before atomically changing the inner `/opt/chat-releases/current` pointer. The stable
`/opt/chat-current` link resolves through it. On failure the deployer keeps the active pointer
and database backup, and attempts to restore the prior application Compose definition. It never
deletes volumes, releases, images, or backups.

## What survives a deploy

| Item | Where it lives | Touched by deploy? |
|---|---|---|
| Code + templates | git | replaced on pull |
| `.env` (secrets, IPs, passwords) | local file, gitignored | **never** |
| `livekit.yaml` (rendered) | local file, gitignored | **never** (unless you delete it) |
| Postgres / Redis data | Docker volumes | **never** |
