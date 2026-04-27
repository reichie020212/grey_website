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

## Architecture at a glance

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

---

## Prerequisites

Both local development and production deployment need the same handful of things:

| Requirement | Notes |
|---|---|
| **Docker** | Docker Desktop ≥ 24, [Colima](https://github.com/abiosoft/colima), or any modern engine with Compose v2. `docker compose version` should print `v2.x` or newer. |
| **Disk** | ~150 MB for the two images, plus whatever your photos take up in `pb_data/`. |
| **Free port** | Default is **8080** on the host; configurable via `HOST_PORT` in `.env`. |
| **Architecture** | Both images build natively for `linux/amd64` and `linux/arm64`. Apple Silicon Mac minis are fine. |

---

## Local development (dev instance)

This is what to run on your laptop while iterating on the code. Everything runs in Docker — there is no Node/Go toolchain required on the host.

### First-time setup

```sh
git clone <this-repo-url> grey_website
cd grey_website

docker compose up --build
```

You should see Docker build both images, then both containers report healthy:

```
 ✔ Container castiel-pb    Healthy
 ✔ Container castiel-site  Healthy
```

In another terminal (the first one is now tailing logs):

```sh
curl http://localhost:8080/             # the static index.html
curl http://localhost:8080/api/health   # {"message":"API is healthy.","code":200,"data":{}}
```

### Create your owner account

PocketBase needs at least one **superuser** before you can sign in to edit. On a laptop, the easiest path is the admin UI's first-run wizard:

```sh
open http://localhost:8080/_/    # macOS — or paste into a browser
```

Fill in an email + password and submit. Then go to <http://localhost:8080/>, click the 🔒 in the top-right, and sign in with the same credentials. The icon flips to ✎ and you're in edit mode.

> **CLI alternative** — if your browser can't reach `/_/` for some reason:
> ```sh
> docker compose exec pb pocketbase superuser upsert you@example.com 'a-strong-password'
> ```

### Daily workflow

```sh
# Start (detached so the terminal is free)
docker compose up -d

# Tail logs from one or both services
docker compose logs -f             # both
docker compose logs -f web         # nginx only
docker compose logs -f pb          # pocketbase only

# Stop
docker compose down                # stop AND remove containers
docker compose stop                # just stop, keep containers around for fast restart

# Status
docker compose ps                  # both should report "Up X (healthy)"
```

### Editing the code

The frontend has no build step — but the static files are baked into the `web` image at build time, so a rebuild is required to pick up edits.

- **Frontend files** (`app.jsx`, `styles.css`, `index.html`, `tweaks-panel.jsx`):
  ```sh
  docker compose up -d --build web
  ```
  After that, a normal browser reload picks up the new code (`.jsx` and `.css` are served `Cache-Control: no-cache` so the browser revalidates every time).
- **`nginx.conf`**: same flow — edit, then `docker compose up -d --build web`.
- **PocketBase migrations** (`pb/pb_migrations/*.js`): the directory is bind-mounted read-only into the `pb` container, so you don't have to rebuild. Restart `pb` to apply: `docker compose restart pb`. Already-applied migrations are skipped automatically.
- **Schema changes after first deploy**: do **not** edit `0001_init.js` — PB recorded that it ran. Add `0002_…js`, `0003_…js`, etc. for changes.

### Starting over (wipe local data)

When you want a clean slate (e.g. you changed `0001_init.js` while still iterating, or want to re-test the first-run flow):

```sh
docker compose down
rm -rf pb_data
docker compose up --build
```

`pb_data/` is gitignored — wiping it only loses your local edits and uploaded photos.

### Common gotchas

- **Port 8080 already in use.** Set a different port:
  ```sh
  cp .env.example .env
  echo 'HOST_PORT=9080' > .env
  docker compose up -d --build
  ```
- **Browser still showing old code after edit.** Shouldn't happen — `.jsx` and `.css` are `no-cache`. If it does, hard-reload (Cmd-Shift-R / Ctrl-Shift-R) bypasses any sticky session cache.
- **`save failed: 403 Forbidden` flash right after first login.** Cosmetic — the next save (your next edit) succeeds. The pill clears as soon as a real edit lands.
- **Babel "precompile for production" warning in console.** Expected. It's the in-browser Babel telling you it's slower than a real bundler. Safe to ignore for this site.

---

## Production — Mac mini headless server

The same compose, just on a small always-on server. These instructions assume:

- A Mac mini (Apple Silicon or Intel) running macOS, with **SSH enabled** (System Settings → General → Sharing → Remote Login).
- **Docker Desktop** or **Colima** installed and configured to start at login.
- A user with `sudo` if you need to install Docker.
- ~1 GB free disk to start (images + a comfortable `pb_data/` headroom).

### First-time deployment

```sh
ssh mac-mini
git clone <this-repo-url> grey_website
cd grey_website

# Optional — change the host port (default 8080)
cp .env.example .env
$EDITOR .env

# Build both images and start in the background
docker compose up -d --build
```

Expected end-of-build output:

```
 ✔ web       Built
 ✔ pb        Built
 ✔ Network   Created
 ✔ Container castiel-pb    Started
 ✔ Container castiel-site  Started
```

### Verifying the deployment

Run all four checks — every one should pass before you consider the deploy done.

```sh
# 1. Both services healthy
docker compose ps
#    expect: "Up X (healthy)" for both castiel-pb and castiel-site

# 2. Frontend serving
curl -I http://localhost:8080/
#    expect: HTTP/1.1 200 OK, Content-Type: text/html

# 3. PocketBase API healthy through the proxy
curl http://localhost:8080/api/health
#    expect: {"message":"API is healthy.","code":200,"data":{}}

# 4. Seeded content present
curl 'http://localhost:8080/api/collections/content/records?perPage=1' | head -c 80
#    expect: a JSON object starting with {"items":[{"collectionId":...
```

If any of the four fails, jump to [Troubleshooting](#troubleshooting).

### Create the first owner account (CLI — recommended for headless)

```sh
docker compose exec pb pocketbase superuser upsert you@example.com 'a-strong-password'
#    expect: Successfully saved superuser "you@example.com"!
```

> **Pick a strong password.** It's the one credential between visitors and edit access — there is no second factor, no rate-limited brute-force protection beyond PocketBase's small built-in throttle, and no recovery flow if you lose it. A long passphrase managed by a password manager is the right shape.

If you'd rather use the admin UI, point a browser on the same LAN at `http://<mac-mini-ip>:8080/_/` and follow the first-run prompts. The CLI is just safer for fully-headless setups.

### Networking — making it reachable

By default the host binds **all interfaces** on `HOST_PORT`, so the site is reachable on the Mac mini's LAN IP without further configuration.

**Find the Mac mini's IP (run on the Mac mini):**

```sh
ipconfig getifaddr en0    # wired
ipconfig getifaddr en1    # wifi (try both)
```

Then from any device on the same network: `http://<mac-mini-ip>:8080/`.

**Loopback only** (only the Mac mini itself can reach it — useful while you're still testing):

Edit `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:${HOST_PORT:-8080}:80"
```

Then `docker compose up -d`.

**Exposing to the public internet:**

1. Set up port forwarding on your router: external `:80`/`:443` → Mac mini IP.
2. **Don't expose `:8080` directly.** Plain HTTP plus your superuser password over the open internet is asking for trouble — terminate TLS in front. See [HTTPS + a real domain via Caddy](#optional-https--a-real-domain-via-caddy) below.
3. Consider a dynamic-DNS provider if your home IP isn't static.

### Updating

To pull the latest code and rebuild:

```sh
cd grey_website
git pull
docker compose up -d --build
```

Compose detects the rebuilt image, recreates the container, and rolls in the new version. Migrations run automatically on `pb` startup; already-applied ones are skipped.

If the update fails health checks, roll back:

```sh
git reset --hard HEAD~1
docker compose up -d --build
```

### Bumping the PocketBase version

Edit `pb/Dockerfile`:

```dockerfile
ARG PB_VERSION=0.37.4    # change to the version you want
```

Then `docker compose up -d --build pb`. Read the [PocketBase release notes](https://github.com/pocketbase/pocketbase/releases) before bumping across a major (e.g. v0.37 → v0.38) — collection-rule syntax has occasionally changed between majors.

### Logs and observability

```sh
docker compose logs -f            # live tail, both services
docker compose logs --since 1h    # last hour, no follow
docker compose logs pb | tail -200

# Inspect a container's healthcheck history
docker inspect --format '{{json .State.Health}}' castiel-pb | python3 -m json.tool
```

### Auto-start on reboot

`restart: unless-stopped` is set on both services in `docker-compose.yml`, so they'll come back up after a reboot **as long as the Docker daemon is running**.

- **Docker Desktop**: Settings → General → "Open Docker Desktop when you log in".
- **Colima**: enable a launchd service:
  ```sh
  brew services start colima
  ```

If your Mac mini reboots and the site stays down, it's almost always because Docker itself didn't auto-start — fix the daemon's startup, not the compose file.

### Backups

Everything PocketBase needs lives in `./pb_data/` on the host: the SQLite database, every uploaded photo, and the PB settings. Backup is one `tar`.

**Manual snapshot:**

```sh
# Brief stop for a fully-consistent SQLite snapshot (sub-second downtime)
docker compose stop pb
tar -czf "castiel-pb-$(date +%F).tgz" pb_data/
docker compose start pb
```

For a hot snapshot without stopping (PB uses SQLite WAL mode — usually safe):

```sh
tar -czf "castiel-pb-$(date +%F).tgz" pb_data/
```

**Scheduled daily backups (cron):**

```sh
# crontab -e on the Mac mini
0 3 * * * cd /Users/you/grey_website && /usr/bin/tar -czf /Users/you/backups/castiel-pb-$(date +\%F).tgz pb_data/ && find /Users/you/backups -name 'castiel-pb-*.tgz' -mtime +30 -delete
```

That snapshots at 03:00, keeps 30 days. If you want consistency over uptime, prefix with `docker compose -f /Users/you/grey_website/docker-compose.yml stop pb &&` and suffix with `&& docker compose -f /Users/you/grey_website/docker-compose.yml start pb`.

**Off-site sync:** add a second cron job that `rsync`s `~/backups/` to a NAS, `restic`s to S3, or whatever you have:

```sh
30 3 * * * /usr/bin/rsync -a --delete /Users/you/backups/ user@nas:/volume1/grey_website-backups/
```

**Restore drill** (do this _once_ to a separate machine to confirm your backups work):

```sh
git clone <repo-url> grey_website-restore-test
cd grey_website-restore-test
tar -xzf path/to/castiel-pb-YYYY-MM-DD.tgz   # extracts into ./pb_data/
docker compose up -d --build
curl http://localhost:8080/api/health        # should be healthy
# log in with the same credentials, confirm content is intact
```

### Optional: HTTPS + a real domain via Caddy

The default compose intentionally does not include TLS — TLS needs a real domain pointed at the box. The simplest add-on is [Caddy](https://caddyserver.com/), which auto-issues Let's Encrypt certificates.

1. Append a third service to `docker-compose.yml`:

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

2. Create a `Caddyfile` next to it:

   ```caddy
   yourdomain.example {
     reverse_proxy web:80
     encode gzip
   }
   ```

3. Change the `web` service from `ports:` to `expose: ["80"]` so only Caddy is reachable from outside.

4. Point your domain's A/AAAA record at the Mac mini's public IP, forward `:80` and `:443` through your router, and `docker compose up -d --build`. Caddy obtains a cert on the first request.

### Security checklist

Before you point a real domain at the Mac mini:

- [ ] Strong superuser password — long passphrase, password-manager-managed.
- [ ] HTTPS terminating in front of `web` (Caddy or any other reverse proxy).
- [ ] `:8080` not exposed directly to the internet (router only forwards to Caddy).
- [ ] Daily backups running and copied off-site.
- [ ] `git status` on the deploy clean — no uncommitted edits to ship surprise behavior.
- [ ] Backup encryption if backups leave your home network (`gpg`, `restic`, or your sync provider's encryption).
- [ ] Mac mini auto-updates enabled (System Settings → General → Software Update).
- [ ] PocketBase version pinned in `pb/Dockerfile` — bump deliberately, not on every rebuild.

---

## Editing content

- Click the 🔒 in the top-right, enter your superuser email + password.
- Edit any text inline. Edits are debounced and saved to PocketBase 400 ms after you stop typing.
- Drop or pick a new photo on any photo card to upload it (multipart upload to PocketBase).
- The Tweaks panel (visual settings) is per-visitor — those preferences live in `localStorage`, not the backend.
- Lock the site again with the ✎ button.

To reset everything, edit records directly in the PocketBase admin at `/_/`.

## API at a glance

All endpoints are PocketBase v0.37 standard. nginx proxies `/api/...` and `/_/...` to the `pb` service.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check (used by Docker healthcheck and your `curl` smoke test). |
| `GET` | `/api/collections/content/records?perPage=1` | — | Load the singleton content blob. |
| `PATCH` | `/api/collections/content/records/{id}` | superuser | Save the content blob. |
| `GET` | `/api/collections/photos/records?perPage=200` | — | List photos (frontend reduces to slot → URL map). |
| `POST` | `/api/collections/photos/records` (multipart) | superuser | Upload a new photo for a slot. |
| `PATCH` | `/api/collections/photos/records/{id}` (multipart) | superuser | Replace the photo for an existing slot. |
| `GET` | `/api/collections/guestbook/records?sort=-created` | — | List guestbook entries, newest first. |
| `POST` | `/api/collections/guestbook/records` | — (open) | Sign the guestbook. |
| `DELETE` | `/api/collections/guestbook/records/{id}` | superuser | Moderate (delete) a guestbook entry. |
| `POST` | `/api/collections/_superusers/auth-with-password` | — | Owner sign-in. Returns a JWT. |
| `POST` | `/api/collections/_superusers/auth-refresh` | superuser | Used on app startup to drop stale tokens. |
| `GET` | `/api/files/{collection}/{record}/{file}` | — | Download an uploaded photo. |
| `GET` | `/_/` | — (UI auth) | PocketBase admin UI. |

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
├── .gitignore
├── .env.example           # HOST_PORT
├── pb/
│   ├── Dockerfile         # PocketBase image (alpine + downloaded PB binary, pinned via PB_VERSION arg)
│   └── pb_migrations/
│       └── 0001_init.js   # creates content/photos/guestbook collections + seed
├── pb_data/               # PB SQLite db + uploaded files (gitignored, bind-mounted at runtime)
├── CLAUDE.md              # AI-assistant guidance (Claude Code)
├── GEMINI.md              # AI-assistant guidance (Gemini)
├── HANDOFF_PROMPT.md      # original productionization brief (historical record)
└── README.md
```

## Troubleshooting

**`docker compose up` exits with `port is already allocated` on 8080.**
Another process is bound to the same port. Pick a free one in `.env`: `HOST_PORT=9080`. To find the culprit: `lsof -nP -iTCP:8080 -sTCP:LISTEN` on Linux/macOS.

**`castiel-pb` keeps restarting / unhealthy.**
Tail the logs: `docker compose logs pb | tail -50`. Most common cause is a syntax error in a migration file (`0002_*.js`, etc.). PB prints the line number. Fix the file, then `docker compose restart pb`. If a half-applied migration left the DB inconsistent, wipe `pb_data/` and start over (only safe in dev).

**`curl http://localhost:8080/api/health` returns HTML instead of JSON.**
Something else on the host (a stray nginx, an Odoo, etc.) is shadowing the bind on `:8080`. Either stop it or set a different `HOST_PORT`.

**Browser shows old content after editing `app.jsx`.**
Did you rebuild the `web` image? `docker compose up -d --build web`. The static files are baked into the image at build time, not bind-mounted.

**`save failed: 403 Forbidden` after I'm signed in.**
Refresh the page once. PB tokens have a generous TTL but if your laptop slept overnight the stored token may be expired. If it persists, hit the lock again and re-enter credentials.

**Locked out of `/_/` admin (forgot superuser password).**
Recover from the Mac mini shell:
```sh
docker compose exec pb pocketbase superuser update-password your@email '<new-password>'
```
Or upsert with `pocketbase superuser upsert your@email '<new-password>'` to overwrite.

**`pocketbase superuser ...` prints `Error: ... record not found`.**
You're trying `update-password` on an account that doesn't exist. Use `upsert` instead — it creates if missing.

**Photo upload returns `413 Request Entity Too Large`.**
nginx's `client_max_body_size` is 15 MB. Either resize the photo or bump the limit in `nginx.conf` and rebuild.

**`yourdomain.example` (Caddy) won't get a cert.**
1. DNS A/AAAA record actually points at your home IP? `dig yourdomain.example` from somewhere off-LAN.
2. Router forwards `:80` and `:443` to the Mac mini? Let's Encrypt validates over HTTP/HTTPS.
3. Caddy logs: `docker compose logs caddy`. Rate limits and DNS-validation errors are usually obvious there.

## Roadmap / known limitations

- **The passcode is gone — auth is real now.** Anyone with your superuser credentials can edit. Use a strong password and don't reuse it.
- **The guestbook is open.** Anyone who can reach the site can post. Moderate by deleting entries from the PB admin UI at `/_/`.
- **No rate limit beyond PB's defaults.** For a public-facing deploy you'll want a reverse proxy (Caddy with a `rate_limit` directive, or a CDN) with stricter limits in front.
- **CDN dependency.** React and Babel come from `unpkg.com`; if it's unreachable, the site won't render. Vendoring those scripts locally is straightforward when you outgrow it.
- **`'unsafe-eval'` and `'unsafe-inline'` in CSP.** Both are required because Babel compiles JSX at runtime via `Function()` and injects the compiled output as inline `<script>` blocks. Removing either means moving to a real bundler.
- **Single-instance deploy.** No HA, no read replicas. The Mac mini going offline = the site going offline. For a baby biography on a home network, that's fine.

## License

TBD.
