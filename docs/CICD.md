# TOCKINAX — CI/CD

Two GitHub Actions workflows, plus Dependabot.

| Workflow | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | push to `main`/`master`/`develop`, every PR, manual | Prove the code is correct on every change |
| `.github/workflows/cd.yml` | push to `main`/`master`, tag `v*`, manual | Build images, publish to GHCR, deploy (gated) |
| `.github/dependabot.yml` | weekly | Dependency + base-image + action updates |

---

## 1. CI — what actually runs

Four jobs. A red job blocks the merge.

### `unit` — hermetic gate (no database)
- `npm ci` at the **repo root** (npm workspaces → one lockfile).
- `node --check` over every file in `backend/src` and `backend/db`.
- `jest` in `backend`. The DB suites (`marketplace`, `payouts`, `referrals`,
  `rewards`) are guarded by `process.env.DATABASE_URL ? describe : describe.skip`,
  so here they **skip** — that is intentional. They run for real in `integration`.

### `frontend` — production build
- `npm ci`, then `next build` in `frontend`. Catches type errors, broken imports,
  and bad App Router contracts before they reach a container.

### `integration` — the job that matters (real Postgres 16)
1. Starts a `postgres:16-alpine` service container.
2. `npm run db:migrate` → schema `gatedp2p` + token tables.
3. `npm run db:migrate:payments` → `deposit_intents`, `withdrawal_requests`, `withdrawal_events`.
4. `npm run db:seed` → approved compensation plan, feature gates **off**.
5. `npm test` → the DB suites now **execute** instead of skipping.
6. `node token-smoke.cjs` → token purchase → maturity → auto-list → partial fills → oversell rejection.
7. `node live-smoke.cjs` → register → list → order → evidence → dispute → ledger → payout guards.
8. `node cover-check.cjs` → every URL the frontend calls exists on the backend.

> **Both migrations must run, in order.** `deposit_intents` and the withdrawal
> tables live in `migrate-payments.cjs`, a *separate* script that had no npm
> script and was never run in CI. Without it every deposit path 500s.
> `npm run db:migrate:all` runs both.

> **This job is the only place the cold-start path is exercised.** The
> `varchar(8)` widening, the table DDL and the seed are all first-run-only code
> paths; on a developer machine the database has already been migrated, so a
> broken cold path stays invisible. Three real defects were found this way
> (lessons 249/250). Never remove this job, and never point it at a warm DB.

All three smoke scripts are in-process (`supertest` + `buildApp()`), so no
detached server is needed. Money gates are forced `false` via job env.

### `docker` — image build
Builds both images with the **repo-root context** (`.`) — required because the
Dockerfiles `COPY package.json package-lock.json` from the root. Uses GitHub
Actions layer cache.

> **Why the original `ci.yml` was broken:** it cached on `backend/package.json`
> (no lockfile there), ran `npm ci` inside `backend/`, and built with
> `./backend` / `./frontend` as context. All three fail on a workspace repo.

---

## 2. CD — what runs on `main`

```
push to main / tag v*  ->  images job  ->  deploy job
```

### `images`
- Builds both images with root context.
- Pushes to GHCR:
  - `ghcr.io/<owner>/<repo>-backend:<sha12>` (or the tag name for `v*`)
  - `ghcr.io/<owner>/<repo>-frontend:<sha12>`
  - plus `:latest`.

### `deploy` — gated twice
1. `environment: production` → add **required reviewers** in
   *Repo Settings → Environments → production* so a human approves each release.
2. `if: vars.DEPLOY_ENABLED == 'true'` → the job is **skipped** until you flip
   the variable. Nothing deploys by accident.

When enabled, it: copies `docker-compose.prod.yml` to the host, pulls the new
images, runs **migrations before** starting the new app containers, `up -d`,
prunes old images, then polls `$PUBLIC_API_URL/healthz` until `{"ok":true}`.

