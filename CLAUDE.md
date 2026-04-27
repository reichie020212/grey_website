# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project overview

A single-page biography website for **Castiel "Lulu" Grey Butay**. Visitors get a read-only view; the owner signs in with a real email + password and edits text/photos in place. The site is built as a no-build, in-browser React + Babel prototype (there is no Node toolchain) backed by a tiny **PocketBase** server (single Go binary + SQLite) that holds the content, photos, and guestbook entries. nginx serves the static assets and reverse-proxies `/api/` and `/_/` to PocketBase.

## Architecture

```
.
├── index.html             # entry — loads React 18.3.1, ReactDOM, @babel/standalone from unpkg + Google Fonts; mounts <App />
├── app.jsx                # all React components + tiny PocketBase REST client
├── styles.css             # all styling — cream/sky/peach/sage palette with light + dark theme variables
├── tweaks-panel.jsx       # design-tweaks panel shell (per-visitor localStorage state)
├── nginx.conf             # gzip, cache headers, CSP, /api + /_ reverse proxy to pb:8090, SPA fallback
├── Dockerfile             # frontend image (nginx:alpine + static assets)
├── docker-compose.yml     # two services: web (nginx) + pb (PocketBase)
├── .dockerignore
├── .env.example           # HOST_PORT — port the host exposes (default 8080)
├── pb/
│   ├── Dockerfile         # PocketBase image (alpine + binary fetched from upstream releases, pinned via PB_VERSION arg)
│   └── pb_migrations/
│       └── 0001_init.js   # creates content/photos/guestbook collections + seeds defaults
├── pb_data/               # SQLite db + uploaded files — bind-mounted from host, gitignored
├── HANDOFF_PROMPT.md      # original productionization brief (legacy)
└── README.md
```

### Data flow

- **Content** (about text, timeline, family, letter, routine, wishes, gallery metadata, baby info) → singleton record in the `content` collection. Frontend loads with `GET /api/collections/content/records?perPage=1`, saves with `PATCH /api/collections/content/records/{id}`.
- **Photos** → one record per slot in the `photos` collection. Slot is a unique text key (`hero`, `gallery-0…N`, `fam-0`, `fam-1`, `fam-baby`). `image` is a single uploaded file. URLs are constructed as `/api/files/{collectionId}/{recordId}/{filename}`.
- **Guestbook** → individual records in the `guestbook` collection. Anyone can `POST` (open create rule). Owner can delete via the PB admin UI.
- **Auth (owner)** → `POST /api/collections/_superusers/auth-with-password` returns a JWT, stored in `localStorage["castiel-pb-token-v1"]` and sent as `Authorization: <token>` on writes. `auth-refresh` is called on app startup to drop a stale token.
- **Tweaks panel** state stays in `localStorage` (per-visitor preferences, not synced).

### Edit-lock

There is no longer a hardcoded passcode. The lock icon opens an email + password modal that calls PocketBase's superuser auth. A valid token in `localStorage` is what `unlocked === true` means; the same token gates every write request via the `Authorization` header.

## Conventions

- **No build step.** JSX is compiled in the browser by `@babel/standalone`. Do not introduce Vite/webpack/Next.js without an explicit migration request — the in-browser Babel setup is intentional and the Dockerfile assumes static files only.
- **No TypeScript.** Plain JS/JSX.
- **No npm dependencies.** The API client is hand-rolled `fetch`.
- **2-space indent.** React function components only — no class components.
- **Inline JSX** loaded via `<script type="text/babel" src="…"></script>`. Keep `app.jsx` and `tweaks-panel.jsx` self-contained — globals on `window` rather than ES modules, since there is no bundler.
- **Tweaks panel state** lives in localStorage; new tweak defaults go inside the `TWEAK_DEFAULTS` object marked by the `EDITMODE-BEGIN/END` comment markers.
- **Naming**: kebab-case for files, PascalCase for components, camelCase for variables.
- **PB collection rules**: list/view always public; writes always owner-only (rule = `null`, only superuser bypass works) except guestbook create which is `""` (open).

## What to be careful about

