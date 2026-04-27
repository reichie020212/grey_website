# PocketBase superuser bootstrap from `.env` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual first-superuser flow (admin-UI wizard or one-off `docker compose exec` upsert) with a declarative, `.env`-sourced bootstrap that runs on every `pb` container start and refuses to bring up the stack without valid credentials.

**Architecture:** Two new env vars (`PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`) live in `.env` and are required by `docker-compose.yml` via `${VAR:?msg}` parameter expansion. A new `pb/entrypoint.sh` script — invoked through the existing `tini` ENTRYPOINT chain — re-validates the values (email shape, password ≥ 10 chars), runs `pocketbase superuser upsert`, then `exec`s `pocketbase serve`. `.env` is the single source of truth: edits + `docker compose restart pb` rotate the password.

**Tech Stack:** Docker Compose v2, BusyBox `ash` (`/bin/sh` in `alpine:3.20`), PocketBase v0.37 CLI, nginx (unchanged).

**Testing convention:** This project has **no automated test framework** — no `npm`, no Node, no test runner. "Tests" in this plan are manual verification commands run against the actual stack, with explicit expected output. The executor must run each verification step and confirm output before moving on.

**Worktree:** Work happens in `/Users/red/grey_website-pb-bootstrap` on branch `feat/pb-superuser-bootstrap`. All commands assume the working directory is the worktree root unless otherwise stated.

**Spec reference:** `docs/superpowers/specs/2026-04-27-pb-superuser-bootstrap-design.md`

**Commit conventions (from user's global `CLAUDE.md`):** every commit signed with both `-s` and `-S`, conventional-commits prefix, no `Co-Authored-By` trailer, no "Generated with Claude Code" footer.

---

## File map

| File | Status | Purpose |
|---|---|---|
| `pb/entrypoint.sh` | **Create** | Validates env vars, upserts superuser, execs `pocketbase serve`. Runs on every `pb` container start. |
| `pb/Dockerfile` | Modify | Copy + chmod the entrypoint script; replace `CMD` so the script runs after tini. |
| `docker-compose.yml` | Modify | Declare `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` as required for the `pb` service via `${VAR:?msg}`. |
| `.env.example` | Modify | Add the two new keys with explanatory comments. |
| `README.md` | Modify | Replace first-superuser instructions in local-dev and production sections; add password-rotation note; update troubleshooting and project-structure listing. |
| `CLAUDE.md` | Modify | Update "How to run" summary, auth-flow description, "What to be careful about" bullet. |

`.gitignore` already excludes `.env` (with `!.env.example` allow-listed) — verified during spec writing, no change required.

---

## Task 1: Add entrypoint script and wire it into the `pb` Dockerfile

**Why one task and one commit:** the script is dead code without the Dockerfile change, and the Dockerfile change references a missing file without the script. They must land together for the image to build.

**Files:**
- Create: `pb/entrypoint.sh`
- Modify: `pb/Dockerfile` (lines 13-25 — the runtime stage)

- [ ] **Step 1.1: Create `pb/entrypoint.sh` with the validation + upsert + exec logic.**

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

- [ ] **Step 1.2: Make the script executable on the host.**

```bash
chmod +x pb/entrypoint.sh
```

Run from the worktree root (`/Users/red/grey_website-pb-bootstrap`).

- [ ] **Step 1.3: Lint the script syntax with `sh -n` (no execution, just parse).**

```bash
sh -n pb/entrypoint.sh && echo "OK: script parses"
```

Expected output:
```
OK: script parses
```

If you see a syntax error, fix the script before continuing.

- [ ] **Step 1.4: Modify `pb/Dockerfile` — runtime stage.**

Replace the runtime stage (lines 13-25 of the current file). The fetcher stage above (lines 1-11) is unchanged.

Current runtime stage:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget tini
COPY --from=fetcher /tmp/pocketbase /usr/local/bin/pocketbase
WORKDIR /pb

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8090/api/health || exit 1

# tini reaps zombies; pocketbase serve runs the embedded SQLite + HTTP server.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
```

Replace with:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget tini
COPY --from=fetcher /tmp/pocketbase /usr/local/bin/pocketbase
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /pb

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8090/api/health || exit 1

# tini reaps zombies; entrypoint.sh validates env vars, upserts the bootstrap
# superuser from PB_SUPERUSER_EMAIL/PASSWORD, then `exec`s pocketbase serve so
# tini delivers signals (SIGTERM from `docker stop`) directly to PocketBase.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/entrypoint.sh"]
```

Three concrete changes:
1. Added `COPY entrypoint.sh /entrypoint.sh` after the `pocketbase` binary copy.
2. Added `RUN chmod +x /entrypoint.sh` to defend against build environments that drop the host file mode.
3. Replaced the long `CMD ["pocketbase", "serve", ...]` line with `CMD ["/entrypoint.sh"]`. The actual `pocketbase serve` invocation now lives in the script (with the same `--http`, `--dir`, and `--migrationsDir` flags preserved).

The `ENTRYPOINT ["/sbin/tini", "--"]` line is **kept exactly as-is**.

- [ ] **Step 1.5: Build the `pb` image to verify the Dockerfile is valid.**

```bash
docker compose build pb
```

Expected: build succeeds, ending with `naming to docker.io/library/castiel-pb:latest done`. If you see `COPY failed: file not found in build context: stat entrypoint.sh: file does not exist`, the script wasn't created in `pb/` (Step 1.1) or the build context is wrong (the compose file's `build.context` for `pb` should be `./pb`, which it already is).

