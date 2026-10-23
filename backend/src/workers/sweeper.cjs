// Order expiry + commission rollup sweeper (MVP: node timer, no new deps).
// Prod path: move to BullMQ + Redis (REDIS_URL) — same queries, same idempotency keys.
// Usage: node src/workers/sweeper.cjs [--once]  (default: loop every 60s)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
const ONCE = process.argv.includes('--once');

async function sweep(client) {
  const db = client || pool;
  // 1. Expire stale pending_payment orders (48h window set at creation)
  const exp = await db.query(
    `update orders set status='expired', updated_at=now()
     where status='pending_payment' and expires_at is not null and expires_at < now()
     returning id, order_no`);
  // 2. Commission rollup: completed orders past confirmation window with no calc attempt.
  // NOTE: engine itself enforces active-rules + budget + idempotency; sweeper just calls it.
  // We only auto-run for active rule versions to preserve the DISABLED-by-default safeguard.
  let rolled = 0;
  try {
    const active = await db.query(`select count(*)::int as n from commission_rules where active=true`);
    if (active.rows[0].n > 0) {
      const { calculateForOrder } = require('../lib/commissions');
      const due = await db.query(
        `select o.id from orders o left join commission_calculations c on c.order_id=o.id
         where o.status in ('completed','resolved_completed') and o.completed_at < now() - interval '1 minute'
         group by o.id having count(c.id)=0 limit 25`);
      for (const row of due.rows) {
        try { await calculateForOrder(row.id); rolled++; } catch (e) { console.error('[sweeper] calc', row.id, e.message); }
      }
    }
  } catch (e) { console.error('[sweeper] rollup skipped:', e.message); }
  // 3. Dispute SLA: flag disputes open >48h as fraud/risk signal (detection only, no auto-resolve)
  const stale = await db.query(
    `insert into fraud_risk_events (kind, order_id, detail)
     select 'dispute_sla_breach', order_id, jsonb_build_object('dispute_id', id, 'open_for', now()-created_at)
     from disputes where status in ('open','under_review') and created_at < now() - interval '48 hours'
     on conflict do nothing returning id`).catch(() => ({ rowCount: 0, rows: [] }));
  // 4. Token pilot: mature locked holdings into listings + settle fully-filled holdings.
  // Best-effort only — never throws the core sweep; tables may not exist pre-migration.
  let tokenMatured = 0, tokenSettled = 0;
  try {
    const { matureDue, settleDue } = require('../lib/maturity');
    const m = await matureDue(db).catch(() => ({ matured: 0 }));
    const s = await settleDue(db).catch(() => ({ settled: 0 }));
    tokenMatured = m.matured || 0; tokenSettled = s.settled || 0;
  } catch (e) { console.error('[sweeper] token sweep skipped:', e.message); }
  return { expired: exp.rowCount, rolled, slaFlagged: stale.rowCount || 0, tokenMatured, tokenSettled };
}

(async () => {
  if (ONCE) {
    const r = await sweep();
    console.log('[sweeper:once]', JSON.stringify(r));
    await pool.end();
    process.exit(0);
  }
  console.log('[sweeper] loop every 60s (Ctrl+C to stop)');
  setInterval(async () => {
    try {
      const r = await sweep();
      if (r.expired || r.rolled || r.slaFlagged || r.tokenMatured || r.tokenSettled) console.log('[sweeper]', new Date().toISOString(), JSON.stringify(r));
    } catch (e) { console.error('[sweeper] tick failed:', e.message); }
  }, 60_000);
})();
