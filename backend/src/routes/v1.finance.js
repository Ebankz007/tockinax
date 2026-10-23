const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');

const router = express.Router();

// Finance gate: super_admin OR finance role, checked server-side
async function financeOnly(req, res, next) {
  try {
    const r = await getPool().query(
      `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
       where ur.user_id = $1 and rl.name in ('super_admin','finance')`,
      [req.user.id]
    );
    if (!r.rowCount) return res.status(403).json({ error: 'finance_only' });
    next();
  } catch (e) { next(e); }
}
router.use(authRequired, financeOnly);

async function audit(actorId, ip, action, targetType, targetId, diff) {
  await getPool().query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, targetType, targetId, diff || {}, ip]
  );
}

async function payoutEvent(payoutId, fromStatus, toStatus, actorId, note) {
  await getPool().query(
    `insert into payout_events (payout_id, from_status, to_status, actor_id, note)
     values ($1,$2,$3,$4,$5)`,
    [payoutId, fromStatus, toStatus, actorId, note || null]
  );
}

async function dualThreshold() {
  try {
    const r = await getPool().query(`select value from system_settings where key = 'payout_policy'`);
    if (r.rowCount && r.rows[0].value && r.rows[0].value.dualApprovalAbove != null)
      return new Decimal(String(r.rows[0].value.dualApprovalAbove));
  } catch { /* unseeded */ }
  return new Decimal(process.env.PAYOUT_DUAL_APPROVAL_ABOVE || '1000');
}

async function eligibleBalance(userId, currency) {
  const r = await getPool().query(
    `select coalesce(sum(amount),0)::text as bal from (
       select amount from commission_calculations where beneficiary_id = $1 and status = 'payable' and currency = $2
       union all select amount from reward_calculations rc join reward_campaigns c on c.id = rc.campaign_id
         where rc.user_id = $1 and rc.status = 'payable' and rc.currency = $2 and c.status = 'completed'
     ) s`,
    [userId, currency]
  );
  return new Decimal(r.rows[0].bal);
}

// GET /ledger/summary — revenue by account, liabilities, pending payouts
router.get('/ledger/summary', async (_req, res, next) => {
  try {
    const pool = getPool();
    const revenue = await pool.query(
      `select account, coalesce(sum(credit - debit),0)::text as net
       from ledger_entries where account like 'REV:%' group by account order by account`
    );
    const liabilities = await pool.query(
      `select account, coalesce(sum(credit - debit),0)::text as net
       from ledger_entries where account like 'LIAB:%' group by account order by account`
    );
    const pending = await pool.query(
      `select status, currency, count(*)::int as n, coalesce(sum(amount),0)::text as total
       from payout_requests where status in ('requested','under_review','approved','processing')
       group by status, currency order by status, currency`
    );
    res.json({ revenue: revenue.rows, liabilities: liabilities.rows, pendingPayouts: pending.rows });
  } catch (e) { next(e); }
});