- [ ] **Step 1.6: Confirm the script was actually copied into the image and is executable.**

```bash
docker run --rm --entrypoint=ls castiel-pb:latest -l /entrypoint.sh
```

Expected: a single line showing `-rwxr-xr-x ... /entrypoint.sh` (the `x` bits are required).

- [ ] **Step 1.7: Confirm the script's interpreter resolves inside the image.**

```bash
docker run --rm --entrypoint=/entrypoint.sh castiel-pb:latest 2>&1 | head -3
```

Expected: an error message about `PB_SUPERUSER_EMAIL is required (set it in .env)` (because no env vars were passed). This proves the script runs and the `:?` parameter expansion guard fires.

- [ ] **Step 1.8: Commit.**

```bash
git add pb/entrypoint.sh pb/Dockerfile
git commit -s -S -m "feat: bootstrap pb superuser from .env on every container start

Adds pb/entrypoint.sh which validates PB_SUPERUSER_EMAIL/PASSWORD
(non-empty + email shape + password length >= 10), upserts the
superuser via 'pocketbase superuser upsert', then 'exec's
'pocketbase serve' so tini delivers signals directly to PocketBase.
Dockerfile copies the script in and replaces the previous
'pocketbase serve' CMD with the wrapper. tini ENTRYPOINT preserved."
```

---

## Task 2: Require the env vars at the compose layer + document them in `.env.example`

**Why one task and one commit:** the compose-level guard and the `.env.example` template are the user-facing config surface; documenting one without the other leaves the deployment broken or undocumented.

**Files:**
- Modify: `docker-compose.yml` (the `pb:` service block, lines 19-39)
- Modify: `.env.example`

- [ ] **Step 2.1: Add the `environment:` block to the `pb` service in `docker-compose.yml`.**

In `docker-compose.yml`, the `pb` service currently looks like:

```yaml
  pb:
    build:
      context: ./pb
    image: castiel-pb:latest
    container_name: castiel-pb
    restart: unless-stopped
    # Not published — only nginx (via the `web` service on the same docker
    # network) reaches PocketBase. The admin UI is exposed through nginx at /_/.
    expose:
      - "8090"
    volumes:
      # SQLite db + uploaded files. Bind mount so the host can `tar` it for backup.
      - ./pb_data:/pb/pb_data
      # Migrations are read-only — PB only loads them, never writes.
      - ./pb/pb_migrations:/pb/pb_migrations:ro
    healthcheck:
      test: ["CMD", "wget", "--spider", "--quiet", "http://127.0.0.1:8090/api/health"]
      interval: 30s
      timeout: 3s
      retries: 5
      start_period: 10s
```

Insert an `environment:` block immediately after the `expose:` block (so it sits with the other top-level service keys, before `volumes:`). The full updated `pb` service:

