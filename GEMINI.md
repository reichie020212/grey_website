# GEMINI.md

Guidance for Gemini working on this repository.

## Project overview

A single-page biography website for **Castiel "Lulu" Grey Butay**. Visitors get a read-only view; the owner unlocks edit mode with a passcode and edits text/photos in place. The site is a no-build, in-browser React + Babel prototype — there is no Node toolchain — and all content (text, photos, guestbook entries) is persisted to the browser's `localStorage`. It is served as static files behind nginx in production.

## Architecture

```
.
├── index.html        # entry point — loads React 18.3.1, ReactDOM, @babel/standalone from unpkg + Google Fonts; mounts <App />
├── app.jsx           # all React components (Hero, About, Stats, Timeline, Gallery, Family, Letter, Routine, Wishes, Guestbook, LockModal, TweaksPanel wiring)
├── styles.css        # all styling — cream/sky/peach/sage palette with light + dark theme variables
├── tweaks-panel.jsx  # design-tweaks shell used by the in-page settings panel
├── nginx.conf        # production server config (gzip, cache headers, CSP, SPA fallback)
├── Dockerfile        # nginx:alpine base, copies static assets + nginx.conf
├── docker-compose.yml
├── .dockerignore
├── .env.example      # HOST_PORT — port the host exposes (default 8080)
├── HANDOFF_PROMPT.md # original productionization brief
└── README.md
```

### Data flow

- **Content** (about text, timeline entries, guestbook, etc.) → `localStorage["castiel-content-v1"]`
- **Photos** (data URLs) → `localStorage["castiel-photos-v1"]`
- **Edit-mode unlock state** → `localStorage["castiel-unlocked-v1"]`

No backend. Each browser/device has its own copy of the data.

### Edit-lock

`PASSCODE` is hardcoded in `app.jsx` (search for `PASSCODE`). Entering it in the lock modal flips the site into edit mode and stores the unlock flag in `localStorage`. It's a soft lock — anyone with the passcode or localStorage access can edit. It guards against accidental edits, not adversarial ones.

## Conventions

- **No build step.** JSX is compiled in the browser by `@babel/standalone`. Do not introduce Vite/webpack/Next.js without an explicit migration request — the in-browser Babel setup is intentional and the Dockerfile assumes static files only.
- **No TypeScript.** Plain JS/JSX.
- **2-space indent.** React function components only — no class components.
- **Inline JSX** loaded via `<script type="text/babel" src="…"></script>`. Keep `app.jsx` and `tweaks-panel.jsx` self-contained — globals on `window` rather than ES modules, since there is no bundler.
- **Tweaks panel state** persists through the same localStorage layer; new tweak defaults go inside the `TWEAK_DEFAULTS` object marked by the `EDITMODE-BEGIN/END` comment markers (see "What to be careful about").
- **Naming**: kebab-case for files, PascalCase for components, camelCase for variables.

## What to be careful about

- **Do not break the `EDITMODE-BEGIN`/`EDITMODE-END` JSON marker block** in `app.jsx`. The Tweaks panel parses the source between those markers — the comments and the JSON shape between them must stay valid.
- **Preserve the localStorage keys** (`castiel-content-v1`, `castiel-photos-v1`, `castiel-unlocked-v1`) — renaming them silently wipes existing data on owner devices. If the schema must change, version the key (`-v2`) and migrate.
- **Do not introduce a JS bundler** unless explicitly asked. If you do, you must also rewrite `index.html`'s script tags and the Dockerfile's COPY list — updating only one of the two will silently break production.
- **Do not rename existing files.** `index.html`, `app.jsx`, `tweaks-panel.jsx`, `styles.css` are referenced by name from `index.html` and `Dockerfile`.
- **CDN integrity hashes** in `index.html` are pinned to specific React/Babel versions. Bumping versions requires regenerating the `integrity=` SRI hashes; otherwise the browser refuses to load the scripts.
- **CSP allows `'unsafe-eval'` and `'unsafe-inline'` for scripts** because `@babel/standalone` compiles JSX at runtime via `Function()` and then injects the compiled output as inline `<script>` elements. Do not tighten these without first moving to a real bundler — the site will silently stop rendering.

## How to run

- Local: `python3 -m http.server 8080` (or `npx serve .`) in the project root, then visit `http://localhost:8080`.
- Docker: `docker compose up --build` and visit `http://localhost:8080` (port configurable via `.env`).

Full instructions, including the Mac mini deploy steps, are in `README.md`.

## Testing / verification

After any change:

1. Open the site in a browser (local server or Docker).
2. Confirm there are **no console errors** — especially Babel transform errors, CSP violations, or SRI hash mismatches.
3. Confirm the edit-mode unlock with the current passcode still works.
4. Confirm the Tweaks panel still opens and applies changes.
5. If you touched anything near `EDITMODE-BEGIN/END`, reload and confirm the panel doesn't throw a parse error.
6. For Docker changes: `docker compose config` parses cleanly, `docker compose up --build` boots, and `curl -I http://localhost:8080` returns `200 OK`.
