# Claude Code Handoff Prompt — Castiel's Biography Site

Copy everything below the divider and paste it into Claude Code.

---

## Context

I have a working HTML/React prototype of a biography website for my baby son, **Castiel "Lulu" Grey Butay**. It's a single-page site built with inline React + Babel and a `tweaks-panel.jsx` helper. All content (text, photos, guestbook entries) is currently persisted to `localStorage` in the browser.

Files in the project root:

- `index.html` — entry point, loads React 18.3.1 + Babel standalone via CDN, mounts `<App />`
- `app.jsx` — all React components (Hero, About, Stats, Timeline, Gallery, Family, Letter, Routine, Wishes, Guestbook, LockModal, TweaksPanel wiring)
- `styles.css` — all styling (cream/sky/peach/sage palette, light + dark theme variables)
- `tweaks-panel.jsx` — design-tweaks shell (used for the in-page settings panel)

Owner-edit mode is gated by a passcode (currently hardcoded as `lulu1116` in `app.jsx`). Visitors see a read-only view.

## What I want you to do

Productionize this prototype so I can self-host it on my **headless Mac mini server** with **Docker Compose**, while keeping it easy to run locally during development.

### 1. Create `CLAUDE.md` and `GEMINI.md`

Both files at the project root, summarizing the project for future AI assistants. Each should include:

- **Project overview** — one paragraph: what this site is, who it's for, current stack.
- **Architecture** — file map, data flow (where content/photos live), how edit-lock works.
- **Conventions** — code style (2-space indent, no TS, React function components, inline JSX via Babel), how the Tweaks panel persists state, naming patterns.
- **What to be careful about** — don't break the `EDITMODE-BEGIN/END` JSON marker block in `app.jsx`; don't introduce build steps that would require rewriting the script tags in `index.html` unless explicitly migrating to a bundler; preserve the localStorage keys (`castiel-content-v1`, `castiel-photos-v1`, `castiel-unlocked-v1`) so existing data survives.
- **How to run** (local + Docker — link to README).
- **Testing / verification** — how to sanity-check after changes (open in browser, confirm no console errors, confirm edit-mode unlock with the passcode still works).

`GEMINI.md` can be largely the same content; tailor wording for Gemini if it helps but they can otherwise be near-mirrors.

### 2. Self-host with Docker Compose on a Mac mini server

The site is fully static (no backend yet — content is client-side localStorage). Set it up as a static site served by **nginx** (or Caddy if you prefer; pick one and explain why).

Deliverables:

- `Dockerfile` — multi-stage if needed, otherwise a simple `nginx:alpine` (or `caddy:alpine`) base that copies the static assets into the web root.
- `docker-compose.yml` — defines the web service, exposes a port (e.g. host `8080:80`), uses a named volume or bind mount only if needed, sets `restart: unless-stopped`, includes healthcheck, and is friendly to running on a Mac mini (Apple Silicon — make sure the base image works on `linux/arm64`).
- `nginx.conf` (or `Caddyfile`) — gzip on, proper cache headers (long for hashed assets if any, short for `index.html`), correct MIME types, single-page-app fallback (`try_files $uri /index.html;`), security headers (`X-Content-Type-Options`, `Referrer-Policy`, sensible `Content-Security-Policy` that allows the unpkg.com CDN scripts and Google Fonts the prototype uses).
- `.dockerignore` — exclude `node_modules`, `.git`, `*.md` for handoff/scratch, screenshots, etc.

Notes for the Mac mini:
- Assume Docker Desktop or `colima` is installed and the machine runs headless via SSH.
- Recommend running behind a reverse proxy if I want HTTPS / a real domain. Mention `caddy` as the simplest TLS option (auto-Let's Encrypt) and how I would extend the compose file to add it. Don't force it in the default compose — keep the default minimal and document the upgrade path in the README.
- Default port should be configurable via a `.env` file (`HOST_PORT=8080`).

### 3. Update / create `README.md`

Replace any existing README with one that covers:

1. **What this is** — short blurb + screenshot placeholder.
2. **Tech stack** — React 18 (CDN), Babel standalone (in-browser), vanilla CSS, localStorage persistence, nginx for serving.
3. **Quickstart — run locally** — two options:
   - simplest: open `index.html` directly (note CORS caveats with file://) OR
   - recommended: `python3 -m http.server 8080` (or `npx serve .`) and visit `http://localhost:8080`.
4. **Run with Docker locally** — `docker compose up --build`, visit `http://localhost:8080`.
5. **Deploy to the Mac mini headless server** — step-by-step:
   - clone the repo on the Mac mini
   - copy `.env.example` → `.env`, edit `HOST_PORT` if needed
   - `docker compose up -d --build`
   - verify with `curl http://localhost:8080`
   - how to view logs (`docker compose logs -f web`)
   - how to update (`git pull && docker compose up -d --build`)
   - optional: expose to LAN / set up a Caddy reverse proxy for HTTPS + domain (give a working example snippet)
6. **Editing content** — explain owner passcode (`lulu1116` by default) and how/where to change it (in `app.jsx`, search for `PASSCODE`). Note that content is per-browser since it's localStorage.
7. **Project structure** — file tree with one-line descriptions.
8. **Roadmap / known limitations** — localStorage is per-device (no cross-device sync), passcode is client-side only (it's a soft lock, not real auth), no real backend yet.
9. **License** — leave a placeholder (`TBD`) unless I tell you otherwise.

### 4. Sanity checks before you finish

- `docker compose config` parses cleanly.
- `docker compose up --build` boots the site and `curl -I http://localhost:8080` returns `200 OK`.
- The site loads in a browser with no console errors.
- Edit-mode unlock with `lulu1116` still works.
- The `EDITMODE-BEGIN/END` block in `app.jsx` is untouched.

### Constraints

- Do **not** introduce a JS bundler (no Vite / webpack / Next.js migration) unless I explicitly ask. Keep the in-browser Babel setup. The point of this handoff is hosting, not rewriting.
- Do **not** rename existing files.
- Keep dependencies minimal — ideally zero npm deps. The Docker image should only need nginx (or Caddy).
- Prefer Apple-Silicon-friendly images (`nginx:alpine`, `caddy:alpine` both work on arm64).

When you're done, list every file you created or changed and give me the exact commands to run on the Mac mini to bring it up for the first time.