```yaml
  pb:
    build:
      context: ./pb
    image: castiel-pb:latest
    container_name: castiel-pb
    restart: unless-stopped
    # Not published — only nginx (via the `web` service on the same docker
    # network) reaches PocketBase. The admin UI is exposed through nginx at /_/.
    expose:
      - "8090"
    environment:
      # Bootstrap superuser, required on every boot. The pb container runs
      # `pocketbase superuser upsert` with these before serving traffic.
      # The `${VAR:?...}` form aborts `docker compose up` if either is unset
      # or empty, so the stack never starts without valid credentials.
      PB_SUPERUSER_EMAIL: ${PB_SUPERUSER_EMAIL:?PB_SUPERUSER_EMAIL must be set in .env (copy .env.example to .env and fill it in)}
      PB_SUPERUSER_PASSWORD: ${PB_SUPERUSER_PASSWORD:?PB_SUPERUSER_PASSWORD must be set in .env (min 10 chars; copy .env.example to .env and fill it in)}
    volumes:
      # SQLite db + uploaded files. Bind mount so the host can `tar` it for backup.
      - ./pb_data:/pb/pb_data
      # Migrations are read-only — PB only loads them, never writes.
      - ./pb/pb_migrations:/pb/pb_migrations:ro
    healthcheck:
      test: ["CMD", "wget", "--spider", "--quiet", "http://127.0.0.1:8090/api/health"]
      interval: 30s
      timeout: 3s
      retries: 5
      start_period: 10s
```

- [ ] **Step 2.2: Verify the compose file refuses to parse when `.env` is missing.**

If a `.env` file currently exists in the worktree (from prior testing), move it out of the way temporarily:

```bash
[ -f .env ] && mv .env .env.bak
docker compose config 2>&1 | head -5
```

Expected: stderr contains a line like:
```
PB_SUPERUSER_EMAIL must be set in .env (copy .env.example to .env and fill it in)
```

Exit code is non-zero. This confirms the compose-level guard fires.

- [ ] **Step 2.3: Verify the compose file parses when both vars are set.**

```bash
PB_SUPERUSER_EMAIL=test@example.com PB_SUPERUSER_PASSWORD=test1234567 docker compose config | grep -A2 'environment'
```

Expected: a block in the rendered config showing:
```
environment:
  PB_SUPERUSER_EMAIL: test@example.com
  PB_SUPERUSER_PASSWORD: test1234567
```

This confirms the env vars are correctly forwarded into the rendered compose plan.

- [ ] **Step 2.4: Restore the saved `.env` if you moved one aside in Step 2.2.**

```bash
[ -f .env.bak ] && mv .env.bak .env
```

- [ ] **Step 2.5: Update `.env.example`.**

Current contents:

```dotenv
# Host port the site is exposed on. Container always listens on :80 internally.
HOST_PORT=8080
```

Replace the entire file with:

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

- [ ] **Step 2.6: Confirm `.env.example` is still tracked and `.env` is still ignored.**

```bash
git check-ignore -v .env.example .env 2>&1
```

Expected output:
```
::	.env.example
.gitignore:6:.env	.env
```

The first line ends with `.env.example` and has no `.gitignore` rule prefix → it's NOT ignored (good — the example file should be tracked). The second line shows `.env` matched the `.gitignore:6:.env` rule → it IS ignored (good — real credentials never get committed).

If `.env.example` shows as ignored, the `!.env.example` allow-list line in `.gitignore` is missing or wrong; check `.gitignore` against the post-spec state.

- [ ] **Step 2.7: Commit.**

```bash
git add docker-compose.yml .env.example
git commit -s -S -m "feat: require PB_SUPERUSER_* env vars in compose

docker-compose.yml's pb service now declares both PB_SUPERUSER_EMAIL
and PB_SUPERUSER_PASSWORD with \${VAR:?msg} expansion, so 'docker
compose up' aborts before any container starts if either is unset
or empty. .env.example documents both keys with the password length
constraint and a reminder that .env is gitignored."
```

---

## Task 3: End-to-end verification against the spec's verification checklist

**Why no commit:** this task only runs the spec's 8-item verification checklist against the implementation. If everything passes, no code changes are produced. If a check fails, fix the offending file and amend that file's earlier commit (or add a follow-up `fix:` commit) before continuing.

