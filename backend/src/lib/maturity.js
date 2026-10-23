// Maturity + settlement sweeps — SIMULATED pilot. Idempotent, Decimal-safe.
// matureDue: locked + matures_at < now -> matured + auto-create token_listing at target price.
// settleDue: fully filled listings -> holding settled + cycle success (partial proceeds already credited at fill time).
const crypto = require('crypto');
const { Decimal } = require('decimal.js');
const { getPool } = require('./db');
const { priceSimple } = require('./tokenPricing');

// Pure helpers (hermetic, unit-tested)
function isMatured(maturesAt, now) {
  const m = new Date(maturesAt);
  const n = now ? new Date(now) : new Date();
  if (Number.isNaN(m.getTime()) || Number.isNaN(n.getTime())) throw new Error('invalid_date');
  return m.getTime() < n.getTime();
}
function isFillComplete(remainingQty) {
  return new Decimal(remainingQty).equals(0);
}

async function matureDue(db) {
  const pool = getPool();
  const q = db || pool;
  const due = await q.query(
    `select * from token_holdings where status = 'locked' and matures_at < now() order by matures_at asc limit 50`
  );
  let matured = 0;
  for (const h of due.rows) {
    try {
      // Idempotent: skip if listing already exists for this holding
      const ex = await q.query(`select id from token_listings where holding_id = $1`, [h.id]);
      if (ex.rowCount) {
        await q.query(`update token_holdings set status='listed', listing_id=$1 where id=$2 and status='locked'`, [ex.rows[0].id, h.id]);
        await q.query(`update participation_cycles set matured_at=now(), status='matured' where holding_id=$1 and matured_at is null`, [h.id]);
        matured++;
        continue;
      }
      const rule = await q.query(
        `select * from pricing_rules where active=true and lock_days=$1 and basis='simple' order by version desc limit 1`,
        [h.lock_days]
      );
      if (!rule.rowCount) continue; // no active rule -> leave locked, never invent price
      const { total, unit } = priceSimple(h.cost_usdt, h.lock_days, rule.rows[0].rate_bps_per_day);
      const listingId = crypto.randomUUID();
      await q.query(
        `insert into token_listings (id, holding_id, seller_id, total_qty, remaining_qty, ask_unit_price, target_value, status)
         values ($1,$2,$3,$4,$4,$5,$6,'open') on conflict do nothing`,
        [listingId, h.id, h.user_id, new Decimal(h.qty).toFixed(4), unit, total]
      );
      const li = await q.query(`select id from token_listings where holding_id=$1`, [h.id]);
      await q.query(`update token_holdings set status='listed', listing_id=$1 where id=$2`, [li.rows[0].id, h.id]);
      await q.query(`update participation_cycles set matured_at=now(), status='matured' where holding_id=$1 and matured_at is null`, [h.id]);
      matured++;
    } catch (e) { console.error('[matureDue]', h.id, e.message); }
  }
  return { matured };
}

async function settleDue(db) {
  const pool = getPool();
  const q = db || pool;
  // Holdings with a filled listing (remaining 0) that are not yet settled
  const due = await q.query(
    `select h.id as holding_id, l.id as listing_id from token_holdings h
     join token_listings l on l.holding_id = h.id
     where h.status in ('listed','matured','settling') and l.status = 'filled' and l.remaining_qty = 0 limit 50`
  );
  let settled = 0;
  for (const row of due.rows) {
    try {
      await q.query(`update token_holdings set status='settled' where id=$1`, [row.holding_id]);
      await q.query(
        `update participation_cycles set settled_at=now(), status='settled', success=true where holding_id=$1`,
        [row.holding_id]
      );
      settled++;
    } catch (e) { console.error('[settleDue]', row.holding_id, e.message); }
  }
  return { settled };
}

module.exports = { matureDue, settleDue, isMatured, isFillComplete };
