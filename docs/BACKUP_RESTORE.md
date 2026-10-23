# TOCKINAX BACKUP & RESTORE

## PostgreSQL (source of truth)

Nightly logical backup (cron on the db host or a backup sidecar):

```bash
pg_dump "$DATABASE_URL" -Fc -f /backups/tockinax-$(date +%F).dump
find /backups -name 'tockinax-*' -mtime +30 -delete   # 30-day retention
```

Copy `/backups` off-host (object storage) — a backup that never leaves the host is not a backup.

## Redis (queue/cache — RDB note)

Redis runs `--appendonly yes` on a named volume. It holds **ephemeral** job/cache
state, not money (ledger lives in Postgres). Volume snapshots ride along with the
nightly job:

```bash
docker run --rm -v tockinax-prod-redisdata:/data -v /backups:/b alpine \
  tar czf /b/tockinax-redis-$(date +%F).tgz -C /data .
```

## Restore steps

```bash
# 1. Restore Postgres (clean target DB first on a drill host)
pg_restore -d "$DATABASE_URL" -c /backups/tockinax-<date>.dump
# 2. Re-apply any newer migrations (no-op if current)
cd backend && npm run db:migrate
# 3. Restore redis volume (optional — queues rebuild from DB sweeps)
docker run --rm -v tockinax-prod-redisdata:/data -v /backups:/b alpine \
  tar xzf /b/tockinax-redis-<date>.tgz -C /data
# 4. Restart services
docker compose -f docker-compose.prod.yml up -d
```

## Verify (test query — run after every restore)

```bash
curl -s http://localhost:5070/readyz
psql "$DATABASE_URL" -c "SELECT count(*) FROM ledger_transactions;"
psql "$DATABASE_URL" -c "SELECT sum(debit-credit) AS imbalance FROM ledger_entries;"
# imbalance must be 0; any non-zero value = STOP, page finance + security.
```
