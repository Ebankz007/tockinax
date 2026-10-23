# TOCKINAX DEPLOYMENT guide

## 1. DNS / HTTPS (reverse proxy)

- Point `WEBSITE_DOMAIN` (A/AAAA) at the proxy host. Terminate TLS at the proxy
  (Caddy/Nginx/Traefik) — Node never serves raw HTTP in prod.
- Example (Caddy): `{$WEBSITE_DOMAIN} { reverse_proxy frontend:3001; }` +
  `api.{$WEBSITE_DOMAIN} { reverse_proxy backend:5070; }`.
- HSTS is emitted by the API (`max-age=15552000, includeSubDomains, preload`);
  submit the domain for preload only after HTTPS is verified end-to-end.

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

## 5. Prod compose

```powershell
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl https://api.<domain>/healthz
curl https://api.<domain>/readyz   # 503 until DB reachable
```

`backend`/`frontend`/`db`/`redis` all `restart: always`, named volumes
`tockinax-prod-pgdata`, `tockinax-prod-redisdata`.

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

- Images are pinned per release (`tockinax-backend:<git-sha>` tag at deploy time).
- Rollback = redeploy previous tag. **Migrations are forward-only**: if a release
  added a migration, rolling back code still needs a compensating `migrate down`
  script — there is no auto-downgrade. Test restore on staging first.
- Feature flags (`live_payments`, `rewards_payouts`, `crypto_*`) can be flipped
  off instantly without a redeploy.

## 9. Monitoring

- Liveness: `GET /healthz` (200 + `{ok:true}`). Readiness: `GET /readyz` (503 on DB failure).
- Alert on: `readyz` non-200 >2 min, 5xx rate, `423 locked` spikes (credential stuffing),
  payout queue depth, `reconciliation_runs.mismatches>0`.
- Structured logs: `morgan combined` in prod → ship to your log aggregator.
