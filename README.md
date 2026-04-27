# Castiel "Lulu" Grey Butay — A Little Biography

A small, lovingly hand-crafted biography website for my baby son. Single page, owner-editable, photos and stories live on a tiny self-hosted backend.

> _Screenshot placeholder — add `screenshots/home.png` and reference it here._

## What this is

- A single-page React + CSS site with no build step (React and Babel load from a CDN, JSX is compiled in the browser).
- A tiny **PocketBase** backend (one Go binary + SQLite) holds the editable content, photos, and guestbook entries.
- Owners sign in with a real email + password. Visitors see the same content read-only, and can sign the guestbook.
- Designed to be self-hosted on a small server (e.g. a Mac mini at home) using Docker Compose + nginx + PocketBase.

## Tech stack

- **React 18.3.1** — loaded from `unpkg.com` (CDN, with SRI hashes).
- **Babel standalone 7.29.0** — compiles JSX in the browser. No Node build pipeline.
- **Vanilla CSS** with light/dark theme via CSS variables.
- **PocketBase v0.37** — single-binary Go server with SQLite, auth, file uploads, REST API, and an admin UI.
- **nginx (alpine)** — serves the static frontend and reverse-proxies `/api/` and `/_/` to PocketBase.
- **Docker Compose** — two services: `web` (nginx) and `pb` (PocketBase).

### Architecture at a glance

```
                          ┌────────────────────────────────────────┐
                          │           Docker Compose stack          │
                          │                                          │
   browser → :HOST_PORT → │  web (nginx)  ───── /api, /_ proxy ───→ │  pb (PocketBase)
                          │   - serves static index.html, css, jsx   │   - SQLite at /pb/pb_data
                          │   - same-origin proxy to pb              │   - file uploads at /pb/pb_data/storage
                          │                                          │
                          └────────────────────────────────────────┘
```

The frontend talks to PocketBase via `/api/...` (same origin, no CORS, no extra CSP rules). Photos served by PocketBase live at `/api/files/{collection}/{record}/{filename}`.

## Quickstart — dev instance (your laptop)

You need Docker Desktop or Colima running.

```sh
# 1. Bring everything up
docker compose up --build

# 2. (first run only) create your owner account in PocketBase's admin UI
open http://localhost:8080/_/        # or paste the URL into a browser
# follow the first-run prompts to set your email + password

# 3. Open the site
open http://localhost:8080/
```

That's it. Click the 🔒 in the top-right, sign in with the credentials you just made, and you're in edit mode. Visitors hitting the same URL see the read-only view.

Stop with `Ctrl+C`, or `docker compose down` if you ran detached.

> **Note on `pb_data/`:** the directory is bind-mounted from the host so your SQLite file and uploaded photos live alongside your repo. It is gitignored — don't commit it. It also can't be safely shared between machines without copying the whole directory.

### Talking to the API directly

Sanity checks while the stack is up:

```sh
curl http://localhost:8080/api/health
curl 'http://localhost:8080/api/collections/content/records?perPage=1' | head -c 200
curl 'http://localhost:8080/api/collections/guestbook/records?sort=-created'
```