`docker-compose.prod.yml` now accepts `BACKEND_IMAGE` / `FRONTEND_IMAGE` and
still builds locally when they are unset (backward compatible).

---

## 3. One-time setup (in order)

### 3.1 Version control — DONE
Repo: **`github.com/Ebankz007/tockinax`**, branch `main`, remote `origin`.
`gh` is not authenticated on this machine, but Windows Credential Manager holds
an `Ebankz007` credential for github.com, so `git push` works without a PAT.

> **The repo is currently PUBLIC.** Source, docs and the compensation-plan
> numbers are world-readable. Flip it in *Settings → General → Danger Zone →
> Change visibility* (or `gh repo edit --visibility private`) if that was not
> intended. Source disclosure is effectively irreversible once indexed.

`.gitattributes` pins `*.sh` to LF — a CRLF shell script fails on Linux with
`bad interpreter: /bin/bash^M`. `.gitignore` excludes `node_modules/`, `.next/`,
`.env`, logs, dumps. Verify before any commit: `git status --porcelain` must not
list `.env`.

### 3.2 Branch protection (recommended)
On `main`: require PR, require the `unit`, `frontend`, `integration`, `docker`
checks, no direct pushes. CD only ever deploys `main`/tags.

### 3.3 Repository variables

| Variable | Value | Needed for |
|---|---|---|
| `DEPLOY_ENABLED` | `true` | flip the deploy job on |
| `PUBLIC_API_URL` | `https://api.tockinax.com` | post-deploy health check |

### 3.4 Repository secrets (only when deploying)

| Secret | Meaning |
|---|---|
| `DEPLOY_HOST` | VPS hostname/IP |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_SSH_KEY` | private key (deploy-only, no passphrase) |
| `DEPLOY_PATH` | directory holding `.env` + `docker-compose.prod.yml` |

`GITHUB_TOKEN` is used automatically for GHCR — no PAT needed.

### 3.5 On the host (once)
- Docker Engine + Compose plugin.
- A `.env` file (from `.env.example`) with **real** secrets — never in the repo.
- Apache in front, TLS terminated there (`docs/DEPLOYMENT.md` §1).
- `docker login ghcr.io` is performed by the deploy job each run.

---

## 4. Rollback

Images are immutable and SHA-tagged.

```bash
# on the host
export BACKEND_IMAGE=ghcr.io/<owner>/<repo>-backend:<previous-sha>
export FRONTEND_IMAGE=ghcr.io/<owner>/<repo>-frontend:<previous-sha>
docker compose -f docker-compose.prod.yml up -d
```

**Migrations are forward-only.** If the bad release added a migration, rolling
the image back still needs a compensating script. Test restores on staging.
Feature flags (`live_payments`, `rewards_payouts`, `crypto_*`) can be flipped
off instantly without a redeploy — prefer that first.

---

## 5. Local parity

```powershell
npm ci                                   # root, workspaces
npm run test --workspace=backend         # hermetic (DB suites skip)
npm run db:migrate --workspace=backend   # schema gatedp2p + token tables
npm run db:migrate:payments --workspace=backend   # deposit/withdrawal tables
npm run db:seed --workspace=backend      # approved plan, payouts gated
node backend/token-smoke.cjs
node backend/live-smoke.cjs
node backend/cover-check.cjs
npm run build --workspace=frontend
```

**To reproduce CI locally, use an empty database.** The cold-start path is where
the real bugs live:

```powershell
# as a superuser
psql -c "drop database if exists tockinax_ci_repro"
psql -c "create database tockinax_ci_repro"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/tockinax_ci_repro"
npm run db:migrate:all --workspace=backend
npm run db:seed --workspace=backend
npm test --workspace=backend             # expect 70, not 63
```

---

## 6. Deploy target: aaPanel (NOT Docker)

**Status: implemented and live (2026-10-23).** The GitHub Actions CD job is
still the Docker/GHCR variant and remains inert (`DEPLOY_ENABLED` unset).
Production deploys through `deploy/deploy.sh` on the server instead.

### As built

| Item | Value |
|---|---|
| App checkout | `/www/wwwroot/tockinax` (NOT the DocumentRoot) |
| DocumentRoot | `/www/wwwroot/tockinax.com` (placeholder + ACME only) |
| API | PM2 `tockinax-api` → `127.0.0.1:4002` |
| Web | PM2 `tockinax-web` → `127.0.0.1:3201` |
| Database | `tockinax_prod` / user `tockinax_prod`, schema `gatedp2p` |
| Reverse proxy | Apache vhost `tockinax.com.conf` → `/api/` to 4002, `/` to 3201 |
| Public API base | `https://tockinax.com/api/v1` (same-origin, no CORS) |
| Deploy trigger | cron `*/2 * * * *` → `deploy/deploy.sh` |
| Log | `/var/log/tockinax-deploy.log` |

