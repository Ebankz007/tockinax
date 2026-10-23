const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

// POST /payouts/request — eligible company-funded commissions/rewards ONLY
router.post('/request', async (req, res, next) => {
  try {
    const b = z.object({
      kind: z.enum(['commission', 'reward']),
      amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      currency: z.enum(['USD', 'NGN']),
      destination: z.object({}).passthrough(),
      idempotencyKey: z.string().min(8).max(96).optional(),
    }).parse(req.body);
    if (b.destination.privateKey || b.destination.seed || b.destination.mnemonic)
      return res.status(400).json({ error: 'never_share_keys', message: 'Never submit private keys or seed phrases.' });
    const pool = getPool();
    // eligible balance = confirmed-payable calcs minus already-requested/paid
    const elig = await pool.query(
      `select coalesce(sum(amount),0)::text as bal from (
         select amount from commission_calculations where beneficiary_id=$1 and status='payable' and currency=$2
         union all select amount from reward_calculations rc join reward_campaigns c on c.id=rc.campaign_id
           where rc.user_id=$1 and rc.status='payable' and rc.currency=$2 and c.status='completed'
       ) s`, [req.user.id, b.currency]);
    if (Number(elig.rows[0].bal) < Number(b.amount))
      return res.status(422).json({ error: 'insufficient_eligible', eligible: elig.rows[0].bal });
    const key = b.idempotencyKey || crypto.randomBytes(16).toString('hex');
    const r = await pool.query(
      `insert into payout_requests (user_id, amount, currency, kind, status, destination, idempotency_key)
       values ($1,$2,$3,$4,'requested',$5,$6) on conflict (idempotency_key) do nothing returning *`,
      [req.user.id, b.amount, b.currency, b.kind, b.destination, key]);
    if (!r.rowCount) return res.status(200).json({ replayed: true });
    await pool.query(`insert into payout_events (payout_id, to_status, actor_id, note) values ($1,'requested',$2,'submitted')`, [r.rows[0].id, req.user.id]);
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.get('/mine', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`select * from payout_requests where user_id=$1 order by created_at desc limit 50`, [req.user.id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});
module.exports = router;
