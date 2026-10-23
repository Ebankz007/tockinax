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
2. `npm run db:migrate` → creates schema `gatedp2p` and all tables.
3. `npm run db:seed` → approved compensation plan, feature gates **off**.
4. `npm test` → the DB suites now **execute** instead of skipping.
5. `node token-smoke.cjs` → token purchase → maturity → auto-list → partial fills → oversell rejection.
6. `node live-smoke.cjs` → register → list → order → evidence → dispute → ledger → payout guards.
7. `node cover-check.cjs` → every URL the frontend calls exists on the backend.

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

### 3.1 Version control (required — currently missing)
`C:\BerfamWorks\TOCKINAX` is **not a git repository**. Actions cannot run until
it is one with a GitHub remote.

```powershell
cd C:\BerfamWorks\TOCKINAX
git init -b main
git add .
git commit -m "chore: initial import + CI/CD pipeline"
gh repo create <owner>/tockinax --private --source=. --remote=origin --push
```

`.gitignore` already excludes `node_modules/`, `.next/`, `.env`, logs, dumps.
Verify before the first commit: `git status --porcelain` must not list `.env`.

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
- Caddy/Nginx in front, TLS terminated there (`docs/DEPLOYMENT.md` §1).
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
npm ci                        # root, workspaces
npm run test --workspace=backend        # hermetic
npm run db:migrate; npm run db:seed     # against local dev DB
node backend/token-smoke.cjs
node backend/live-smoke.cjs
node backend/cover-check.cjs
npm run build --workspace=frontend
```

---

## 6. Known debt / next steps

- **Node 20 is EOL (2026-04).** CI and both Dockerfiles pin `node:20-alpine`.
  Bump all three to `node:22-alpine` (LTS) together — one PR, verify in CI.
- **No linter.** There is no ESLint/Prettier config. Add ESLint (flat config) +
  a `lint` job once the rule set is agreed; don't bolt it on mid-release.
- **No staging environment.** CD goes straight to `production`. Add a
  `staging` environment + second compose stack before the first real release.
- **No secret scanning / SAST.** Enable GitHub secret scanning + CodeQL in repo
  settings (free for private repos).
- **Frontend image healthcheck** uses `grep -q .` (weak). Consider a `/` status
  assertion once a stable health endpoint exists.
- **`deploy` has no smoke test beyond `/healthz`.** Add a read-only authenticated
  probe once a dedicated CI service account exists.