**Pre-task setup:** create a `.env` in the worktree with throwaway test credentials. The worktree has its own `pb_data/` (separate from the main checkout's), so this won't disturb existing data.

- [ ] **Step 3.1: Create a test `.env` in the worktree.**

From the worktree root (`/Users/red/grey_website-pb-bootstrap`):

```bash
cat > .env <<'EOF'
HOST_PORT=8080
PB_SUPERUSER_EMAIL=bootstrap-test@example.com
PB_SUPERUSER_PASSWORD=verylongtestpassword
EOF
```

If port 8080 is already in use on the host (e.g. another instance of the site is running from the main checkout), pick a different `HOST_PORT` like `8082`. The choice doesn't affect the verification logic.

- [ ] **Step 3.2: Wipe any leftover worktree `pb_data/` for a clean run.**

```bash
docker compose down -v 2>/dev/null || true
rm -rf pb_data
```

This ensures the bootstrap is being exercised against a fresh PocketBase database.

- [ ] **Step 3.3: Spec verification check #1 — `up` with no `.env` fails.**

```bash
mv .env .env.bak
docker compose up 2>&1 | head -10
```

Expected: stderr contains `PB_SUPERUSER_EMAIL must be set in .env ...`. The command exits non-zero. No containers are created (verify with `docker compose ps` showing no `castiel-*` containers).

```bash
mv .env.bak .env
```

- [ ] **Step 3.4: Spec verification check #2 — short password fails.**

```bash
sed -i.tmp 's/^PB_SUPERUSER_PASSWORD=.*/PB_SUPERUSER_PASSWORD=short/' .env && rm -f .env.tmp
docker compose up -d 2>&1 | tail -5
docker compose logs pb 2>&1 | tail -10
```

Expected: `pb` container starts, then exits non-zero. The logs show:
```
PB_SUPERUSER_PASSWORD must be at least 10 characters (PocketBase minimum)
```

The `web` container will keep waiting on its `depends_on: pb (healthy)` condition and never become healthy.

```bash
docker compose down
sed -i.tmp 's/^PB_SUPERUSER_PASSWORD=.*/PB_SUPERUSER_PASSWORD=verylongtestpassword/' .env && rm -f .env.tmp
```

- [ ] **Step 3.5: Spec verification check #3 — bad email fails.**

```bash
sed -i.tmp 's/^PB_SUPERUSER_EMAIL=.*/PB_SUPERUSER_EMAIL=not-an-email/' .env && rm -f .env.tmp
docker compose up -d 2>&1 | tail -5
docker compose logs pb 2>&1 | tail -10
```

Expected: `pb` container exits non-zero. Logs show:
```
PB_SUPERUSER_EMAIL does not look like an email: not-an-email
```

```bash
docker compose down
sed -i.tmp 's/^PB_SUPERUSER_EMAIL=.*/PB_SUPERUSER_EMAIL=bootstrap-test@example.com/' .env && rm -f .env.tmp
```

- [ ] **Step 3.6: Spec verification check #4 — valid `.env` brings the stack up healthy and superuser auth works.**

```bash
rm -rf pb_data    # fresh PB state
docker compose up -d
```

Wait for both healthchecks to clear (typically ~15-30s):

```bash
until docker compose ps --format '{{.Name}} {{.Status}}' | grep -q 'castiel-site.*healthy' && \
      docker compose ps --format '{{.Name}} {{.Status}}' | grep -q 'castiel-pb.*healthy'; do
  sleep 2
  echo -n "."
done
echo " ready"
docker compose ps
```

Expected: both services show `Up X (healthy)`.

Now exercise the bootstrap superuser via the auth endpoint. Use the `HOST_PORT` from your `.env` (`8080` unless changed):

```bash
curl -s -X POST http://localhost:8080/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"bootstrap-test@example.com","password":"verylongtestpassword"}' \
  | head -c 100
```

Expected: a JSON response starting with `{"token":"...` (the rest is the JWT and superuser record). If you see `{"status":400,...}` instead, the bootstrap didn't run — check `docker compose logs pb` for the `entrypoint.sh` upsert line.

- [ ] **Step 3.7: Spec verification check #5 — password rotation via `.env`.**

```bash
sed -i.tmp 's/^PB_SUPERUSER_PASSWORD=.*/PB_SUPERUSER_PASSWORD=newrotatedpassword/' .env && rm -f .env.tmp
docker compose restart pb
```

Wait for `pb` to be healthy again (a few seconds), then:

```bash
# Old password should now fail
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"bootstrap-test@example.com","password":"verylongtestpassword"}'

# New password should succeed
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"bootstrap-test@example.com","password":"newrotatedpassword"}'
```

Expected: first call prints `400` (auth failed); second call prints `200`.

- [ ] **Step 3.8: Spec verification check #6 — different email creates a second superuser.**

```bash
sed -i.tmp 's/^PB_SUPERUSER_EMAIL=.*/PB_SUPERUSER_EMAIL=second-bootstrap@example.com/' .env && rm -f .env.tmp
docker compose restart pb
```

Wait for `pb` healthy, then auth as the new email:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"second-bootstrap@example.com","password":"newrotatedpassword"}'
```

Expected: `200`.

The original `bootstrap-test@example.com` should still exist and still authenticate with `newrotatedpassword`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8080/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"bootstrap-test@example.com","password":"newrotatedpassword"}'
```

