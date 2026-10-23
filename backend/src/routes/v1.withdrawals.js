// Member USDT-TRC20 withdrawal requests + finance/admin review pipeline.
// Auth required on all routes; finance/admin gates are enforced INSIDE this
// module (super_admin OR finance role, checked server-side per request).
//
// Lifecycle: requested -> under_review (first approval above threshold) ->
// approved (single approval below threshold, or second distinct approval
// above) -> processing/paid | rejected | failed | cancelled.
//
// SANDBOX-FIRST: POST /:id/execute marks the request `paid` with a
// `sandbox-tx-…` hash while in sandbox mode. When PAY2CRYPTO_SANDBOX=false
// (live requested) execute returns 403 live_disabled — the payout API is
// unconfirmed and there is no ops sign-off, so NO live transfer is attempted.
// All mutations append a withdrawal_events row + an audit_logs row.

'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { Decimal } = require('../lib/ledger');

const router = express.Router();
router.use(authRequired);

// TRC20: starts with T, 34 chars, base58 (excludes 0, O, I, l).
const TRON_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
function isTronAddress(addr) {
  return TRON_RE.test(String(addr || '').trim());
}

function isSandboxMode() {
  return (process.env.PAY2CRYPTO_SANDBOX || 'true').toLowerCase() !== 'false';
}

async function financeOnly(req, res, next) {
  try {
    const r = await getPool().query(
      `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
       where ur.user_id = $1 and rl.name in ('super_admin','finance')`,
      [req.user.id]
    );
    if (!r.rowCount) return res.status(403).json({ error: 'finance_only' });
    next();
  } catch (e) {
    next(e);
  }
}

async function audit(pool, actorId, ip, action, targetId, diff) {
  await pool.query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, 'withdrawal_request', String(targetId), diff || {}, ip || null]
  );
}

async function wEvent(pool, withdrawalId, from, to, actorId, note) {
  await pool.query(
    `insert into withdrawal_events (withdrawal_id, from_status, to_status, actor_id, note)
     values ($1,$2,$3,$4,$5)`,
    [withdrawalId, from || null, to, actorId || null, note || null]
  );
}

// Dual-approval threshold (READ-ONLY use of payout_policy).
// NOTE: policy value is NGN-denominated (default 500000); USDT equivalence is
// TBD (VERIFY: FX rule). Until defined we compare the raw USDT amount against
// the raw number, which keeps small USDT withdrawals single-approval and is
// the conservative direction only if 1 USDT <= 1 NGN in effect — document any
// change in docs/PAYMENTS_PAY2CRYPTO.md before adjusting.
async function dualThreshold(pool) {
  try {
    const r = await pool.query(`select value from system_settings where key = 'payout_policy'`);
    const val = r.rowCount ? r.rows[0].value || {} : {};
    const raw = val.dual_approval_ngn ?? val.dualApprovalAbove ?? process.env.PAYOUT_DUAL_APPROVAL_THRESHOLD_NGN ?? '500000';
    return new Decimal(String(raw));
  } catch {
    return new Decimal(process.env.PAYOUT_DUAL_APPROVAL_THRESHOLD_NGN || '500000');
  }
}

