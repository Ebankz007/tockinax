// Token pilot routes — SIMULATED tokens only. Auth required, RBAC+Zod server-side.
// Safeguards: Decimal only; ledger balanced+idempotent; rewards/commissions disabled
// until approved+funded (never paid here); evidence never completes orders (N/A here).
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');
const { targetPrice, maturesAt } = require('../lib/tokenPricing');

const router = express.Router();
router.use(authRequired);

// Per-user SIM-USDT available balance (Decimal string).
// funding = sum from LEDGER (LIAB:sim_usdt legs in sim_funding txs for this user).
// spends/proceeds = domain tables (token tables are MEMO-style qty records; USDT settles in ledger globally).
async function simBalance(userId, db) {
  const pool = getPool();
  const q = db || pool;
  const fund = await q.query(
    `select coalesce(sum(e.credit - e.debit),0)::text as bal
     from ledger_entries e join ledger_transactions t on t.id = e.tx_id
     where e.account = 'LIAB:sim_usdt' and t.source_type = 'sim_funding' and t.source_id = $1::uuid`,
    [userId]
  ).catch(() => ({ rows: [{ bal: '0' }] }));
  const funding = new Decimal(fund.rows[0]?.bal || 0);
  const spent = await q.query(
    `select coalesce(sum(cost_usdt),0)::text as tot from token_holdings where user_id = $1 and status <> 'cancelled'`,
    [userId]
  ).catch(() => ({ rows: [{ tot: '0' }] }));
  const bought = await q.query(
    `select coalesce(sum(total),0)::text as tot from token_fills where buyer_id = $1`,
    [userId]
  ).catch(() => ({ rows: [{ tot: '0' }] }));
  const sold = await q.query(
    `select coalesce(sum(f.total),0)::text as tot from token_fills f
     join token_listings l on l.id = f.listing_id where l.seller_id = $1`,
    [userId]
  ).catch(() => ({ rows: [{ tot: '0' }] }));
  return funding.minus(new Decimal(spent.rows[0].tot)).minus(new Decimal(bought.rows[0].tot)).plus(new Decimal(sold.rows[0].tot));
}

async function userStage(pool, userId) {
  const u = await pool.query(`select stage from users where id = $1`, [userId]);
  const stage = u.rows[0]?.stage ?? 1;
  const def = await pool.query(`select * from stage_definitions where stage = $1`, [stage]);
  return { stage, def: def.rows[0] || null };
}

// POST /tokens/purchase {amount_usdt|amount|cost_usdt, lock_days|cycle_days}
router.post('/purchase', async (req, res, next) => {
  try {
    const raw = z.object({
      amount_usdt: z.union([z.string(), z.number()]).optional(),
      amount: z.union([z.string(), z.number()]).optional(),
      cost_usdt: z.union([z.string(), z.number()]).optional(),
      lock_days: z.union([z.string(), z.number()]).optional(),
      cycle_days: z.union([z.string(), z.number()]).optional(),
    }).passthrough().parse(req.body);
    const amtStr = String(raw.amount_usdt ?? raw.amount ?? raw.cost_usdt ?? '');
    const dayNum = Number(raw.lock_days ?? raw.cycle_days);
    if (!/^\d+(\.\d{1,4})?$/.test(amtStr)) return res.status(400).json({ error: 'invalid_amount' });
    if (![7, 14].includes(dayNum)) return res.status(400).json({ error: 'invalid_lock_days' });
    const b = { amount_usdt: amtStr, lock_days: dayNum };
    const pool = getPool();
    const cost = new Decimal(b.amount_usdt);
    if (cost.lte(0)) return res.status(400).json({ error: 'invalid_amount' });

    const { stage, def } = await userStage(pool, req.user.id);
    // Stage limit check — NULL = unlimited (placeholder, never invent limits)
    if (def) {
      if (def.min_buy != null && cost.lessThan(new Decimal(def.min_buy))) {
        return res.status(403).json({ error: 'below_stage_min', min_buy: def.min_buy });
      }
      if (def.max_buy != null && cost.greaterThan(new Decimal(def.max_buy))) {
        return res.status(403).json({ error: 'above_stage_max', max_buy: def.max_buy });
      }
    }

    const bal = await simBalance(req.user.id, pool);
    if (bal.lessThan(cost)) {
      return res.status(422).json({ error: 'insufficient_sim_usdt', balance: bal.toFixed(4) });
    }

    const priced = await targetPrice(b.amount_usdt, b.lock_days);
    const holdingId = crypto.randomUUID();
    const now = new Date();
    const mat = maturesAt(now, b.lock_days);
    // Member spends SIM-USDT: reduce company liability (debit LIAB), park in clearing (credit SIM).
    // Balanced in USDT; token qty itself is a MEMO-style record in token_holdings (no TKX ledger legs).
    try {
      await postBalanced({
        sourceType: 'sim_purchase',
        sourceId: holdingId,
        currency: 'USDT',
        memo: `sim purchase ${holdingId} user ${req.user.id}`,
        idempotencyKey: `sim:purchase:${holdingId}`,
        lines: [
          { account: 'LIAB:sim_usdt', debit: cost.toFixed(4) },
          { account: 'SIM:usdt_clearing', credit: cost.toFixed(4) },
        ],
      });
    } catch (e) {
      return res.status(502).json({ error: 'ledger_error', message: e.message });
    }

    const h = await pool.query(
      `insert into token_holdings (id, user_id, token_code, qty, cost_usdt, lock_days, status, purchased_at, matures_at)
       values ($1,$2,'TKX-SIM',$3,$4,$5,'locked',now(),$6) returning *`,
      [holdingId, req.user.id, cost.toFixed(4), cost.toFixed(4), b.lock_days, mat.toISOString()]
    );
    const c = await pool.query(
      `insert into participation_cycles (user_id, holding_id, started_at, status, success)
       values ($1,$2,now(),'started',false) returning *`,
      [req.user.id, holdingId]
    );
    res.status(201).json({ holding: h.rows[0], cycle: c.rows[0], pricing: priced });
  } catch (e) { next(e); }
});