Expected: `200`.

This confirms the bootstrap manages exactly the email in `.env` and doesn't touch others.

- [ ] **Step 3.9: Spec verification check #7 — clean shutdown via SIGTERM.**

```bash
time docker stop castiel-pb
```

Expected: `docker stop` returns in **well under 10 seconds** (typically < 1s). If it takes the full 10s, Docker had to escalate to SIGKILL — meaning `exec` in the entrypoint script didn't replace the shell, or tini isn't forwarding signals. Check Step 1.4's CMD line and the final `exec pocketbase serve` in `entrypoint.sh`.

```bash
docker compose start pb    # restart for the next check
```

- [ ] **Step 3.10: Spec verification check #8 — frontend smoke checks.**

Per `CLAUDE.md`'s testing section:

```bash
# Health endpoint
curl -s http://localhost:8080/api/health
# Expected: {"message":"API is healthy.","code":200,"data":{}}

# Static index serves
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/
# Expected: 200

# Seeded content present (verifies the migration ran)
curl -s 'http://localhost:8080/api/collections/content/records?perPage=1' | head -c 80
# Expected: starts with {"items":[{"collectionId":...
```

- [ ] **Step 3.11: Tear down and clean up the verification stack.**

```bash
docker compose down
rm -rf pb_data .env
```

`pb_data/` and `.env` are gitignored, so removing them leaves the repo clean. (The user will create their own `.env` post-merge with their real credentials.)

- [ ] **Step 3.12: Confirm git tree is still clean.**

```bash
git status --short
```

Expected: empty output. If anything appears, you accidentally modified a tracked file during verification — investigate before continuing.

---

## Task 4: Update `README.md`

**Files:**
- Modify: `README.md` (specific subsections — see each step below for the line ranges)

- [ ] **Step 4.1: Update "Local development → First-time setup" (around lines 57-78).**

Current content of that block:

````markdown
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
````

Replace with:

````markdown
### First-time setup

```sh
git clone <this-repo-url> grey_website
cd grey_website

# Required: set the bootstrap superuser credentials. The pb container will
# refuse to start without these.
cp .env.example .env
$EDITOR .env   # fill in PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD (>= 10 chars)

docker compose up --build
```

You should see Docker build both images, then both containers report healthy:

```
 ✔ Container castiel-pb    Healthy
 ✔ Container castiel-site  Healthy
```

If you forgot the `.env`, `docker compose up` exits immediately with `PB_SUPERUSER_EMAIL must be set in .env (copy .env.example to .env and fill it in)` — that's the compose-level guard doing its job.

In another terminal (the first one is now tailing logs):

```sh
curl http://localhost:8080/             # the static index.html
curl http://localhost:8080/api/health   # {"message":"API is healthy.","code":200,"data":{}}
```
````

- [ ] **Step 4.2: Replace the entire "Create your owner account" subsection (around lines 80-94).**

Current content:

````markdown
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
````

Replace with:

````markdown
### Sign in as the owner

The bootstrap superuser is whatever you put in `.env`. There's no install wizard or one-off CLI step — the `pb` container ran `pocketbase superuser upsert` with your `.env` values during startup.

Go to <http://localhost:8080/>, click the 🔒 in the top-right, and sign in with the email + password from `.env`. The icon flips to ✎ and you're in edit mode.

#### Rotating the password

Edit `.env` and restart `pb`:

```sh
$EDITOR .env                    # change PB_SUPERUSER_PASSWORD (still >= 10 chars)
docker compose restart pb
```