// Available SIM-USDT = ledger funding (sim_funding credits to LIAB:sim_usdt
// for this user) MINUS token-module spends (holdings + market buys - sells)
// MINUS open+paid withdrawal_requests (prevents double-spend via re-request).
// Injectable db handle keeps this unit-testable.
async function availableSimUsdt(db, userId) {
  const fund = await db
    .query(
      `select coalesce(sum(e.credit - e.debit),0)::text as bal
       from ledger_entries e join ledger_transactions t on t.id = e.tx_id
       where e.account = 'LIAB:sim_usdt' and t.source_type = 'sim_funding' and t.source_id = $1::uuid`,
      [userId]
    )
    .catch(() => ({ rows: [{ bal: '0' }] }));
  const funding = new Decimal(fund.rows[0]?.bal || 0);
  const spent = await db
    .query(`select coalesce(sum(cost_usdt),0)::text as tot from token_holdings where user_id=$1 and status <> 'cancelled'`, [userId])
    .catch(() => ({ rows: [{ tot: '0' }] }));
  const bought = await db
    .query(`select coalesce(sum(total),0)::text as tot from token_fills where buyer_id=$1`, [userId])
    .catch(() => ({ rows: [{ tot: '0' }] }));
  const sold = await db
    .query(
      `select coalesce(sum(f.total),0)::text as tot from token_fills f
       join token_listings l on l.id = f.listing_id where l.seller_id = $1`,
      [userId]
    )
    .catch(() => ({ rows: [{ tot: '0' }] }));
  const locked = await db
    .query(
      `select coalesce(sum(amount),0)::text as tot from withdrawal_requests
       where user_id=$1 and status in ('requested','under_review','approved','processing','paid')`,
      [userId]
    )
    .catch(() => ({ rows: [{ tot: '0' }] }));
  return funding
    .minus(new Decimal(spent.rows[0].tot || 0))
    .minus(new Decimal(bought.rows[0].tot || 0))
    .plus(new Decimal(sold.rows[0].tot || 0))
    .minus(new Decimal(locked.rows[0].tot || 0));
}

// POST /withdrawals/request — member creates a request.
router.post('/request', async (req, res, next) => {
  try {
    const b = z.object({
      amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      dest_address: z.string().min(30).max(128),
      idempotencyKey: z.string().min(8).max(96).optional(),
    }).parse(req.body);
    const dest = String(b.dest_address).trim();
    if (!isTronAddress(dest)) {
      return res.status(400).json({ error: 'invalid_trc20_address', message: 'Destination must be a TRC20 address (starts with T, 34 base58 chars).' });
    }
    const amt = new Decimal(b.amount);
    if (amt.lte(0)) return res.status(400).json({ error: 'invalid_amount' });
    const pool = getPool();
    const avail = await availableSimUsdt(pool, req.user.id);
    if (avail.lessThan(amt)) {
      return res.status(422).json({ error: 'insufficient_sim_usdt', available: avail.toFixed(4) });
    }
    const key = b.idempotencyKey || `wd:${req.user.id}:${amt.toFixed(4)}:${crypto.randomBytes(8).toString('hex')}`;
    const r = await pool.query(
      `insert into withdrawal_requests (user_id, amount, currency, dest_address, network, status, sandbox, idempotency)
       values ($1,$2,'USDT',$3,'TRC20','requested',$4,$5)
       on conflict (idempotency) do nothing returning *`,
      [req.user.id, amt.toFixed(4), dest, isSandboxMode(), key]
    );
    if (!r.rowCount) {
      const ex = await pool.query(`select * from withdrawal_requests where idempotency=$1`, [key]);
      return res.status(200).json({ replayed: true, request: ex.rows[0] });
    }
    const wr = r.rows[0];
    await wEvent(pool, wr.id, null, 'requested', req.user.id, 'member submitted');
    await audit(pool, req.user.id, req.ip, 'withdrawal.request', wr.id, { amount: amt.toFixed(4), dest_address: dest });
    res.status(201).json(wr);
  } catch (e) {
    next(e);
  }
});

