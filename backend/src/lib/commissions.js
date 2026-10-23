// Commission engine — company-funded, eligible_verified_sales ONLY.
// Never recruitment: no payout for signups, only for completed (verified) sales.
const { Decimal } = require('decimal.js');
const { getPool } = require('./db');
const { postBalanced } = require('./ledger');

async function calculateForOrder(orderId, client) {
  const pool = getPool();
  const db = client || pool;
  const created = [];

  const o = await db.query(`select * from orders where id = $1`, [orderId]);
  if (!o.rowCount) throw Object.assign(new Error('order_not_found'), { status: 404 });
  const order = o.rows[0];
  if (order.status !== 'completed' && order.status !== 'resolved_completed') return [];
  if (!['NGN', 'USD'].includes(order.currency)) throw new Error('unsupported currency');

  // Skip refunded orders
  const ref = await db.query(`select 1 from refunds where order_id = $1 limit 1`, [orderId]);
  if (ref.rowCount) return [];

  // Walk referral_closure ancestors of the buyer (depth 1..5)
  const anc = await db.query(
    `select ancestor_id, depth from referral_closure where descendant_id = $1 and depth between 1 and 5 order by depth asc`,
    [order.buyer_id]
  );
  if (!anc.rowCount) return [];

  const rules = await db.query(
    `select * from commission_rules where active = true
     and (effective_to is null or effective_to > now()) order by version desc, level asc`
  );
  if (!rules.rowCount) return [];

  // Latest active version wins per level
  const byLevel = new Map();
  for (const r of rules.rows) {
    if (!byLevel.has(r.level)) byLevel.set(r.level, r);
  }

  const base = new Decimal(order.amount);
  for (const a of anc.rows) {
    // No self-referral payout
    if (a.ancestor_id === order.buyer_id || a.ancestor_id === order.seller_id) continue;
    const rule = byLevel.get(a.depth);
    if (!rule) continue;
    // SAFEGUARD: commissions ONLY from eligible_verified_sales
    if (rule.basis !== 'eligible_verified_sales') continue;

    // Budget guard: sum of existing calcs for this version must stay under cap
    if (rule.budget_cap != null) {
      const s = await db.query(
        `select coalesce(sum(amount),0)::text as tot from commission_calculations where rule_version = $1`,
        [rule.version]
      );
      if (new Decimal(s.rows[0].tot).greaterThanOrEqualTo(new Decimal(rule.budget_cap))) continue;
    }

    const amount = base.mul(new Decimal(rule.rate_bps)).div(10000);
    const idem = `comm:${orderId}:v${rule.version}:L${a.depth}:${a.ancestor_id}`;
    const ins = await db.query(
      `insert into commission_calculations
        (order_id, beneficiary_id, level, rule_version, base_amount, amount, currency, status, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
       on conflict (idempotency_key) do nothing returning *`,
      [orderId, a.ancestor_id, a.depth, rule.version, base.toFixed(4), amount.toFixed(4), order.currency, idem]
    );
    if (!ins.rowCount) continue; // idempotent replay
    // Book liability: company owes the beneficiary (balanced, idempotent)
    await postBalanced(
      {
        sourceType: 'commission_accrual',
        sourceId: ins.rows[0].id,
        currency: order.currency,
        memo: `commission L${a.depth} order ${orderId}`,
        idempotencyKey: `ledger:${idem}`,
        lines: [
          { account: 'OPS:reward_funding', debit: amount.toFixed(4) },
          { account: `LIAB:commissions_${order.currency}`, credit: amount.toFixed(4) },
        ],
      },
      client
    );
    created.push(ins.rows[0]);
  }
  return created;
}

async function reverseForOrder(orderId, reason, client) {
  const pool = getPool();
  const db = client || pool;
  const rows = await db.query(
    `select * from commission_calculations where order_id = $1 and status != 'reversed'`,
    [orderId]
  );
  for (const c of rows.rows) {
    await db.query(`update commission_calculations set status = 'reversed' where id = $1`, [c.id]);
    await postBalanced(
      {
        sourceType: 'commission_reversal',
        sourceId: c.id,
        currency: c.currency,
        memo: reason || `reversal order ${orderId}`,
        idempotencyKey: `ledger:rev:${c.id}`,
        lines: [
          { account: `LIAB:commissions_${c.currency}`, debit: new Decimal(c.amount).toFixed(4) },
          { account: 'OPS:reward_funding', credit: new Decimal(c.amount).toFixed(4) },
        ],
      },
      client
    );
  }
  return rows.rowCount;
}

module.exports = { calculateForOrder, reverseForOrder };
