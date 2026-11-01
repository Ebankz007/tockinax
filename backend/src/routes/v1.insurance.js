// Insurance — real-money protection for token positions.
// Policies are purchased by members; claims are reviewed and paid by admin.
// All money movement is balanced through the double-entry ledger.
const express = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');

const router = express.Router();
router.use(authRequired);

async function audit(req, action, targetType, targetId, diff) {
  await getPool().query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, action, targetType, targetId, diff || {}, req.ip]
  );
}

// ---- Member routes ----

// GET /insurance/coverage — active policies for the current user
router.get('/coverage', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select p.*, h.cost_usdt, h.lock_days, h.status as holding_status, h.matures_at
       from insurance_policies p
       left join token_holdings h on h.id = p.holding_id
       where p.user_id = $1
       order by p.created_at desc`,
      [req.user.id]
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /insurance/claims/mine — claims filed by the current user
router.get('/claims/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select c.*, p.token_code, p.coverage_amount
       from insurance_claims c
       join insurance_policies p on p.id = c.policy_id
       where c.user_id = $1
       order by c.created_at desc`,
      [req.user.id]
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /insurance/purchase {token_code, holding_id, coverage_amount, premium_paid, expires_at, terms}
router.post('/purchase', async (req, res, next) => {
  try {
    const b = z.object({
      token_code: z.string().min(1),
      holding_id: z.string().uuid().optional(),
      coverage_amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      premium_paid: z.string().regex(/^\d+(\.\d{1,4})?$/),
      expires_at: z.string().datetime().optional(),
      terms: z.string().max(2000).optional().default(''),
    }).parse(req.body);

    const pool = getPool();
    const coverage = new Decimal(b.coverage_amount);
    const premium = new Decimal(b.premium_paid);
    if (coverage.lte(0)) return res.status(400).json({ error: 'invalid_coverage' });
    if (premium.lte(0)) return res.status(400).json({ error: 'invalid_premium' });

    // Verify the holding exists and belongs to the user (if provided)
    if (b.holding_id) {
      const h = await pool.query(`select * from token_holdings where id=$1 and user_id=$2`, [b.holding_id, req.user.id]);
      if (!h.rowCount) return res.status(404).json({ error: 'holding_not_found' });
    }

    const idem = `ins:purchase:${req.user.id}:${crypto.randomBytes(8).toString('hex')}`;
    const expiresAt = b.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Deduct premium from member's SIM-USDT balance via ledger
    try {
      await postBalanced({
        sourceType: 'insurance_premium',
        sourceId: idem,
        currency: 'USDT',
        memo: `insurance premium ${idem}`,
        idempotencyKey: `ins:premium:${idem}`,
        lines: [
          { account: 'LIAB:sim_usdt', debit: premium.toFixed(4) },
          { account: 'REV:insurance_premiums', credit: premium.toFixed(4) },
        ],
      });
    } catch (e) {
      return res.status(502).json({ error: 'ledger_error', message: e.message });
    }

    const p = await pool.query(
      `insert into insurance_policies (user_id, token_code, holding_id, coverage_amount, premium_paid, expires_at, terms, status)
       values ($1,$2,$3,$4,$5,$6,$7,'active') returning *`,
      [req.user.id, b.token_code, b.holding_id || null, coverage.toFixed(4), premium.toFixed(4), expiresAt, b.terms]
    );

    await audit(req, 'insurance.purchase', 'insurance_policy', p.rows[0].id, { coverage: b.coverage_amount, premium: b.premium_paid });
    res.status(201).json({ policy: p.rows[0] });
  } catch (e) { next(e); }
});

// POST /insurance/claim {policy_id, amount, reason, evidence_ref}
router.post('/claim', async (req, res, next) => {
  try {
    const b = z.object({
      policy_id: z.string().uuid(),
      amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      reason: z.enum(['unsold_at_maturity', 'partial_fill_loss', 'platform_fault']),
      evidence_ref: z.string().max(500).optional().default(''),
    }).parse(req.body);

    const pool = getPool();
    const claimAmt = new Decimal(b.amount);
    if (claimAmt.lte(0)) return res.status(400).json({ error: 'invalid_amount' });

    // Verify policy belongs to user and is active
    const p = await pool.query(`select * from insurance_policies where id=$1 and user_id=$2 and status='active'`, [b.policy_id, req.user.id]);
    if (!p.rowCount) return res.status(404).json({ error: 'policy_not_found_or_inactive' });
    const policy = p.rows[0];

    if (claimAmt.greaterThan(new Decimal(policy.coverage_amount)))
      return res.status(422).json({ error: 'claim_exceeds_coverage', coverage: policy.coverage_amount });

    const idem = `ins:claim:${req.user.id}:${crypto.randomBytes(8).toString('hex')}`;
    const c = await pool.query(
      `insert into insurance_claims (policy_id, user_id, amount, reason, evidence_ref, status)
       values ($1,$2,$3,$4,$5,'pending') returning *`,
      [b.policy_id, req.user.id, claimAmt.toFixed(4), b.reason, b.evidence_ref]
    );

    await audit(req, 'insurance.claim', 'insurance_claim', c.rows[0].id, { policy: b.policy_id, amount: b.amount, reason: b.reason });
    res.status(201).json({ claim: c.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;

// ---- Admin routes (mounted separately with admin gate) ----
router.admin = express.Router();
router.admin.use(authRequired);

router.admin.use(async (req, res, next) => {
  const pool = getPool();
  const r = await pool.query(`select 1 from user_roles ur join roles rl on rl.id=ur.role_id where ur.user_id=$1 and rl.name='super_admin'`, [req.user.id]);
  if (!r.rowCount) return res.status(403).json({ error: 'admin_only' });
  next();
});

// GET /admin/insurance/policies — all policies
router.admin.get('/policies', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select p.*, u.email as user_email
       from insurance_policies p
       join users u on u.id = p.user_id
       order by p.created_at desc limit 200`
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /admin/insurance/claims — all claims
router.admin.get('/claims', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select c.*, p.token_code, p.coverage_amount, u.email as user_email
       from insurance_claims c
       join insurance_policies p on p.id = c.policy_id
       join users u on u.id = c.user_id
       order by c.created_at desc limit 200`
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /admin/insurance/claims/:id/review {decision: approve|reject, note}
router.admin.post('/claims/:id/review', async (req, res, next) => {
  try {
    const b = z.object({
      decision: z.enum(['approve', 'reject']),
      note: z.string().max(1000).optional().default(''),
    }).parse(req.body);

    const pool = getPool();
    const r = await pool.query(`select * from insurance_claims where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const claim = r.rows[0];
    if (claim.status !== 'pending') return res.status(409).json({ error: 'bad_state', status: claim.status });

    if (b.decision === 'reject') {
      await pool.query(`update insurance_claims set status='rejected', reviewed_by=$1, reviewed_at=now(), updated_at=now() where id=$2`,
        [req.user.id, claim.id]);
      await audit(req, 'insurance.claim.reject', 'insurance_claim', claim.id, { note: b.note });
      return res.json({ ok: true, status: 'rejected' });
    }

    // approve — book liability + create payout request
    const policy = await pool.query(`select * from insurance_policies where id=$1`, [claim.policy_id]);
    if (!policy.rowCount) return res.status(404).json({ error: 'policy_not_found' });
    const pol = policy.rows[0];

    // Mark policy as claimed
    await pool.query(`update insurance_policies set status='claimed' where id=$1`, [claim.policy_id]);

    // Book insurance liability
    const idem = `ins:claimpay:${claim.id}`;
    await postBalanced({
      sourceType: 'insurance_claim_pay',
      sourceId: claim.id,
      currency: 'USDT',
      memo: `insurance claim ${claim.id} payout`,
      idempotencyKey: `ins:claimpay:${idem}`,
      lines: [
        { account: 'LIAB:insurance_claims', debit: claim.amount },
        { account: 'REV:insurance_reserve', credit: claim.amount },
      ],
    }).catch((e) => { if (!/duplicate|already/i.test(e.message)) throw e; });

    // Create payout request
    const payout = await pool.query(
      `insert into payout_requests (user_id, amount, currency, kind, status, idempotency_key)
       values ($1,$2,'USDT','insurance_claim','approved',$3) returning *`,
      [claim.user_id, claim.amount, idem]
    );

    await pool.query(
      `update insurance_claims set status='approved', reviewed_by=$1, reviewed_at=now(), payout_id=$2 where id=$3`,
      [req.user.id, payout.rows[0].id, claim.id]
    );

    await audit(req, 'insurance.claim.approve', 'insurance_claim', claim.id, { payout: payout.rows[0].id, amount: claim.amount });
    res.json({ ok: true, status: 'approved', payout: payout.rows[0] });
  } catch (e) { next(e); }
});
