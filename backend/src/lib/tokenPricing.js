// Token pricing — SIMPLE interest only, Decimal.js, never float.
// 1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled.
// Approved plan: 7 / 14 / 30-day lock terms.
// Rule semantics: pricing_rules.rate_bps_per_day is PER-DAY bps.
//   7d  =  60 bps/day => 420 bps  (4.20%)  => 100 -> 104.20
//   14d =  75 bps/day => 1050 bps (10.50%) => 100 -> 110.50
//   30d = 100 bps/day => 3000 bps (30.00%) => 100 -> 130.00
// Simple, NOT compound: total = cost*(1 + rate*days/10000).
const Decimal = require('decimal.js');
const { getPool } = require('./db');

const LOCK_DAYS = Object.freeze([7, 14, 30]);

// Pure math — hermetic, no DB. Exported for unit tests.
function priceSimple(costUsdt, lockDays, rateBpsPerDay) {
  const cost = new Decimal(costUsdt);
  if (cost.lte(0)) throw new Error('invalid_cost');
  if (!LOCK_DAYS.includes(lockDays)) throw new Error('invalid_lock_days');
  const rate = new Decimal(rateBpsPerDay);
  if (rate.isNeg()) throw new Error('invalid_rate');
  // total = cost * (1 + rate*days/10000)
  const total = cost.mul(new Decimal(1).plus(rate.mul(lockDays).div(10000)));
  // Mint basis 1 TKX = 1 USDT => qty == cost numerically, unit = total / qty
  const qty = cost;
  const unit = total.div(qty);
  return {
    total: total.toFixed(4),
    unit: unit.toFixed(4),
  };
}

// DB-backed: reads ACTIVE pricing rule for the lock term. Throws if none.
async function targetPrice(costUsdt, lockDays, client) {
  if (!LOCK_DAYS.includes(lockDays)) throw Object.assign(new Error('invalid_lock_days'), { status: 400 });
  const pool = getPool();
  const db = client || pool;
  const r = await db.query(
    `select * from pricing_rules where active = true and lock_days = $1 and basis = 'simple' order by version desc limit 1`,
    [lockDays]
  );
  if (!r.rowCount) throw Object.assign(new Error('no_active_pricing_rule'), { status: 503 });
  const rule = r.rows[0];
  const { total, unit } = priceSimple(costUsdt, lockDays, rule.rate_bps_per_day);
  return { unit, total, ruleVersion: rule.version, rateBpsPerDay: rule.rate_bps_per_day };
}

function maturesAt(purchasedAt, lockDays) {
  const base = purchasedAt ? new Date(purchasedAt) : new Date();
  if (Number.isNaN(base.getTime())) throw new Error('invalid_date');
  if (!LOCK_DAYS.includes(lockDays)) throw new Error('invalid_lock_days');
  return new Date(base.getTime() + lockDays * 24 * 60 * 60 * 1000);
}

module.exports = { LOCK_DAYS, priceSimple, targetPrice, maturesAt };
