const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { Decimal } = require('../lib/ledger');
const { eligibleBalance } = require('../lib/payoutEligibility');
const router = express.Router();
router.use(authRequired);

// POST /payouts/request — eligible company-funded commissions/rewards ONLY
router.post('/request', async (req, res, next) => {
  let client;
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
    client = await pool.connect();
    await client.query('begin');
    // Serialize concurrent requests for the same user+currency so two
    // simultaneous submissions cannot both pass the eligibility check.
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `payout-request:${req.user.id}:${b.currency}`,
    ]);
    // eligible = payable calcs minus all outstanding/paid commission+reward requests
    const elig = await eligibleBalance(req.user.id, b.currency, null, client);
    if (elig.lessThan(new Decimal(b.amount))) {
      await client.query('rollback');
      return res.status(422).json({ error: 'insufficient_eligible', eligible: elig.toString() });
    }
    const key = b.idempotencyKey || crypto.randomBytes(16).toString('hex');
    const r = await client.query(
      `insert into payout_requests (user_id, amount, currency, kind, status, destination, idempotency_key)
       values ($1,$2,$3,$4,'requested',$5,$6) on conflict (idempotency_key) do nothing returning *`,
      [req.user.id, b.amount, b.currency, b.kind, b.destination, key]);
    if (!r.rowCount) {
      await client.query('rollback');
      return res.status(200).json({ replayed: true });
    }
    await client.query(`insert into payout_events (payout_id, to_status, actor_id, note) values ($1,'requested',$2,'submitted')`, [r.rows[0].id, req.user.id]);
    await client.query('commit');
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (client) { try { await client.query('rollback'); } catch { /* ignore */ } }
    next(e);
  } finally {
    if (client) client.release();
  }
});

router.get('/mine', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`select * from payout_requests where user_id=$1 order by created_at desc limit 50`, [req.user.id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});
module.exports = router;