The next start re-runs `upsert` with the new password. The old one stops working immediately.

> **Heads up — `.env` wins.** If you change the password through the `/_/` admin UI for the email in `.env`, the next `pb` restart will revert it to the `.env` value. There's exactly one canonical place for the bootstrap credential. Use the admin UI freely for moderating the guestbook, inspecting records, etc., but rotate the bootstrap password through `.env`.
>
> Additional superusers created later via `/_/` (with a different email) are never touched by the bootstrap.
````

- [ ] **Step 4.3: Update "Production → First-time deployment" (around lines 162-186).**

Find this block:

````markdown
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
````

Replace with:

````markdown
```sh
ssh mac-mini
git clone <this-repo-url> grey_website
cd grey_website

# Required — set bootstrap superuser credentials (and optionally HOST_PORT).
# The stack will refuse to start without PB_SUPERUSER_EMAIL/PASSWORD.
cp .env.example .env
$EDITOR .env

# Build both images and start in the background
docker compose up -d --build
```
````

(Just one word changed — `# Optional` → `# Required` — and the comment expanded. The rest of the block is the same.)

- [ ] **Step 4.4: Replace the "Create the first owner account (CLI — recommended for headless)" subsection (around lines 211-220).**

Current content:

````markdown
### Create the first owner account (CLI — recommended for headless)

```sh
docker compose exec pb pocketbase superuser upsert you@example.com 'a-strong-password'
#    expect: Successfully saved superuser "you@example.com"!
```

> **Pick a strong password.** It's the one credential between visitors and edit access — there is no second factor, no rate-limited brute-force protection beyond PocketBase's small built-in throttle, and no recovery flow if you lose it. A long passphrase managed by a password manager is the right shape.

If you'd rather use the admin UI, point a browser on the same LAN at `http://<mac-mini-ip>:8080/_/` and follow the first-run prompts. The CLI is just safer for fully-headless setups.
````

Replace with:

````markdown
### The owner account is already created

If you got past the verification step above, the bootstrap superuser already exists — `pb`'s entrypoint ran `pocketbase superuser upsert` using `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` from `.env` before serving traffic. Sign in at `http://<mac-mini-ip>:8080/` (or wherever you've pointed your domain) with those credentials.

> **Pick a strong password.** It's the one credential between visitors and edit access — there is no second factor, no rate-limited brute-force protection beyond PocketBase's small built-in throttle, and no recovery flow if you lose it. A long passphrase managed by a password manager is the right shape.

To rotate the password later: edit `.env`, then `docker compose restart pb`. Don't change it through the `/_/` admin UI for the bootstrap email — the next `pb` restart will revert it to the `.env` value. Other superusers (different email) created via `/_/` are not touched by the bootstrap.
````

- [ ] **Step 4.5: Update the "Locked out of `/_/` admin (forgot superuser password)" troubleshooting entry (around lines 474-479).**

Current content:

````markdown
**Locked out of `/_/` admin (forgot superuser password).**
Recover from the Mac mini shell:
```sh
docker compose exec pb pocketbase superuser update-password your@email '<new-password>'
```
Or upsert with `pocketbase superuser upsert your@email '<new-password>'` to overwrite.
````

Replace with:

````markdown
**Locked out of `/_/` admin (forgot superuser password).**
For the bootstrap superuser, edit `.env` to a new password and restart `pb` — the entrypoint re-runs `upsert` and your new password takes effect:
```sh
$EDITOR .env                    # set PB_SUPERUSER_PASSWORD to a fresh value
docker compose restart pb
```
For an additional superuser created via `/_/` (different email from `.env`), use the CLI directly:
```sh
docker compose exec pb pocketbase superuser update-password their@email '<new-password>'
# or, to overwrite-create:
docker compose exec pb pocketbase superuser upsert their@email '<new-password>'
```
````

- [ ] **Step 4.6: Update the project-structure listing (around line 445).**

Current line:

```
├── .env.example           # HOST_PORT
```

Replace with:

```
├── .env.example           # HOST_PORT + PocketBase superuser bootstrap credentials
```

- [ ] **Step 4.7: Verify all the README edits are coherent.**

```bash
# Quickly skim the changed sections in context
grep -n -A1 -B1 '\.env' README.md | head -60
```