Anyone can post to the guestbook (no auth — that's by design):

```sh
curl -X POST http://localhost:8080/api/collections/guestbook/records \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","body":"Hello, Lulu!"}'
```

## Production — Mac mini headless server

Same compose, just on the server. Assumes Docker Desktop or [Colima](https://github.com/abiosoft/colima) is installed and you have SSH access.

### First-time bring-up

```sh
ssh mac-mini
git clone <this-repo-url> grey_website
cd grey_website

# Optional — change the port (default is 8080)
cp .env.example .env
$EDITOR .env

# Bring both services up in the background
docker compose up -d --build

# Confirm both are healthy
docker compose ps
curl -I http://localhost:8080            # expect 200 OK
curl http://localhost:8080/api/health    # expect "API is healthy"

# Tail logs (Ctrl+C to detach — services keep running)
docker compose logs -f
```

### Create the first owner account

PocketBase needs at least one superuser before you can sign in to edit. Two options:

**Option A — admin UI (easier, requires you to reach the site once):**

```sh
# from a machine on the same network, in a browser:
open "http://<mac-mini-ip>:8080/_/"
# follow the first-run prompts
```

**Option B — CLI (good for headless setups):**

```sh
docker compose exec pb pocketbase superuser upsert you@example.com 'a-strong-password'
```

After that, navigate to `http://<mac-mini-ip>:8080/`, click the 🔒, and sign in with the same credentials.

### Updating

```sh
cd grey_website
git pull
docker compose up -d --build
```

Compose detects the rebuilt image and recreates the container. Migrations in `pb/pb_migrations/` run automatically on `pb` startup; new migrations are applied, already-applied ones are skipped.

### Backup

PocketBase keeps everything (SQLite db, uploaded files, settings) under `./pb_data/`. Backup is one `tar`:

```sh
# Stop briefly to get a consistent snapshot (sub-second downtime)
docker compose stop pb
tar -czf "castiel-pb-$(date +%F).tgz" pb_data/
docker compose start pb
```

Or, for a hot backup (PB uses SQLite WAL — usually safe but a stop-restart is more conservative):

```sh
tar -czf "castiel-pb-$(date +%F).tgz" pb_data/
```

Restore on any machine:

```sh
docker compose down
rm -rf pb_data/
tar -xzf castiel-pb-YYYY-MM-DD.tgz
docker compose up -d --build
```

> **Sync to off-site backup:** add a cron job that `rsync`s `pb_data/` (or the tarballs) to a NAS / cloud bucket. The site and uploads are tiny — well under 100 MB until thousands of photos.

### Exposing to the LAN

By default the container binds to all interfaces on the host. To reach the site from another device on your network, browse to `http://<mac-mini-LAN-ip>:8080`. Find the IP with `ipconfig getifaddr en0` on the Mac mini.

If you want loopback only, change the port mapping in `docker-compose.yml` to `"127.0.0.1:${HOST_PORT:-8080}:80"`.

### Optional: HTTPS + a real domain via Caddy reverse proxy

The default compose intentionally does not include TLS — TLS needs a real domain pointed at the box. The simplest add-on is [Caddy](https://caddyserver.com/), which auto-issues Let's Encrypt certificates.

Append a third service to `docker-compose.yml`:

```yaml
  caddy:
    image: caddy:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

volumes:
  caddy_data:
  caddy_config:
```

…and a `Caddyfile` next to it:

```caddy
yourdomain.example {
  reverse_proxy web:80
  encode gzip
}
```

Point your domain's A/AAAA record at the Mac mini's public IP (and forward 80/443 through your router if you're behind NAT). Caddy will obtain a cert on first request.

If you add Caddy, change the `web` service to `expose: ["80"]` instead of `ports:` so only Caddy is reachable from outside.

## Editing content

- Click the 🔒 in the top-right, enter your superuser email + password.
- Edit any text inline. Edits are debounced and saved to PocketBase 400 ms after you stop typing.
- Drop or pick a new photo on any photo card to upload it (multipart upload to PocketBase).
- The Tweaks panel (visual settings) is still per-visitor — those preferences live in `localStorage`, not the backend.
- Lock the site again with the ✎ button.

To reset everything, edit records directly in the PocketBase admin at `/_/`.

## Project structure

```
.
├── index.html             # entry — loads React + Babel + Google Fonts, mounts <App />
├── app.jsx                # all components + tiny PocketBase API client
├── styles.css             # all styling, theme variables, layout
├── tweaks-panel.jsx       # design-tweaks panel shell (localStorage state)
├── nginx.conf             # production server config (gzip, cache, CSP, /api + /_ proxy, SPA fallback)
├── Dockerfile             # frontend image (nginx:alpine + static assets)
├── docker-compose.yml     # web + pb services
├── .dockerignore
├── .env.example           # HOST_PORT
├── pb/
│   ├── Dockerfile         # PocketBase image (alpine + downloaded PB binary)
│   └── pb_migrations/
│       └── 0001_init.js   # creates content/photos/guestbook collections + seed
├── pb_data/               # PB SQLite db + uploaded files (gitignored, bind-mounted)
├── CLAUDE.md              # AI-assistant guidance (Claude Code)
├── GEMINI.md              # AI-assistant guidance (Gemini)
├── HANDOFF_PROMPT.md      # original productionization brief
└── README.md
```

## Roadmap / known limitations

- **The passcode is gone — auth is real now.** Anyone with your superuser credentials can edit. Use a strong password and don't reuse it.
- **The guestbook is open.** Anyone who can reach the site can post. Add basic moderation by reading entries from the PB admin UI and deleting unwanted ones.
- **No rate limit.** PocketBase has built-in basic rate limits but for a public-facing deploy you'll want a reverse proxy (Caddy / nginx LB) with stricter limits in front.
- **CDN dependency.** React and Babel come from `unpkg.com`; if it's unreachable, the site won't render. Vendoring those scripts locally is straightforward when you outgrow it.
- **`'unsafe-eval'` and `'unsafe-inline'` in CSP.** Both are required because Babel compiles JSX at runtime via `Function()` and injects the compiled output as inline `<script>` blocks. Removing either means moving to a real bundler.

## License

TBD.