// GET /withdrawals/mine — member's own requests.
router.get('/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from withdrawal_requests where user_id=$1 order by created_at desc limit 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

// GET /withdrawals/queue — finance/admin review queue.
router.get('/queue', financeOnly, async (req, res, next) => {
  try {
    const q = z.object({ status: z.enum(['requested', 'under_review', 'approved', 'processing']).default('requested') }).parse(req.query);
    const r = await getPool().query(
      `select w.*, u.email as user_email from withdrawal_requests w
       join users u on u.id = w.user_id where w.status=$1 order by w.created_at asc limit 100`,
      [q.status]
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

// POST /withdrawals/:id/review {decision: approve|reject, note} — finance/admin.
router.post('/:id/review', financeOnly, async (req, res, next) => {
  try {
    const b = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(1000).optional().default('') }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(`select * from withdrawal_requests where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const w = r.rows[0];
    if (!['requested', 'under_review'].includes(w.status)) return res.status(409).json({ error: 'bad_state', status: w.status });

    if (b.decision === 'reject') {
      await pool.query(`update withdrawal_requests set status='rejected', reject_reason=$1, updated_at=now() where id=$2`, [b.note, w.id]);
      await wEvent(pool, w.id, w.status, 'rejected', req.user.id, b.note);
      await audit(pool, req.user.id, req.ip, 'withdrawal.reject', w.id, { note: b.note });
      return res.json({ ok: true, status: 'rejected' });
    }

    // approve — funds must still be available at review time.
    const avail = await availableSimUsdt(pool, w.user_id);
    // Availability already nets this request as locked; add it back for the check.
    if (avail.plus(new Decimal(w.amount)).lessThan(new Decimal(w.amount))) {
      return res.status(422).json({ error: 'insufficient_sim_usdt', available: avail.toFixed(4) });
    }
    const threshold = await dualThreshold(pool);
    if (new Decimal(w.amount).greaterThan(threshold)) {
      if (!w.approved_by) {
        await pool.query(`update withdrawal_requests set status='under_review', approved_by=$1, updated_at=now() where id=$2`, [req.user.id, w.id]);
        await wEvent(pool, w.id, w.status, 'under_review', req.user.id, `first approval; second required above ${threshold.toString()}`);
        await audit(pool, req.user.id, req.ip, 'withdrawal.first_approve', w.id, {});
        return res.json({ ok: true, status: 'under_review', needSecond: true });
      }
      if (String(w.approved_by) === String(req.user.id)) {
        return res.status(409).json({ error: 'need_second_approver', message: 'A different approver is required above threshold.' });
      }
      await pool.query(`update withdrawal_requests set status='approved', second_approved_by=$1, updated_at=now() where id=$2`, [req.user.id, w.id]);
      await wEvent(pool, w.id, w.status, 'approved', req.user.id, b.note || 'second approval');
      await audit(pool, req.user.id, req.ip, 'withdrawal.second_approve', w.id, {});
      return res.json({ ok: true, status: 'approved' });
    }
    await pool.query(`update withdrawal_requests set status='approved', approved_by=$1, updated_at=now() where id=$2`, [req.user.id, w.id]);
    await wEvent(pool, w.id, w.status, 'approved', req.user.id, b.note);
    await audit(pool, req.user.id, req.ip, 'withdrawal.approve', w.id, {});
    res.json({ ok: true, status: 'approved' });
  } catch (e) {
    next(e);
  }
});

// POST /withdrawals/:id/execute — finance/admin.
// Sandbox: marks paid with a `sandbox-tx-…` hash. Live: 403 live_disabled.
router.post('/:id/execute', financeOnly, async (req, res, next) => {
  try {
    if (!isSandboxMode()) {
      return res.status(403).json({
        error: 'live_disabled',
        message: 'Live USDT payouts are disabled (payout API unconfirmed + no ops sign-off). No transfer attempted.',
      });
    }
    const pool = getPool();
    const r = await pool.query(`select * from withdrawal_requests where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const w = r.rows[0];
    if (w.status !== 'approved') return res.status(409).json({ error: 'must_be_approved', status: w.status });
    await pool.query(`update withdrawal_requests set status='processing', updated_at=now() where id=$1`, [w.id]);
    await wEvent(pool, w.id, 'approved', 'processing', req.user.id, 'sandbox payout started');
    const txHash = `sandbox-tx-${crypto.randomBytes(16).toString('hex')}`;
    await pool.query(`update withdrawal_requests set status='paid', tx_hash=$1, updated_at=now() where id=$2`, [txHash, w.id]);
    await wEvent(pool, w.id, 'processing', 'paid', req.user.id, `sandbox payout ${txHash} (SIMULATION — no real funds)`);
    await audit(pool, req.user.id, req.ip, 'withdrawal.execute', w.id, { txHash, sandbox: true });
    res.json({ ok: true, status: 'paid', txHash, sandbox: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.isTronAddress = isTronAddress;
module.exports.availableSimUsdt = availableSimUsdt;
module.exports.dualThreshold = dualThreshold;
module.exports.isSandboxMode = isSandboxMode;
