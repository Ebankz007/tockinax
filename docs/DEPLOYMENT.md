# TOCKINAX DEPLOYMENT guide

## 1. Live topology (as actually deployed)

| Layer | What | Address |
|---|---|---|
| Public entry | Apache vhost `tockinax.com.conf` | `:80` → 301, `:443` TLS |
| API | PM2 `tockinax-api` (Node) | `127.0.0.1:4002` |
| Web | PM2 `tockinax-web` (Next 14) | `127.0.0.1:3201` |
| Database | PostgreSQL, schema `gatedp2p` | `127.0.0.1:5432` |
| Cache | Redis | `127.0.0.1:6379` |

Node never serves raw HTTP to the internet — Apache terminates TLS and proxies.
**The web server on this box is Apache (`httpd`), not nginx.** The nginx vhost
directory is vestigial and `nginx` is inactive.

The API is **same-origin** at `https://tockinax.com/api/v1`. There is no `api.`
subdomain (no DNS record) and therefore no second certificate and no CORS
allow-list to maintain.

The app checkout is `/www/wwwroot/tockinax`. The DocumentRoot is a **different**
directory, `/www/wwwroot/tockinax.com`, which exists only to serve the ACME
challenge path. No repository file — source, `.env`, `.git` — is reachable over
HTTP. Verified: `/.env`, `/.git/config`, `/package.json`, `/backend/db/seed.cjs`
all return 404.

The certificate covers `tockinax.com` only (no `www`, no `api` SANs). `www` is
handled by a `ServerAlias` on the `:80` vhost that 301s to the apex, so visitors
typing `www.` land on a valid certificate. Adding `www` to HTTPS directly needs a
SAN reissue.

The API emits `Strict-Transport-Security` with `includeSubDomains`; submit the
domain for preload only after every subdomain in use resolves over valid TLS.

## 2. Environment setup

```powershell
cp .env.example .env
# Generate secrets — never reuse dev placeholders:
#   openssl rand -base64 64   # JWT_SECRET, JWT_REFRESH_SECRET
#   openssl rand -hex 32      # ENCRYPTION_KEY
```

Required prod values: `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `ENCRYPTION_KEY`,
`APP_URL` (public site origin — CORS allow-list), `API_URL`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`. Payment keys stay **blank** until
`COMPLIANCE_CHECKLIST.md` sign-off (`LIVE_PAYMENTS_ENABLED=false` default).
`.env` is git-ignored — verify with `git status --porcelain` before any commit.

## 3. Database: migrate + seed

```powershell
cd backend
npm install
npm run db:migrate
npm run db:seed
```

Seeds are idempotent and contain no secrets. Seed campaigns land `draft` +
unfunded; feature flags land disabled (`rewards_payouts`, `crypto_*`, live payments).

## 4. Admin bootstrap

```powershell
cd backend
npm run admin:create -- --email ops@example.com
# → prints one-time bootstrap link/token (TTL ADMIN_BOOTSTRAP_TOKEN_TTL_MIN, default 60m).
# Complete MFA enrolment immediately; finance roles require TOTP.
```

## 5. Deploying

Production does **not** run Docker. It runs PM2 under Apache on the aaPanel box.

### Automatic (normal path)

`deploy/deploy.sh` is on a 2-minute cron:

```cron
*/2 * * * * /www/wwwroot/tockinax/deploy/deploy.sh >/dev/null 2>&1
```

Each tick it fetches `origin/main` and then:

1. **Same commit** → health check only. Nothing is rebuilt.
2. **CI not `success`** for the new SHA → refuses to deploy (fail closed) and
   tries again next tick. No CI status available also refuses.
3. **This SHA already failed once** → stays put until a *new* commit arrives,
   so a broken commit cannot loop forever.
4. **CI green** → `git reset --hard`, `npm ci` (skipped when the lockfile is
   unchanged), migrations, `next build`, `pm2 reload`, health checks.
5. **Any failure or failed health check** → records the SHA, rolls back to the
   previous commit, rebuilds, restarts. The site keeps serving the old build.

Every step appends its full output to `/var/log/tockinax-deploy.log`. Nothing is
discarded — a failure with no diagnostic is a failure that cannot be fixed.

`NEXT_PUBLIC_API_URL` is exported at build time; it is baked into the bundle, so
changing the public API base requires a rebuild, not just a restart.

### Manual

```bash
cd /www/wwwroot/tockinax
git fetch origin main && git reset --hard origin/main
npm ci
npm run db:migrate:all --workspace=backend
NEXT_PUBLIC_API_URL=https://tockinax.com/api/v1 npm run build
pm2 reload tockinax-api tockinax-web
```

### Health

```bash
curl -s http://127.0.0.1:4002/healthz      # API
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3201/   # web
curl -s https://tockinax.com/api/v1/content/settings/public     # end to end
```

`/readyz` returns 503 until the database is reachable.

## 6. Backup — `pg_dump` cron (see also BACKUP_RESTORE.md)

```cron
# nightly 02:00, retain 30d off-host
0 2 * * * pg_dump "$DATABASE_URL" -Fc -f /backups/tockinax-$(date +\%F).dump && find /backups -name 'tockinax-*' -mtime +30 -delete
```

Redis persists via AOF+RDB volume; snapshot the volume with the same job.

## 7. Restore drill (quarterly, record evidence)

1. `pg_restore -d "$DATABASE_URL" -c /backups/tockinax-<date>.dump`
2. `npm run db:migrate` (no-op if current)
3. Smoke: register → verify → login → `GET /referrals/me` 200 → `GET /rewards/campaigns` shows draft.
4. Log the drill in `STATUS.md` test-report section.

## 8. Rollback

- **Automatic.** `deploy.sh` rolls back on its own: if the build or a health
  check fails it resets to the previous commit, reinstalls, rebuilds and
  restarts. The failed SHA is recorded in `/var/lib/tockinax-deploy/failed-sha`
  and will not be retried — a new commit clears the mark.
- **Manual.** `git reset --hard <previous-sha>` then the manual sequence in §5.
- **Migrations are forward-only.** Rolling back code does *not* undo a schema
  change; a release that added a migration needs a compensating script. The
  rollback in `deploy.sh` restores the code, not the schema — that is deliberate
  (an auto-downgrade is more dangerous than a code-only rollback).
- Feature flags (`live_payments`, `rewards_payouts`, `crypto_*`) can be flipped
  off instantly without a redeploy.

## 9. Monitoring

- Liveness: `GET /healthz` (200 + `{ok:true}`). Readiness: `GET /readyz` (503 on DB failure).
- Alert on: `readyz` non-200 >2 min, 5xx rate, `423 locked` spikes (credential stuffing),
  payout queue depth, `reconciliation_runs.mismatches>0`.
- Structured logs: `morgan combined` in prod → ship to your log aggregator.
