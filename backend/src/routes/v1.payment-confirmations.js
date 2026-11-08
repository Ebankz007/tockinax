// Member-to-member payment confirmations.
//
// Flow:
//   1. Buyer pays seller directly to seller's saved wallet.
//   2. Buyer submits proof (tx hash + optional screenshot) → POST /payments/confirm
//   3. Seller sees pending payment → GET /payments/pending
//   4. Seller approves (after seeing funds in wallet) or rejects → POST /payments/:id/decision
//   5. On approval: payment confirmed, buyer's selling eligibility activated.
//   6. Dispute path: either party can dispute → POST /payments/:id/dispute
//   7. Admin override for rejected/disputed payments → POST /admin/payments/:id/override
//   8. Timeout: payments pending > 7 days auto-expire (checked by sweeper or on access).
//
// Security:
//   - Only the assigned seller can approve/reject.
//   - Only the buyer can submit proof.
//   - Self-approval is impossible (buyer != seller enforced by DB).
//   - Double approval prevented by status transition guard.
//   - All mutations audited.

'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');

const router = express.Router();
router.use(authRequired);

async function audit(pool, actorId, ip, action, targetId, diff) {
  await pool.query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, 'payment_confirmation', String(targetId), diff || {}, ip || null]
  ).catch(() => {});
}

function networkDisplay(network) {
  return network === 'BEP20' ? 'USDT (BSC/BEP20)' : 'USDT (TRON/TRC20)';
}

// POST /payments/confirm — buyer submits payment proof.
// Body: { order_id?, amount, currency, network, proof_tx_hash, proof_screenshot_key? }
// The order_id links to an existing order (buyer_id must match req.user.id).
// If no order_id, this is a standalone member-to-member payment.
router.post('/confirm', async (req, res, next) => {
  try {
    const pool = getPool();
    const b = z.object({
      order_id: z.string().uuid().optional(),
      amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      currency: z.string().min(2).max(8).default('USDT'),
      network: z.enum(['TRC20', 'BEP20']),
      proof_tx_hash: z.string().min(1).max(128),
      proof_screenshot_key: z.string().max(512).optional(),
    }).parse(req.body);

    const buyerId = req.user.id;
    let sellerId = null;

    // If an order is linked, verify the buyer is the order's buyer and get the seller.
    if (b.order_id) {
      const ord = await pool.query(
        `select buyer_id, seller_id, amount, currency from orders where id=$1`,
        [b.order_id]
      );
      if (!ord.rowCount) return res.status(404).json({ error: 'order_not_found' });
      const o = ord.rows[0];
      if (o.buyer_id !== buyerId) return res.status(403).json({ error: 'not_buyer', message: 'You are not the buyer of this order.' });
      sellerId = o.seller_id;
      // Use order amount/currency if not overridden.
      if (!b.amount) b.amount = String(o.amount);
      if (!b.currency) b.currency = o.currency;
    } else {
      // Standalone payment: seller must be identifiable. For now, require order_id.
      // In a future version, a "payment request" from seller could establish this link.
      return res.status(400).json({ error: 'order_required', message: 'An order_id is required to identify the seller.' });
    }

    if (!sellerId) return res.status(400).json({ error: 'no_seller' });
    if (buyerId === sellerId) return res.status(409).json({ error: 'self_payment', message: 'Cannot pay yourself.' });

    const idem = `pc:${buyerId}:${b.order_id || 'standalone'}:${b.proof_tx_hash}:${crypto.randomBytes(6).toString('hex')}`;
    const ins = await pool.query(
      `insert into payment_confirmations
        (buyer_id, seller_id, order_id, amount, currency, network, status, proof_tx_hash, proof_screenshot_key, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9) returning *`,
      [buyerId, sellerId, b.order_id || null, b.amount, b.currency, b.network, b.proof_tx_hash, b.proof_screenshot_key || null, idem]
    );
    await audit(pool, buyerId, req.ip, 'payment.confirm_submit', ins.rows[0].id, {
      order_id: b.order_id, amount: b.amount, currency: b.currency, network: b.network,
    });
    res.status(201).json(ins.rows[0]);
  } catch (e) { next(e); }
});

