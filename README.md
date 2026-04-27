# Castiel "Lulu" Grey Butay — A Little Biography

A small, lovingly hand-crafted biography website for my baby son. Single page, owner-editable, photos and stories live in your browser.

> _Screenshot placeholder — add `screenshots/home.png` and reference it here._

## What this is

- A single-page React + CSS site with no build step (React and Babel load from a CDN, JSX is compiled in the browser).
- All content — text, photos, guestbook entries — is stored in the browser's `localStorage`. There is no backend.
- Owner edit mode is gated by a soft passcode — visitors see a read-only view.
- Designed to be self-hosted on a small server (e.g. a Mac mini at home) using Docker Compose + nginx.

## Tech stack

- **React 18.3.1** — loaded from `unpkg.com` (CDN, with SRI hashes).
- **Babel standalone 7.29.0** — compiles JSX in the browser. No Node build pipeline.
- **Vanilla CSS** with light/dark theme via CSS variables.
- **localStorage** for persistence (no database).
- **nginx (alpine)** as the production static-file server.
- **Docker Compose** for the deploy.

## Quickstart — run locally (no Docker)

The simplest path is a tiny static server in the project root. Pick whichever you have:

```sh
# Python 3 (preinstalled on macOS)
python3 -m http.server 8080

# or with npx (no install)
npx serve . -l 8080
```

Then visit <http://localhost:8080>.

> Opening `index.html` directly via `file://` _mostly_ works but some browsers block CDN scripts or local subresources due to CORS. Use a local server instead.

## Run with Docker locally

```sh
cp .env.example .env  # optional — only if you want to change HOST_PORT
docker compose up --build
```

Visit <http://localhost:8080> (or whatever `HOST_PORT` you set).

Stop with `Ctrl+C`, or `docker compose down` if you ran detached.

## Deploy to a Mac mini headless server

The site is a static bundle behind nginx. The compose file is Apple-Silicon-friendly (`nginx:alpine` has a `linux/arm64` build).

Assumes Docker Desktop or [Colima](https://github.com/abiosoft/colima) is running on the Mac mini and you have SSH access.

```sh
# 1. Clone on the Mac mini
ssh mac-mini
git clone <this-repo-url> grey_website
cd grey_website

# 2. Set the host port (only if you want something other than 8080)
cp .env.example .env
$EDITOR .env

# 3. Bring the site up in the background
docker compose up -d --build

# 4. Sanity-check it's serving
curl -I http://localhost:8080      # expect: HTTP/1.1 200 OK
docker compose ps                  # expect the "web" service "Up" (healthy)

# 5. Tail logs
docker compose logs -f web
```

### Updating

```sh
cd grey_website
git pull
docker compose up -d --build
```

Compose detects the rebuilt image and recreates the container.

### Exposing to the LAN

By default the container binds to whichever interface Docker exposes — usually all interfaces. To reach the site from another device on your network, browse to `http://<mac-mini-LAN-ip>:8080`. (Find the IP with `ipconfig getifaddr en0` on the Mac mini.)

If you only want loopback access, change the port mapping in `docker-compose.yml` to `"127.0.0.1:${HOST_PORT:-8080}:80"`.

### Optional: HTTPS + a real domain via Caddy reverse proxy

The default compose intentionally does not include TLS — TLS needs a real domain pointed at the box. The simplest add-on is [Caddy](https://caddyserver.com/), which auto-issues Let's Encrypt certificates.

Append a second service to `docker-compose.yml`:

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

…and create a `Caddyfile` next to it:

```caddy
yourdomain.example {
  reverse_proxy web:80
  encode gzip
}
```

Point your domain's A/AAAA record at the Mac mini's public IP (and forward 80/443 through your router if you're behind NAT). Caddy will obtain a cert on first request.

If you add Caddy, change the `web` service's `ports:` to `expose: ["80"]` so only Caddy is reachable from outside.

## Editing content

- **Owner passcode** is hardcoded in `app.jsx` — search for `PASSCODE` (currently `lulu1116`). Change the string and rebuild (`docker compose up -d --build`) to rotate it.
- Open the site, click the lock affordance, enter the passcode → edit mode unlocks. Edits are saved to your browser's `localStorage` and **stay on that device only**.
- Same passcode unlocks the **Tweaks panel**, which lets you tune visual settings live; tweaks also persist per-browser.

## Project structure

```
.
├── index.html        # entry — loads React + Babel + Google Fonts, mounts <App />
├── app.jsx           # all components (Hero, About, Stats, Timeline, Gallery, Family, Letter, Routine, Wishes, Guestbook, LockModal, TweaksPanel)
├── styles.css        # all styling, theme variables, layout
├── tweaks-panel.jsx  # design-tweaks panel shell
├── nginx.conf        # production server config (gzip, cache, CSP, SPA fallback)
├── Dockerfile        # nginx:alpine + static assets
├── docker-compose.yml
├── .dockerignore
├── .env.example      # HOST_PORT
├── CLAUDE.md         # AI-assistant guidance (Claude Code)
├── GEMINI.md         # AI-assistant guidance (Gemini)
├── HANDOFF_PROMPT.md # original productionization brief
└── README.md
```

## Roadmap / known limitations

- **localStorage is per-device.** Edits on the Mac mini's browser are not visible from your laptop. A real backend (small SQLite + a tiny API) is the next step if you want cross-device sync.
- **The passcode is client-side only.** Anyone with the passcode — or with browser DevTools open — can flip into edit mode. It's a soft lock, not authentication.
- **No backend = no rate limit, no spam protection** for guestbook entries beyond what the browser session enforces.
- **CDN dependency.** React and Babel come from `unpkg.com`; if it's unreachable, the site won't render. Vendoring those scripts locally is straightforward when you outgrow it.
- **`'unsafe-eval'` and `'unsafe-inline'` in CSP.** Both are required because Babel compiles JSX at runtime via `Function()` and injects the compiled output as inline `<script>` blocks. Removing either means moving to a real bundler.

## License

TBD.
