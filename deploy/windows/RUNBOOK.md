# TOCKINAX — Windows prod runbook (no-Docker path, this host)

Host assumptions (verified 2026-10-15): Windows + Node 24 + PostgreSQL 16 service
running + Redis reachable. Docker daemon DOWN — this path needs no Docker.

## 0. Layout

```
tockinax/
  backend/          # API :5070 (PM2 cluster ×2)
  frontend/         # site  :3001 (PM2 ×1)
  logs/             # pm2 logs (gitignored)
  deploy/windows/   # ecosystem.config.js, backup.ps1, healthcheck.ps1, Caddyfile.sample
  .env              # PROD values (gitignored, from .env.production.example)
```

## 1. First install (elevated PowerShell once)

```powershell
npm i -g pm2
npm install --package-lock-only          # refresh root lock (workspaces) — from repo ROOT, never inside frontend/
npm ci --workspace=backend --omit=dev
npm ci --workspace=frontend
cd frontend; npm run build; cd ..
```

Why root: `frontend/node_modules` nested installs duplicate React (see STATUS). Always
install from `C:\BerfamWorks\TOCKINAX`.

## 2. Environment

```powershell
cp .env.production.example .env
# edit: DATABASE_URL (prod db, own schema), REDIS_URL, JWT_SECRET/JWT_REFRESH_SECRET
# (openssl rand -base64 64 each), ENCRYPTION_KEY (openssl rand -hex 32),
# APP_URL=https://<domain>, API_URL=https://api.<domain>/api/v1,
# PGDUMP='C:\Program Files\PostgreSQL\16\bin\pg_dump.exe', BACKUP_DIR='C:\Backups\tockinax'
# Payment keys stay BLANK. All *_ENABLED=false. Verify: git status --porcelain (no .env).
cd backend; npm run db:migrate; npm run db:seed; cd ..
```

## 3. Start (PM2) + verify

```powershell
pm2 start deploy/windows/ecosystem.config.js --env production
pm2 save
powershell -File deploy/windows/healthcheck.ps1
cd backend; npm run test:live   # expect 34 passed, 0 failed
```

## 4. Boot persistence (Task Scheduler, run once as service account)

- Task `tockinax-pm2-resurrect`: trigger At Startup, action
  `pm2 resurrect` (full path, e.g. `%APPDATA%\npm\pm2.cmd resurrect`), run whether
  logged on or not. Test with a reboot.
- Task `tockinax-backup`: daily 02:00 →
  `powershell -ExecutionPolicy Bypass -File C:\BerfamWorks\TOCKINAX\deploy\windows\backup.ps1`
  with `DATABASE_URL`/`BACKUP_DIR` in the task environment. Retains 30d.
- Task `tockinax-health`: every 5 min → `healthcheck.ps1`; on exit 1, restart
  `pm2 restart all` and page ops (see §7).

## 5. TLS reverse proxy (Caddy, automatic certs)

```powershell
# install caddy, copy sample, edit domain:
Copy-Item deploy/windows/Caddyfile.sample Caddyfile
# edit example.com -> your WEBSITE_DOMAIN, api.example.com -> api.<domain>
caddy run --config Caddyfile
```

Node never serves public HTTP directly. HSTS is already emitted by the API.

## 6. Restore drill (quarterly, log evidence in STATUS.md)

```powershell
# stop app writes first (pm2 stop all), then:
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' -d $env:DATABASE_URL -c 'C:\Backups\tockinax\tockinax-<date>.dump'
cd backend; npm run db:migrate; npm run test:live
```

## 7. Monitoring (minimum viable)

- Liveness `GET /healthz` 200 `{ok:true}`; readiness `GET /readyz` 200 (503 = DB down).
- Alert on: readyz ≠200 >2 min, 5xx spike, `423 locked` spike, payout queue depth
  (`GET /api/v1/admin/overview` → `finance.payouts_pending`), `reconciliation_runs.mismatches>0`.
- Logs: `logs/` → ship to your aggregator. Never log secrets (PII already redacted).

## 8. Rollback

- Releases are git SHAs: `git fetch; git checkout <sha>; npm ci (workspaces); frontend build; pm2 restart all`.
- Migrations are forward-only — no auto-downgrade. Keep the pre-release `.dump` from §6
  task; restore-before-rollback on staging first.
- Kill-switch (no redeploy): set `live_payments` / `rewards_payouts` / `crypto_*`
  flags false in `feature_flags` — payouts and crypto halt immediately.
