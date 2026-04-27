# PocketBase superuser bootstrap from `.env`

**Date:** 2026-04-27
**Status:** Approved (pending user spec review)
**Scope:** Replace the manual "first-superuser" flow (admin-UI wizard or one-off CLI command) with a declarative `.env`-driven bootstrap that is enforced on every boot.

---

## Motivation

Today, creating the first PocketBase superuser is a manual side-step: visit `/_/` in a browser and use the install wizard, or `docker compose exec pb pocketbase superuser upsert ...` once. The credential then lives only inside the container's SQLite DB. Operationally, this means:

- Two different "first run" paths (local dev vs. headless production), documented separately.
- No single source of truth for the owner credential — it's only inside `pb_data/`.
- Password rotation is a manual CLI dance.
- Nothing prevents `docker compose up` from succeeding with no superuser at all, leaving the site editable by no one.

This spec moves the credential into a `.env` file (gitignored, never committed) that is required at boot. The `pb` container reads it, runs `pocketbase superuser upsert` on every start, and only then serves traffic.

The PocketBase admin UI at `/_/` is **not** removed — it remains accessible for guestbook moderation, log inspection, and other admin tasks. This change concerns only how the bootstrap superuser is provisioned.

---

## Design decisions (resolved during brainstorming)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | What to do with `/_/` | Leave it accessible | Guestbook moderation and emergency data access still needed; no proxy/route changes. |
| 2 | Behavior when `.env` credentials change | **Sync mode**: `upsert` runs on every boot | `.env` is the single source of truth. Editing `.env` and restarting `pb` rotates the password. The "edit-via-UI gets reverted" caveat is intended — there is exactly one canonical place for the bootstrap credential. |
| 3 | Validation strictness | **Both layers**: compose-level `${VAR:?msg}` guard *and* an entrypoint script that validates email shape and password length | Compose layer stops the whole stack from starting if vars are missing. Entrypoint catches malformed values (e.g. `password=hi`) before PocketBase rejects them with a less-readable error. |

---

## Architecture

Two new environment variables, sourced from `.env`:

- `PB_SUPERUSER_EMAIL`
- `PB_SUPERUSER_PASSWORD`

They flow through the system as follows:

```
.env (gitignored)
  │
  ▼
docker-compose.yml
  • environment: PB_SUPERUSER_EMAIL: ${PB_SUPERUSER_EMAIL:?msg}
  • environment: PB_SUPERUSER_PASSWORD: ${PB_SUPERUSER_PASSWORD:?msg}
  │  (compose aborts the whole `up` if either is unset/empty)
  ▼
pb container starts
  │
  ▼
/sbin/tini -- /entrypoint.sh   (ENTRYPOINT keeps tini for signal/zombie handling)
  │
  ▼
entrypoint.sh
  1. Re-validate vars are non-empty (`set -u` + `:?` parameter expansion)
  2. Email shape check (one '@', non-empty local + domain parts)
  3. Password length check (≥ 10 chars, PocketBase minimum)
  4. pocketbase superuser upsert "$EMAIL" "$PASSWORD" --dir=/pb/pb_data
  5. exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
```

Step 5's `exec` is essential — it replaces the shell with PocketBase so that `tini` (PID 1) forwards signals like SIGTERM (from `docker stop`) directly to PocketBase, allowing clean shutdowns within Docker's default 10-second grace period.

---

## File-level changes

### New: `pb/entrypoint.sh`

```sh
#!/bin/sh
# Bootstraps the PocketBase superuser from environment variables before
# starting the server. Runs on every container start; `upsert` is idempotent
# so re-applying the same credentials is a no-op.

set -eu

: "${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL is required (set it in .env)}"
: "${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD is required (set it in .env)}"

case "$PB_SUPERUSER_EMAIL" in
  *@*.*) ;;
  *)
    echo "PB_SUPERUSER_EMAIL does not look like an email: $PB_SUPERUSER_EMAIL" >&2
    exit 1
    ;;
esac

if [ "${#PB_SUPERUSER_PASSWORD}" -lt 10 ]; then
  echo "PB_SUPERUSER_PASSWORD must be at least 10 characters (PocketBase minimum)" >&2
  exit 1
fi

pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb/pb_data

exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations
```

