const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

async function isStaff(userId) {
  const pool = getPool();
  const r = await pool.query(
    `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
     where ur.user_id = $1 and rl.name in ('super_admin','admin','support')`,
    [userId]
  );
  return r.rowCount > 0;
}

async function audit(actorId, ip, action, targetType, targetId, diff) {
  await getPool().query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, targetType, targetId, diff || {}, ip]
  );
}

// POST / — open dispute on own order (screenshot/evidence never auto-completes)
router.post('/', async (req, res, next) => {
  try {
    const b = z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(10).max(2000),
    }).parse(req.body);
    const pool = getPool();
    const o = await pool.query(`select * from orders where id = $1`, [b.orderId]);
    if (!o.rowCount) return res.status(404).json({ error: 'order_not_found' });
    const ord = o.rows[0];
    if (ord.buyer_id !== req.user.id && ord.seller_id !== req.user.id)
      return res.status(403).json({ error: 'not_party' });
    if (['completed', 'cancelled', 'expired'].includes(ord.status))
      return res.status(409).json({ error: 'order_closed', status: ord.status });
    const dup = await pool.query(
      `select id from disputes where order_id = $1 and status in ('open','under_review')`,
      [b.orderId]
    );
    if (dup.rowCount) return res.status(409).json({ error: 'dispute_open', disputeId: dup.rows[0].id });
    const d = await pool.query(
      `insert into disputes (order_id, opened_by, reason, status) values ($1,$2,$3,'open') returning *`,
      [b.orderId, req.user.id, b.reason]
    );
    await pool.query(`update orders set status = 'disputed', updated_at = now() where id = $1`, [b.orderId]);
    await audit(req.user.id, req.ip, 'dispute.open', 'dispute', d.rows[0].id, { orderId: b.orderId });
    res.status(201).json(d.rows[0]);
  } catch (e) { next(e); }
});

// GET /mine — my disputes
router.get('/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select d.*, o.order_no, o.status as order_status from disputes d
       join orders o on o.id = d.order_id
       where d.opened_by = $1 or o.buyer_id = $1 or o.seller_id = $1
       order by d.created_at desc limit 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /:id — party or staff only
router.get('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select d.*, o.buyer_id, o.seller_id, o.order_no from disputes d
       join orders o on o.id = d.order_id where d.id = $1`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const d = r.rows[0];
    const staff = await isStaff(req.user.id);
    if (!staff && ![d.buyer_id, d.opened_by, d.seller_id].includes(req.user.id))
      return res.status(403).json({ error: 'forbidden' });
    res.json(d);
  } catch (e) { next(e); }
});

// POST /:id/assign — support/admin
router.post('/:id/assign', async (req, res, next) => {
  try {
    if (!(await isStaff(req.user.id))) return res.status(403).json({ error: 'staff_only' });
    const b = z.object({ assignee: z.string().uuid() }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(
      `update disputes set assignee = $1, status = 'under_review' where id = $2 and status in ('open','under_review') returning *`,
      [b.assignee, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not_found_or_closed' });
    await audit(req.user.id, req.ip, 'dispute.assign', 'dispute', req.params.id, { assignee: b.assignee });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /:id/resolve — support/admin with resolution text
router.post('/:id/resolve', async (req, res, next) => {
  try {
    if (!(await isStaff(req.user.id))) return res.status(403).json({ error: 'staff_only' });
    const b = z.object({
      resolution: z.string().min(10).max(2000),
      outcome: z.enum(['completed', 'cancelled']),
    }).parse(req.body);
    const pool = getPool();
    const d = await pool.query(`select * from disputes where id = $1`, [req.params.id]);
    if (!d.rowCount) return res.status(404).json({ error: 'not_found' });
    if (!['open', 'under_review'].includes(d.rows[0].status))
      return res.status(409).json({ error: 'already_resolved' });
    const orderStatus = b.outcome === 'completed' ? 'resolved_completed' : 'cancelled';
    await pool.query(
      `update disputes set status = 'resolved', resolution = $1, resolved_at = now() where id = $2`,
      [b.resolution, req.params.id]
    );
    await pool.query(
      `update orders set status = $1::order_status, completed_at = case when $2::text = 'resolved_completed' then now() else completed_at end, updated_at = now() where id = $3`,
      [orderStatus, orderStatus, d.rows[0].order_id]
    );
    await audit(req.user.id, req.ip, 'dispute.resolve', 'dispute', req.params.id, { outcome: b.outcome });
    res.json({ ok: true, disputeId: req.params.id, orderStatus });
  } catch (e) { next(e); }
});

module.exports = router;