**Why the DocumentRoot is not the checkout:** every request except
`/.well-known/acme-challenge/` is proxied, and the repo lives in a *different*
directory, so no source file, `.env`, or `.git` object can ever be served from
disk. Verified: `/.env`, `/.git/config`, `/package.json`, `/backend/db/seed.cjs`
all return 404.

The live boxes (Aglotrends, COPINEX, AmplifiedTraders) are all the same shape:

| Layer | Reality |
|---|---|
| Panel | **aaPanel** at `192.227.176.232:21874` (IP-whitelisted) |
| Web | Apache reverse proxy → `127.0.0.1:<port>` |
| Process | **PM2** (`pm2 save` + `pm2-root` enabled so it survives reboot) |
| DB | PostgreSQL 16, one database per site |
| Deploy | a server-side cron (every 2 min) running `deploy.sh`, gated on CI status |

The working pattern from those boxes:

1. `deploy.sh` polls the GitHub API for the latest `main` CI conclusion.
2. **Fail closed**: `RED` refuses, `UNKNOWN` proceeds, a timeout refuses.
3. `git fetch && git reset --hard origin/main` into the checkout.
4. `npm ci` → migrations → `npm run build` → `pm2 reload`.
5. Log to `/var/log/tockinax-deploy.log`.

Two hard-won constraints to carry over:

- **The DocumentRoot must not be the checkout.** Serving the repo directly
  published `schema.prisma`, `deploy.sh` and `.git/config` over HTTPS. The
  reverse proxy is a *security control*, not a convenience — and the proof is a
  list of paths that must 404, not a page load.
- **TLS renewal belongs to aaPanel's own client** (`acme_v2.py`, HTTP-01 file
  verification against the DocumentRoot). `/.well-known/acme-challenge/` must be
  carved out of both the proxy and the http→https redirect, or renewal dies
  silently at the 90-day mark.

The `docker` CI job and `docker-compose.prod.yml` remain useful for local
parity and for a future container host — they are simply not the deploy path.

## 7. Known debt / next steps

- **Node 20 is EOL (2026-04).** CI and both Dockerfiles pin `node:20-alpine`.
  Bump all three to `node:22-alpine` (LTS) together — one PR, verify in CI.
- **No linter.** There is no ESLint/Prettier config. Add ESLint (flat config) +
  a `lint` job once the rule set is agreed; don't bolt it on mid-release.
- **The CD deploy job targets the wrong platform** (see §6). Rewrite for
  aaPanel/Apache+PM2 before enabling. Until then `DEPLOY_ENABLED` stays unset and
  the job is skipped.
- **No staging environment.** CD goes straight to `production`. Add a
  `staging` environment + second stack before the first real release.
- **No secret scanning / SAST.** Enable GitHub secret scanning + CodeQL in repo
  settings (free for private repos).
- **Frontend image healthcheck** uses `grep -q .` (weak). Consider a `/` status
  assertion once a stable health endpoint exists.
- **`deploy` has no smoke test beyond `/healthz`.** Add a read-only authenticated
  probe once a dedicated CI service account exists.