Notes:
- `set -eu` — fail fast on any error or unset variable.
- The password is never echoed; only error messages are printed.
- `${#VAR}` length check works in BusyBox `ash` (alpine's default `/bin/sh`).
- Uses `pocketbase` (PATH-resolved to `/usr/local/bin/pocketbase`) rather than a hardcoded path, matching the existing `Dockerfile`.

### Modified: `pb/Dockerfile`

Two changes:

1. `COPY entrypoint.sh /entrypoint.sh` (add a `RUN chmod +x /entrypoint.sh` after, in case the host file mode is dropped during the build).
2. Replace the existing `CMD ["pocketbase", "serve", ...]` with `CMD ["/entrypoint.sh"]`. The `ENTRYPOINT ["/sbin/tini", "--"]` line is **kept as-is** — tini still wraps everything for signal/zombie handling.

The build-time fetcher stage (downloading the PB binary from upstream) is unchanged.

### Modified: `docker-compose.yml`

Add an `environment:` block to the `pb` service:

```yaml
  pb:
    # ...existing fields unchanged...
    environment:
      PB_SUPERUSER_EMAIL: ${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL must be set in .env (copy .env.example to .env and fill it in)}
      PB_SUPERUSER_PASSWORD: ${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD must be set in .env (min 10 chars; copy .env.example to .env and fill it in)}
```

The `${VAR:?message}` expansion fails the entire `docker compose` command before any container starts if either variable is unset or empty.

### Modified: `.env.example`

Append the two new keys to the existing file (which currently only declares `HOST_PORT`):

```dotenv
# Host port the site is exposed on. Container always listens on :80 internally.
HOST_PORT=8080

# PocketBase superuser credentials. Required on every boot — the pb container
# runs `pocketbase superuser upsert` with these values before starting, so
# editing them here and restarting pb rotates the password.
#
# Email must look like an email. Password must be at least 10 characters.
# Do NOT commit the real .env — it's gitignored.
PB_SUPERUSER_EMAIL=
PB_SUPERUSER_PASSWORD=
```

### Verified: `.gitignore`

Already excludes `.env` (with `!.env.example` allow-listed). No change required.

### Modified: `README.md`

- **Local development → First-time setup**: extend the "clone and `docker compose up`" block to first do `cp .env.example .env`, edit in credentials, then bring the stack up. The stack will refuse to start otherwise.
- **Local development → Create your owner account**: rewrite. The new flow is "your account is the one in `.env`" — no admin-UI wizard, no separate CLI command. Add a one-liner "Rotating the password" tip pointing back to `.env` + `docker compose restart pb`.
- **Production → First-time deployment**: the existing `cp .env.example .env` step now requires filling in `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` before `docker compose up -d --build`. Update the "Create the first owner account (CLI — recommended for headless)" subsection: it becomes "set credentials in `.env`" rather than running `docker compose exec ... upsert`.
- **Troubleshooting → Locked out of `/_/`**: replace the `docker compose exec ... update-password` recipe with "edit `.env`, then `docker compose restart pb`" as the primary recovery path. Keep `update-password` as a fallback for cases where the bootstrap email itself was forgotten.
- **Project structure**: `.env.example` description grows from "HOST_PORT" to "HOST_PORT + PocketBase superuser credentials".

### Modified: `CLAUDE.md`

- **How to run**: update the two-line summary so both local and production paths reference `.env` as the place credentials live (no more "visit `/_/` to create the first superuser" or "`docker compose exec ... upsert` for the first superuser").
- **Architecture → Data flow → Auth (owner)**: add one sentence: "The bootstrap superuser is provisioned on every `pb` start from `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` in `.env`."
- **What to be careful about**: add a bullet — `.env` is the source of truth for the bootstrap superuser; changes made via `/_/` to that email get reverted on next `pb` restart. Rotate via `.env`, not via the UI.

---

## Edge cases

1. **Existing deployments with a superuser already created via `/_/` or one-off CLI.**
   First boot after this change runs `upsert` against whatever email is in `.env`. If that email matches the existing superuser → password is synced to the `.env` value (effectively a forced rotation). If it's a different email → the old superuser is untouched and a second one is added. Neither is destructive; users with existing deployments should set `.env` to match their existing credentials to avoid confusion.

2. **Password rotation visibility.**
   In sync mode, any password change made via `/_/` is reverted on the next `pb` restart. The README and CLAUDE.md both call this out explicitly so it's not a surprise.

3. **Additional superusers.**
   The bootstrap manages exactly one superuser (the one whose email matches `PB_SUPERUSER_EMAIL`). Other superusers created later via the admin UI are not touched by the bootstrap.

4. **Whitespace and shell-special characters in the password.**
   The entrypoint quotes `"$PB_SUPERUSER_PASSWORD"` everywhere. Spaces, `$`, `&`, `;`, etc. in passwords are passed through to PocketBase intact. The only constraint is the documented minimum length.

5. **Compose-layer error visibility.**
   `${VAR:?msg}` writes the message to stderr and exits non-zero from `docker compose up` — visible at the terminal, no containers start. No partial-stack states.

---

## Out of scope

- Removing or restricting `/_/` (decided against during brainstorming).
- Multi-superuser bootstrap (only one is provisioned from `.env`; others are created manually if needed).
- Secrets-manager integration (`.env` is sufficient for a single-host home deployment).
- Automated tests for the entrypoint script — verified manually via the testing checklist below.

---

## Verification checklist

After implementation, the following must all pass:

1. `docker compose up` with no `.env` → fails with a clear message referring to `.env.example`. No containers start.
2. `docker compose up` with `.env` present but `PB_SUPERUSER_PASSWORD=short` → `pb` exits with the "must be at least 10 characters" message; `web` does not become healthy.
3. `docker compose up` with `.env` present but `PB_SUPERUSER_EMAIL=not-an-email` → `pb` exits with the "does not look like an email" message.
4. `docker compose up` with valid `.env` (fresh `pb_data/`) → both services healthy; superuser auth at `/api/collections/_superusers/auth-with-password` succeeds with the `.env` credentials.
5. Edit `.env` to a new password, `docker compose restart pb` → old password rejected, new password accepted on auth.
6. Set a *different* email in `.env`, restart → new superuser created; old one still present (verifiable from `/_/`).
7. `docker stop castiel-pb` → process exits cleanly within Docker's grace period (no `SIGKILL` after 10s, confirming `exec` + tini pass signals correctly).
8. The frontend smoke checks from `CLAUDE.md`'s testing section all still pass.