// GET /payments/pending — seller's pending confirmations awaiting their decision.
router.get('/pending', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select pc.*, u.email as buyer_email, u.member_no as buyer_member_no,
              o.order_no, o.title as order_title
         from payment_confirmations pc
         join users u on u.id = pc.buyer_id
         left join orders o on o.id = pc.order_id
        where pc.seller_id=$1 and pc.status='pending'
        order by pc.created_at asc limit 100`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /payments/mine — member's own confirmations (as buyer or seller).
router.get('/mine', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select pc.*, u.email as counterparty_email,
              case when pc.buyer_id=$1 then 'seller' else 'buyer' end as my_role,
              o.order_no
         from payment_confirmations pc
         join users u on u.id = case when pc.buyer_id=$1 then pc.seller_id else pc.buyer_id end
         left join orders o on o.id = pc.order_id
        where pc.buyer_id=$1 or pc.seller_id=$1
        order by pc.created_at desc limit 100`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /payments/:id/decision — seller approves or rejects.
// Body: { decision: 'approve'|'reject', note? }
// Only the assigned seller can decide. Prevents double approval via status guard.
router.post('/:id/decision', async (req, res, next) => {
  try {
    const pool = getPool();
    const b = z.object({
      decision: z.enum(['approve', 'reject']),
      note: z.string().max(1000).optional().default(''),
    }).parse(req.body);

    const r = await pool.query(`select * from payment_confirmations where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const pc = r.rows[0];
    if (pc.seller_id !== req.user.id) return res.status(403).json({ error: 'not_seller', message: 'Only the assigned seller can decide.' });
    if (pc.status !== 'pending') return res.status(409).json({ error: 'bad_state', message: `Payment is ${pc.status}.` });

    if (b.decision === 'reject') {
      await pool.query(`update payment_confirmations set status='rejected', reviewed_by=$1, reviewed_at=now() where id=$2`, [req.user.id, pc.id]);
      await audit(pool, req.user.id, req.ip, 'payment.reject', pc.id, { note: b.note });
      return res.json({ ok: true, status: 'rejected' });
    }

    // approve — activate buyer's selling eligibility.
    await pool.query(`update payment_confirmations set status='approved', seller_confirmed_by=$1, seller_confirmed_at=now(), reviewed_by=$1, reviewed_at=now() where id=$2`, [req.user.id, pc.id]);
    // Activate buyer's seller_enabled flag (they have demonstrated they can pay).
    await pool.query(`update users set seller_enabled=true, updated_at=now() where id=$1`, [pc.buyer_id]);
    await audit(pool, req.user.id, req.ip, 'payment.approve', pc.id, { note: b.note, buyer_id: pc.buyer_id });
    res.json({ ok: true, status: 'approved', buyer_id: pc.buyer_id });
  } catch (e) { next(e); }
});

// POST /payments/:id/dispute — either party can dispute.
// Body: { reason }
router.post('/:id/dispute', async (req, res, next) => {
  try {
    const pool = getPool();
    const b = z.object({ reason: z.string().min(3).max(1000) }).parse(req.body);

    const r = await pool.query(`select * from payment_confirmations where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const pc = r.rows[0];
    if (pc.buyer_id !== req.user.id && pc.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'not_party', message: 'Only the buyer or seller can dispute.' });
    }
    if (!['pending', 'proof_submitted', 'approved'].includes(pc.status)) {
      return res.status(409).json({ error: 'bad_state', message: `Cannot dispute a ${pc.status} payment.` });
    }

    await pool.query(
      `update payment_confirmations set status='disputed', reviewed_by=$1, reviewed_at=now() where id=$2`,
      [req.user.id, pc.id]
    );
    await audit(pool, req.user.id, req.ip, 'payment.dispute', pc.id, { reason: b.reason, disputer_id: req.user.id });
    res.json({ ok: true, status: 'disputed' });
  } catch (e) { next(e); }
});

module.exports = router;