- **Do not break the `EDITMODE-BEGIN`/`EDITMODE-END` JSON marker block** in `app.jsx`. The Tweaks panel parses the source between those markers — the comments and the JSON shape between them must stay valid.
- **Do not change `pb/pb_migrations/0001_init.js` after deploying.** PB records applied migrations in its DB and won't re-run an edited 0001. Add `0002_…js`, `0003_…js`, etc. for any schema changes.
- **`pb_data/` is the database.** Never commit it, never delete it without backing up first. It contains the SQLite db, uploaded photos, and PocketBase settings.
- **Keep the localStorage key `castiel-pb-token-v1`.** Renaming it logs every owner out on next deploy.
- **Do not introduce a JS bundler** unless explicitly asked. If you do, you must also rewrite `index.html`'s script tags and the Dockerfile's COPY list.
- **Do not rename existing files.** `index.html`, `app.jsx`, `tweaks-panel.jsx`, `styles.css` are referenced by name from `index.html` and `Dockerfile`.
- **CDN integrity hashes** in `index.html` are pinned to specific React/Babel versions. Bumping versions requires regenerating the `integrity=` SRI hashes; otherwise the browser refuses to load the scripts.
- **CSP allows `'unsafe-eval'` and `'unsafe-inline'` for scripts** because `@babel/standalone` compiles JSX at runtime via `Function()` and then injects the compiled output as inline `<script>` elements. Do not tighten these without first moving to a real bundler — the site will silently stop rendering.
- **Photo uploads are MB-scale.** `client_max_body_size 15M` in `nginx.conf` is required; without it nginx 413s the multipart POST.
- **Same-origin only.** The frontend talks to `/api/...` because nginx proxies it. If you ever expose PB on a separate origin, you'll need CORS settings on PB and to relax `connect-src 'self'` in the CSP.

## How to run

`README.md` is the source of truth for setup — it has full step-by-step instructions, expected output, verification checklists, and troubleshooting. The two-line version:

- **Local dev** (laptop): `docker compose up --build`, then `http://localhost:8080/_/` to create the first superuser, then `http://localhost:8080/` to use the site. Detailed flow in [README.md → Local development](./README.md#local-development-dev-instance).
- **Mac mini production** (headless server): `docker compose up -d --build` on the server, then `docker compose exec pb pocketbase superuser upsert email password` for the first superuser. Detailed flow in [README.md → Production — Mac mini headless server](./README.md#production--mac-mini-headless-server), including backup, HTTPS via Caddy, auto-start on reboot, and the security checklist.

Common operational commands once the stack is up:

| Goal | Command |
|---|---|
| Start in background | `docker compose up -d` |
| Stop | `docker compose down` |
| Tail all logs | `docker compose logs -f` |
| Restart just nginx | `docker compose restart web` |
| Apply a new migration | edit `pb/pb_migrations/000N_*.js`, then `docker compose restart pb` |
| Rebuild after frontend / `nginx.conf` edits | `docker compose up -d --build web` |
| Rebuild after PocketBase version bump | edit `pb/Dockerfile` `ARG PB_VERSION=`, then `docker compose up -d --build pb` |
| Backup `pb_data/` (cold) | `docker compose stop pb && tar -czf bk.tgz pb_data/ && docker compose start pb` |
| Reset local state | `docker compose down && rm -rf pb_data && docker compose up --build` |

## Testing / verification

After any change:

1. Open the site in a browser (local dev or production).
2. Confirm there are **no console errors** — especially Babel transform errors, CSP violations, SRI hash mismatches, or 4xx/5xx from `/api/...`.
3. Confirm `curl http://localhost:8080/api/health` returns `{"message":"API is healthy.","code":200}`.
4. Confirm the lock modal accepts valid superuser credentials and rejects bad ones.
5. Confirm an inline edit (e.g. change the baby's tagline) persists across a hard reload.
6. Confirm a photo upload from edit mode shows the new image immediately and survives a reload.
7. Confirm an anonymous (logged-out) visitor can submit a guestbook entry and it appears at the top of the list.
8. If you touched anything near `EDITMODE-BEGIN/END`, reload and confirm the panel doesn't throw a parse error.
9. For Docker changes: `docker compose config` parses cleanly, both services report `(healthy)`, and the smoke checks above pass.