// GET /payouts/queue — requested / under_review with user email
router.get('/payouts/queue', async (req, res, next) => {
  try {
    const status = z.object({ status: z.enum(['requested', 'under_review']).default('requested') }).parse(req.query);
    const r = await getPool().query(
      `select pr.*, u.email as user_email from payout_requests pr
       join users u on u.id = pr.user_id
       where pr.status = $1 order by pr.created_at asc limit 100`,
      [status.status]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /payouts/:id/review {decision: approve|reject, note}
router.post('/payouts/:id/review', async (req, res, next) => {
  try {
    const b = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(1000).optional().default('') }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(`select * from payout_requests where id = $1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const p = r.rows[0];
    if (!['requested', 'under_review'].includes(p.status))
      return res.status(409).json({ error: 'bad_state', status: p.status });

    if (b.decision === 'reject') {
      await pool.query(`update payout_requests set status = 'rejected', reject_reason = $1, updated_at = now() where id = $2`, [b.note, p.id]);
      await payoutEvent(p.id, p.status, 'rejected', req.user.id, b.note);
      await audit(req.user.id, req.ip, 'payout.reject', 'payout', p.id, { note: b.note });
      return res.json({ ok: true, status: 'rejected' });
    }

    // approve — eligible balance must still cover the amount
    const bal = await eligibleBalance(p.user_id, p.currency);
    if (bal.lessThan(new Decimal(p.amount)))
      return res.status(422).json({ error: 'insufficient_eligible', eligible: bal.toString() });

    const threshold = await dualThreshold();
    const amt = new Decimal(p.amount);
    if (amt.greaterThan(threshold)) {
      if (!p.approved_by) {
        // first approval — stays under_review until a DIFFERENT approver confirms
        await pool.query(`update payout_requests set status = 'under_review', approved_by = $1, updated_at = now() where id = $2`, [req.user.id, p.id]);
        await payoutEvent(p.id, p.status, 'under_review', req.user.id, `first approval; second required above ${threshold.toString()}`);
        await audit(req.user.id, req.ip, 'payout.first_approve', 'payout', p.id, {});
        return res.json({ ok: true, status: 'under_review', needSecond: true });
      }
      if (p.approved_by === req.user.id)
        return res.status(409).json({ error: 'need_second_approver', message: 'A different approver is required above threshold.' });
      await pool.query(
        `update payout_requests set status = 'approved', second_approved_by = $1, updated_at = now() where id = $2`,
        [req.user.id, p.id]
      );
      await payoutEvent(p.id, p.status, 'approved', req.user.id, b.note || 'second approval');
      await audit(req.user.id, req.ip, 'payout.second_approve', 'payout', p.id, {});
      return res.json({ ok: true, status: 'approved' });
    }

    await pool.query(`update payout_requests set status = 'approved', approved_by = $1, updated_at = now() where id = $2`, [req.user.id, p.id]);
    await payoutEvent(p.id, p.status, 'approved', req.user.id, b.note);
    await audit(req.user.id, req.ip, 'payout.approve', 'payout', p.id, {});
    res.json({ ok: true, status: 'approved' });
  } catch (e) { next(e); }
});

// POST /payouts/:id/process {providerRef} — approved -> processing -> paid with balanced ledger
router.post('/payouts/:id/process', async (req, res, next) => {
  try {
    const b = z.object({ providerRef: z.string().min(3).max(128) }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(`select * from payout_requests where id = $1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const p = r.rows[0];
    if (p.status !== 'approved') return res.status(409).json({ error: 'must_be_approved', status: p.status });

    await pool.query(`update payout_requests set status = 'processing', updated_at = now() where id = $1`, [p.id]);
    await payoutEvent(p.id, 'approved', 'processing', req.user.id, b.providerRef);

    // Balanced settlement entry — do NOT mark paid if the ledger write fails
    try {
      await postBalanced({
        sourceType: 'payout_settlement',
        sourceId: p.id,
        currency: p.currency,
        memo: `payout ${p.id} ref ${b.providerRef}`,
        idempotencyKey: `payout:settle:${p.id}`,
        lines: [
          { account: 'LIAB:payouts_pending', debit: new Decimal(p.amount).toFixed(4) },
          { account: 'OPS:payouts_paid', credit: new Decimal(p.amount).toFixed(4) },
        ],
      });
    } catch (e) {
      await pool.query(`update payout_requests set status = 'approved', updated_at = now() where id = $1`, [p.id]);
      await payoutEvent(p.id, 'processing', 'approved', req.user.id, `ledger failed: ${e.message}`);
      return res.status(502).json({ error: 'ledger_error', message: e.message });
    }

    await pool.query(`update payout_requests set status = 'paid', updated_at = now() where id = $1`, [p.id]);
    await payoutEvent(p.id, 'processing', 'paid', req.user.id, b.providerRef);
    await audit(req.user.id, req.ip, 'payout.process', 'payout', p.id, { providerRef: b.providerRef });
    res.json({ ok: true, status: 'paid' });
  } catch (e) { next(e); }
});

// GET /reconciliation — runs + live ledger imbalance check
router.get('/reconciliation', async (_req, res, next) => {
  try {
    const pool = getPool();
    const runs = await pool.query(`select * from reconciliation_runs order by started_at desc limit 20`);
    const imbalance = await pool.query(
      `select t.id, t.currency, sum(e.debit)::text as d, sum(e.credit)::text as c
       from ledger_transactions t join ledger_entries e on e.tx_id = t.id
       group by t.id, t.currency having sum(e.debit) <> sum(e.credit) limit 50`
    );
    res.json({ runs: runs.rows, imbalances: imbalance.rows });
  } catch (e) { next(e); }
});

// POST /reconciliation/run — compute mismatches, insert run row
router.post('/reconciliation/run', async (req, res, next) => {
  try {
    const pool = getPool();
    const paidNoEvent = await pool.query(
      `select pr.id from payout_requests pr
       left join payment_provider_events pe on pe.payload->>'payout_id' = pr.id::text
       where pr.status = 'paid' and pe.id is null limit 200`
    );
    const completedNoFee = await pool.query(
      `select o.id, o.order_no from orders o
       left join ledger_transactions t on t.source_type = 'order_fee' and t.source_id = o.id
       where o.status in ('completed','resolved_completed') and t.id is null limit 200`
    );
    const imbalance = await pool.query(
      `select t.id from ledger_transactions t join ledger_entries e on e.tx_id = t.id
       group by t.id having sum(e.debit) <> sum(e.credit) limit 200`
    );
    const report = {
      paidWithoutProviderEvent: paidNoEvent.rows.map((x) => x.id),
      completedWithoutFeeEntry: completedNoFee.rows,
      imbalancedTxs: imbalance.rows.map((x) => x.id),
    };
    const mismatches =
      report.paidWithoutProviderEvent.length + report.completedWithoutFeeEntry.length + report.imbalancedTxs.length;
    const run = await pool.query(
      `insert into reconciliation_runs (finished_at, mismatches, report)
       values (now(), $1, $2) returning *`,
      [mismatches, report]
    );
    await audit(req.user.id, req.ip, 'recon.run', 'reconciliation', run.rows[0].id, { mismatches });
    res.status(201).json(run.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
