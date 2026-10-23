// Commission categories + generation gate — SIMULATED pilot, DISABLED by default.
// Generation gate: maxGen = sponsor stage (stage_gens map 1->1 .. 5->5).
// Rate capped at sponsor-stage rule; calculations store category+generation+rule_version.
// All seed rules/categories are active=false so the engine records nothing payable.
const STAGE_GENS = Object.freeze({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });

function maxGenForStage(stage) {
  const n = Number(stage);
  if (!STAGE_GENS[n]) throw new Error('invalid_stage');
  return STAGE_GENS[n];
}

// Pure: is this ancestor depth payable given the beneficiary's stage?
function isGenerationEligible(beneficiaryStage, depth) {
  return Number(depth) >= 1 && Number(depth) <= maxGenForStage(beneficiaryStage);
}

// Pure: filter ancestor rows [{ancestor_id, depth, stage}] to eligible ones.
function filterEligibleAncestors(ancestors) {
  return (ancestors || []).filter((a) => {
    try { return isGenerationEligible(a.stage ?? 1, a.depth); }
    catch { return false; }
  });
}

// Wrapper: pre-filters ancestors by generation eligibility, then delegates to
// calculateForOrder ONLY for eligible depths. If no active rules, engine records nothing.
// To keep commissions.js minimal, we implement the gated calc here (same safeguards:
// eligible_verified_sales basis only, budget cap, idempotent, balanced ledger).
async function calculateGatedForOrder(orderId, client) {
  const { getPool } = require('./db');
  const { Decimal } = require('decimal.js');
  const { postBalanced } = require('./ledger');
  const pool = getPool();
  const db = client || pool;

  const o = await db.query(`select * from orders where id = $1`, [orderId]);
  if (!o.rowCount) throw Object.assign(new Error('order_not_found'), { status: 404 });
  const order = o.rows[0];
  if (order.status !== 'completed' && order.status !== 'resolved_completed') return [];
  const ref = await db.query(`select 1 from refunds where order_id = $1 limit 1`, [orderId]);
  if (ref.rowCount) return [];

  const anc = await db.query(
    `select rc.ancestor_id, rc.depth, coalesce(u.stage, 1) as stage
     from referral_closure rc join users u on u.id = rc.ancestor_id
     where rc.descendant_id = $1 and rc.depth between 1 and 5 order by rc.depth asc`,
    [order.buyer_id]
  );
  const eligible = filterEligibleAncestors(anc.rows);
  if (!eligible.length) return [];

  const rules = await db.query(
    `select * from commission_rules where active = true
     and (effective_to is null or effective_to > now()) order by version desc, level asc`
  );
  if (!rules.rowCount) return []; // DISABLED by default -> nothing payable (verified)
  const byLevel = new Map();
  for (const r of rules.rows) { if (!byLevel.has(r.level)) byLevel.set(r.level, r); }

  const created = [];
  const base = new Decimal(order.amount);
  for (const a of eligible) {
    if (a.ancestor_id === order.buyer_id || a.ancestor_id === order.seller_id) continue;
    const rule = byLevel.get(a.depth);
    if (!rule) continue;
    if (rule.basis !== 'eligible_verified_sales') continue;
    // Category must itself be active; inactive category -> skip (TBD placeholders never pay)
    if (rule.category) {
      const cat = await db.query(`select active from commission_categories where id = $1`, [rule.category]);
      if (!cat.rowCount || !cat.rows[0].active) continue;
    }
    if (rule.budget_cap != null) {
      const s = await db.query(`select coalesce(sum(amount),0)::text as tot from commission_calculations where rule_version = $1`, [rule.version]);
      if (new Decimal(s.rows[0].tot).greaterThanOrEqualTo(new Decimal(rule.budget_cap))) continue;
    }
    const amount = base.mul(new Decimal(rule.rate_bps)).div(10000);
    const idem = `comm:${orderId}:v${rule.version}:L${a.depth}:${a.ancestor_id}`;
    const hasCat = await db.query(`select 1 from information_schema.columns where table_schema='gatedp2p' and table_name='commission_calculations' and column_name='category'`).catch(() => ({ rowCount: 0 }));
    let ins;
    if (hasCat.rowCount) {
      ins = await db.query(
        `insert into commission_calculations
          (order_id, beneficiary_id, level, rule_version, base_amount, amount, currency, status, category, generation, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10)
         on conflict (idempotency_key) do nothing returning *`,
        [orderId, a.ancestor_id, a.depth, rule.version, base.toFixed(4), amount.toFixed(4), order.currency, rule.category || null, a.depth, idem]
      );
    } else {
      ins = await db.query(
        `insert into commission_calculations
          (order_id, beneficiary_id, level, rule_version, base_amount, amount, currency, status, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
         on conflict (idempotency_key) do nothing returning *`,
        [orderId, a.ancestor_id, a.depth, rule.version, base.toFixed(4), amount.toFixed(4), order.currency, idem]
      );
    }
    if (!ins.rowCount) continue;
    await postBalanced({
      sourceType: 'commission_accrual', sourceId: ins.rows[0].id, currency: order.currency,
      memo: `commission L${a.depth} gen ${a.depth} cat ${rule.category || 'default'} order ${orderId}`,
      idempotencyKey: `ledger:${idem}`,
      lines: [
        { account: 'OPS:reward_funding', debit: amount.toFixed(4) },
        { account: `LIAB:commissions_${order.currency}`, credit: amount.toFixed(4) },
      ],
    }, client);
    created.push(ins.rows[0]);
  }
  return created;
}

module.exports = { STAGE_GENS, maxGenForStage, isGenerationEligible, filterEligibleAncestors, calculateGatedForOrder };