router.get('/holdings/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from token_holdings where user_id=$1 order by purchased_at desc`, [req.user.id]);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /tokens/cycles/mine — includes eligibility counts vs stage requirement
router.get('/cycles/mine', async (req, res, next) => {
  try {
    const pool = getPool();
    const cycles = await pool.query(
      `select c.*, h.lock_days from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 order by c.started_at desc`, [req.user.id]);
    const ok7 = await pool.query(
      `select count(*)::int as n from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 and c.success=true and h.lock_days=7`, [req.user.id]);
    const ok14 = await pool.query(
      `select count(*)::int as n from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 and c.success=true and h.lock_days=14`, [req.user.id]);
    const { stage, def } = await userStage(pool, req.user.id);
    res.json({
      items: cycles.rows,
      eligibility: {
        success_7d: ok7.rows[0].n,
        success_14d: ok14.rows[0].n,
        required_7d: def?.req_cycles_7d ?? 0,
        required_14d: def?.req_cycles_14d ?? 0,
        stage,
      },
    });
  } catch (e) { next(e); }
});

// GET /tokens/stage/me
router.get('/stage/me', async (req, res, next) => {
  try {
    const pool = getPool();
    const { stage, def } = await userStage(pool, req.user.id);
    const u = await pool.query(`select member_no from users where id=$1`, [req.user.id]);
    const nextStage = stage < 5 ? stage + 1 : null;
    let nextDef = null;
    if (nextStage) {
      const nd = await pool.query(`select * from stage_definitions where stage=$1`, [nextStage]);
      nextDef = nd.rows[0] || null;
    }
    res.json({
      member_no: u.rows[0]?.member_no || null,
      current: stage,
      limits: def ? { min_buy: def.min_buy, max_buy: def.max_buy } : null,
      requirements: def ? { req_cycles_7d: def.req_cycles_7d, req_cycles_14d: def.req_cycles_14d } : null,
      upgrade: nextDef
        ? { to_stage: nextStage, fee: def ? def.upgrade_fee : null, fee_unset: (def ? def.upgrade_fee : null) == null }
        : null,
      renewal: def ? { fee: def.renewal_fee, fee_unset: def.renewal_fee == null } : null,
      note: 'Upgrade fee is the fee to LEAVE the current stage. NULL fees are unpublished — upgrade/renewal blocked until disclosed.',
    });
  } catch (e) { next(e); }
});

// POST /tokens/stage/request {kind: upgrade|renewal}
router.post('/stage/request', async (req, res, next) => {
  try {
    const b = z.object({ kind: z.enum(['upgrade', 'renewal']) }).parse(req.body);
    const pool = getPool();
    const { stage, def } = await userStage(pool, req.user.id);
    let toStage = stage;
    let fee = null;
    if (b.kind === 'upgrade') {
      if (stage >= 5) return res.status(409).json({ error: 'max_stage' });
      toStage = stage + 1;
      const nd = await pool.query(`select 1 from stage_definitions where stage=$1`, [toStage]);
      if (!nd.rowCount) return res.status(404).json({ error: 'stage_not_found' });
      // Approved plan: the upgrade fee to leave the CURRENT stage (stage 5 = 0 / cannot leave).
      fee = def?.upgrade_fee ?? null;
    } else {
      fee = def?.renewal_fee ?? null;
    }
    // Unpublished fee still blocks with 409 fee_unset (plan rates are set; gate stays for NULL).
    if (fee == null) return res.status(409).json({ error: 'fee_unset', message: 'Fee not published — request blocked until admin discloses a fee.' });
    const idem = `stage:${req.user.id}:${b.kind}:${stage}->${toStage}:${fee}`;
    const r = await pool.query(
      `insert into stage_requests (user_id, kind, from_stage, to_stage, fee_disclosed, status, idempotency)
       values ($1,$2,$3,$4,$5,'pending',$6) on conflict (idempotency) do nothing returning *`,
      [req.user.id, b.kind, stage, toStage, String(fee), idem]
    );
    if (!r.rowCount) {
      const ex = await pool.query(`select * from stage_requests where idempotency=$1`, [idem]);
      return res.status(200).json(ex.rows[0]);
    }
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// GET /tokens/statement — JSON lines suitable for CSV export
router.get('/statement', async (req, res, next) => {
  try {
    const pool = getPool();
    const holdings = await pool.query(`select id, qty, cost_usdt, lock_days, status, purchased_at, matures_at from token_holdings where user_id=$1 order by purchased_at`, [req.user.id]);
    const buys = await pool.query(`select f.id, f.listing_id, f.qty, f.unit_price, f.total, f.created_at from token_fills f where f.buyer_id=$1 order by f.created_at`, [req.user.id]);
    const sells = await pool.query(
      `select f.id, f.listing_id, f.qty, f.unit_price, f.total, f.created_at from token_fills f
       join token_listings l on l.id=f.listing_id where l.seller_id=$1 order by f.created_at`, [req.user.id]);
    const lines = [
      ...holdings.rows.map((h) => ({ type: 'purchase', ...h })),
      ...buys.rows.map((x) => ({ type: 'buy_fill', ...x })),
      ...sells.rows.map((x) => ({ type: 'sell_receipt', ...x })),
    ];
    res.json({ lines, csv_hint: 'type,id,qty,unit_price/total,cost_usdt,lock_days,status,date' });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.simBalance = simBalance;
