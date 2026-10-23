// Token pricing — SIMPLE interest only, Decimal.js, never float.
// Simulated pilot: 1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled.
// Rule semantics: pricing_rules.rate_bps_per_day is PER-DAY bps (100 = 1%/day).
//   Term total for 7d  = 100*7  = 700 bps  (7%)  => 100 -> 107
//   Term total for 14d = 100*14 = 1400 bps (14%) => 100 -> 114
// Simple, NOT compound: 14d total = cost*(1+0.01*14), never cost*1.01^14.
const Decimal = require('decimal.js');
const { getPool } = require('./db');

// Pure math — hermetic, no DB. Exported for unit tests.
function priceSimple(costUsdt, lockDays, rateBpsPerDay) {
  const cost = new Decimal(costUsdt);
  if (cost.lte(0)) throw new Error('invalid_cost');
  if (![7, 14].includes(lockDays)) throw new Error('invalid_lock_days');
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
  if (![7, 14].includes(lockDays)) throw Object.assign(new Error('invalid_lock_days'), { status: 400 });
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
  if (![7, 14].includes(lockDays)) throw new Error('invalid_lock_days');
  return new Date(base.getTime() + lockDays * 24 * 60 * 60 * 1000);
}

module.exports = { priceSimple, targetPrice, maturesAt };