Expected: every reference to `.env` is consistent — the bootstrap-from-`.env` story is the same in local-dev, production, and troubleshooting. No leftover "first-run wizard" or "`docker compose exec ... upsert` for the first superuser" instructions.

```bash
# Sanity check the markdown still parses (no broken code fences)
awk 'BEGIN{count=0} /^```/{count++} END{if(count%2!=0) print "ERROR: unbalanced code fences"; else print "OK: " count " code fences, balanced"}' README.md
```

Expected: `OK: <even number> code fences, balanced`.

- [ ] **Step 4.8: Commit.**

```bash
git add README.md
git commit -s -S -m "docs: rewrite owner-account setup for .env-driven bootstrap

README's local-dev and production paths now both say 'set credentials
in .env, then docker compose up' rather than directing users to the
/_/ install wizard or 'docker compose exec ... superuser upsert'.
Adds a Rotating the Password section and a heads-up that the
bootstrap email's password is reverted on restart if changed via /_/.
Troubleshooting recipe for forgotten password switches to the .env
flow with a fallback to the CLI for non-bootstrap superusers."
```

---

## Task 5: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (the auth-flow description, the "How to run" section, and "What to be careful about")

- [ ] **Step 5.1: Update the "Auth (owner)" bullet under "Architecture → Data flow".**

Current content (around the line containing `**Auth (owner)**`):

```markdown
- **Auth (owner)** → `POST /api/collections/_superusers/auth-with-password` returns a JWT, stored in `localStorage["castiel-pb-token-v1"]` and sent as `Authorization: <token>` on writes. `auth-refresh` is called on app startup to drop a stale token.
```

Replace with:

```markdown
- **Auth (owner)** → `POST /api/collections/_superusers/auth-with-password` returns a JWT, stored in `localStorage["castiel-pb-token-v1"]` and sent as `Authorization: <token>` on writes. `auth-refresh` is called on app startup to drop a stale token. The bootstrap superuser itself is provisioned on every `pb` container start by `pb/entrypoint.sh`, which runs `pocketbase superuser upsert` using `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` from `.env`.
```

- [ ] **Step 5.2: Update the "Edit-lock" paragraph.**

Current content (the paragraph under the heading `### Edit-lock`):

```markdown
There is no longer a hardcoded passcode. The lock icon opens an email + password modal that calls PocketBase's superuser auth. A valid token in `localStorage` is what `unlocked === true` means; the same token gates every write request via the `Authorization` header.
```

Replace with:

```markdown
There is no longer a hardcoded passcode. The lock icon opens an email + password modal that calls PocketBase's superuser auth. A valid token in `localStorage` is what `unlocked === true` means; the same token gates every write request via the `Authorization` header. The accepted email + password are whatever's in `.env` as `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` — that's how the bootstrap superuser is provisioned at container start.
```

- [ ] **Step 5.3: Update the "How to run" section's two-line summary.**

Find this block:

```markdown
- **Local dev** (laptop): `docker compose up --build`, then `http://localhost:8080/_/` to create the first superuser, then `http://localhost:8080/` to use the site. Detailed flow in [README.md → Local development](./README.md#local-development-dev-instance).
- **Mac mini production** (headless server): `docker compose up -d --build` on the server, then `docker compose exec pb pocketbase superuser upsert email password` for the first superuser. Detailed flow in [README.md → Production — Mac mini headless server](./README.md#production--mac-mini-headless-server), including backup, HTTPS via Caddy, auto-start on reboot, and the security checklist.
```

Replace with:

```markdown
- **Local dev** (laptop): `cp .env.example .env`, fill in `PB_SUPERUSER_EMAIL`/`PB_SUPERUSER_PASSWORD`, then `docker compose up --build`, then `http://localhost:8080/` to use the site. The bootstrap superuser is auto-provisioned from `.env` on each `pb` start. Detailed flow in [README.md → Local development](./README.md#local-development-dev-instance).
- **Mac mini production** (headless server): same `.env` flow, then `docker compose up -d --build`. No separate "create the first superuser" step — `pb`'s entrypoint runs `pocketbase superuser upsert` with `.env` values before serving traffic. Detailed flow in [README.md → Production — Mac mini headless server](./README.md#production--mac-mini-headless-server), including backup, HTTPS via Caddy, auto-start on reboot, and the security checklist.
```

- [ ] **Step 5.4: Add a new bullet to the "What to be careful about" section.**

Find the existing bulleted list under `## What to be careful about`. Add this bullet **immediately after** the bullet about `pb_data/`:

```markdown
- **`.env` is the source of truth for the bootstrap superuser.** `pb/entrypoint.sh` re-runs `pocketbase superuser upsert` on every container start using `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`. If you change the password through the `/_/` admin UI for that email, the next `docker compose restart pb` will revert it. Rotate via `.env`, not via the UI. Additional superusers (different email) created via `/_/` are unaffected.
```

(Insert position: right after the `pb_data/` bullet, before whatever bullet comes next.)

- [ ] **Step 5.5: Verify the edits read coherently.**

```bash
grep -n -B1 -A1 -i '\.env\|superuser\|bootstrap' CLAUDE.md | head -50
```

Expected: every mention of superuser/bootstrap/.env is consistent — no leftover references to `/_/` install wizard or `docker compose exec ... superuser upsert` for the *bootstrap* superuser.

- [ ] **Step 5.6: Commit.**

```bash
git add CLAUDE.md
git commit -s -S -m "docs: update CLAUDE.md for .env-driven superuser bootstrap

Updates the auth-flow description, edit-lock paragraph, and 'How to
run' summary to reflect that the bootstrap superuser is provisioned
from PB_SUPERUSER_EMAIL/PASSWORD in .env on every pb start (not via
the /_/ install wizard or a one-off 'docker compose exec' upsert).
Adds a 'What to be careful about' bullet warning that .env is
canonical — UI password changes for the bootstrap email get
reverted on the next pb restart."
```

---

## Task 6: Final cross-check and hand-off

- [ ] **Step 6.1: Confirm the worktree is clean and the commit log tells a coherent story.**

```bash
git status --short
git log --oneline main..HEAD
```

Expected: `git status` is empty. `git log` shows (newest first):

```
docs: update CLAUDE.md for .env-driven superuser bootstrap
docs: rewrite owner-account setup for .env-driven bootstrap
feat: require PB_SUPERUSER_* env vars in compose
feat: bootstrap pb superuser from .env on every container start
docs: spec for .env-driven pb superuser bootstrap
```

- [ ] **Step 6.2: Confirm every commit is signed.**

```bash
git log --show-signature main..HEAD 2>&1 | grep -E 'gpg|Signed-off-by' | sort -u
```

Expected: each commit shows both a `gpg: Good signature` line and a `Signed-off-by:` trailer (`-S` and `-s` respectively from the user's global commit policy). Five `Signed-off-by` lines, five `gpg: Good signature` lines.

- [ ] **Step 6.3: Confirm no unintended files or co-author trailers slipped in.**

```bash
git log main..HEAD --pretty=format:%B | grep -i -E 'co-authored|generated with claude' || echo "OK: no self-attribution"
```

Expected: `OK: no self-attribution`.

- [ ] **Step 6.4: Hand off to the user — do NOT merge unilaterally.**

Per the user's global `CLAUDE.md`: *"Merge to the feature branch only when done. 'Done' means: user explicitly says it's done, OR user explicitly says to merge, OR you asked and user said yes."*

Stop here. Report the worktree path and branch name, summarize the commits landed, list the verification results from Task 3, and ask the user whether to merge `feat/pb-superuser-bootstrap` into `main` and remove the worktree, or leave it for further iteration.

---

## Summary of resulting commits (newest at top)

| # | Commit message (subject) | Files |
|---|---|---|
| 5 | `docs: update CLAUDE.md for .env-driven superuser bootstrap` | `CLAUDE.md` |
| 4 | `docs: rewrite owner-account setup for .env-driven bootstrap` | `README.md` |
| 3 | `feat: require PB_SUPERUSER_* env vars in compose` | `docker-compose.yml`, `.env.example` |
| 2 | `feat: bootstrap pb superuser from .env on every container start` | `pb/entrypoint.sh`, `pb/Dockerfile` |
| 1 | `docs: spec for .env-driven pb superuser bootstrap` (already landed) | `docs/superpowers/specs/2026-04-27-pb-superuser-bootstrap-design.md` |

When merged with `--no-ff` into `main`, this surfaces as a single merge commit summarising the feature, with the five-commit history preserved on the branch.
