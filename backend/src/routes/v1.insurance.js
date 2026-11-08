// Insurance — ACCOUNT-LEVEL membership. Insurance is activated once on the
// member account (POST /auth/insurance/activate) and is not tied to a token,
// holding, or lock term. Claims are reviewed and paid by admin.
// All money movement is balanced through the double-entry ledger.
const express = require('express');
const { z } = require('zod');
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

// GET /insurance/coverage — account-level insurance membership status
router.get('/coverage', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select insurance_active, insurance_activated_at from users where id=$1`,
      [req.user.id]
    );
    const u = r.rows[0] || {};
    res.json({
      account: {
        insurance_active: !!u.insurance_active,
        insurance_activated_at: u.insurance_activated_at || null,
      },
      items: [],
      note: 'Insurance is account-level. It is not tied to any token, holding, or lock term.',
    });
  } catch (e) { next(e); }
});

// GET /insurance/claims/mine — claims filed by the current user
router.get('/claims/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from insurance_claims where user_id = $1 order by created_at desc`,
      [req.user.id]
    );
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /insurance/purchase — RETIRED. Insurance is activated on the account,
// never purchased per token/holding/lock term.
router.post('/purchase', (_req, res) => {
  res.status(410).json({
    error: 'account_level_insurance_only',
    message: 'Insurance is activated once on your account via POST /auth/insurance/activate. It is not purchased per token or per lock term.',
  });
});

// POST /insurance/claim {amount, reason, evidence_ref} — account-level claim
router.post('/claim', async (req, res, next) => {
  try {
    const b = z.object({
      amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      reason: z.enum(['unsold_at_maturity', 'partial_fill_loss', 'platform_fault']),
      evidence_ref: z.string().max(500).optional().default(''),
    }).parse(req.body);

    const pool = getPool();
    const claimAmt = new Decimal(b.amount);
    if (claimAmt.lte(0)) return res.status(400).json({ error: 'invalid_amount' });

    // Account-level gate: the member must have activated insurance on the account.
    const u = await pool.query(`select insurance_active from users where id=$1`, [req.user.id]);
    if (!u.rowCount || !u.rows[0].insurance_active) {
      return res.status(403).json({ error: 'insurance_not_active', message: 'Activate insurance on your account before filing a claim.' });
    }

    const c = await pool.query(
      `insert into insurance_claims (policy_id, user_id, amount, reason, evidence_ref, status)
       values (null,$1,$2,$3,$4,'pending') returning *`,
      [req.user.id, claimAmt.toFixed(4), b.reason, b.evidence_ref]
    );

    await audit(req, 'insurance.claim', 'insurance_claim', c.rows[0].id, { amount: b.amount, reason: b.reason });
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
       left join insurance_policies p on p.id = c.policy_id
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
      await pool.query(`update insurance_claims set status='rejected', reviewed_by=$1, reviewed_at=now() where id=$2`,
        [req.user.id, claim.id]);
      await audit(req, 'insurance.claim.reject', 'insurance_claim', claim.id, { note: b.note });
      return res.json({ ok: true, status: 'rejected' });
    }

    // approve — book liability + create payout request (account-level claims
    // have no per-token policy; legacy policy claims are marked claimed if present)
    if (claim.policy_id) {
      await pool.query(`update insurance_policies set status='claimed' where id=$1`, [claim.policy_id]);
    }

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
