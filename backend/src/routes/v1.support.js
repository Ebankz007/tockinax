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

// POST /tickets — open a ticket
router.post('/tickets', async (req, res, next) => {
  try {
    const b = z.object({
      subject: z.string().min(5).max(160),
      category: z.string().max(48).default('general'),
      body: z.string().min(5).max(5000),
    }).parse(req.body);
    const pool = getPool();
    const t = await pool.query(
      `insert into support_tickets (user_id, subject, category, status) values ($1,$2,$3,'open') returning *`,
      [req.user.id, b.subject, b.category]
    );
    await pool.query(
      `insert into support_messages (ticket_id, author_id, body, internal) values ($1,$2,$3,false)`,
      [t.rows[0].id, req.user.id, b.body]
    );
    res.status(201).json(t.rows[0]);
  } catch (e) { next(e); }
});

// GET /tickets/mine
router.get('/tickets/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from support_tickets where user_id = $1 order by updated_at desc limit 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /tickets/:id — owner or support/admin (owners never see internal notes)
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const t = await pool.query(`select * from support_tickets where id = $1`, [req.params.id]);
    if (!t.rowCount) return res.status(404).json({ error: 'not_found' });
    const staff = await isStaff(req.user.id);
    if (!staff && t.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'forbidden' });
    const m = await pool.query(
      staff
        ? `select * from support_messages where ticket_id = $1 order by created_at asc limit 200`
        : `select * from support_messages where ticket_id = $1 and internal = false order by created_at asc limit 200`,
      [req.params.id]
    );
    res.json({ ticket: t.rows[0], messages: m.rows });
  } catch (e) { next(e); }
});

// POST /tickets/:id/messages — owner replies (internal forced false); staff may set internal=true
router.post('/tickets/:id/messages', async (req, res, next) => {
  try {
    const b = z.object({
      body: z.string().min(1).max(5000),
      internal: z.boolean().optional().default(false),
    }).parse(req.body);
    const pool = getPool();
    const t = await pool.query(`select * from support_tickets where id = $1`, [req.params.id]);
    if (!t.rowCount) return res.status(404).json({ error: 'not_found' });
    const staff = await isStaff(req.user.id);
    if (!staff && t.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'forbidden' });
    if (!staff && t.rows[0].status === 'closed')
      return res.status(409).json({ error: 'ticket_closed' });
    const internal = staff ? !!b.internal : false;
    const m = await pool.query(
      `insert into support_messages (ticket_id, author_id, body, internal) values ($1,$2,$3,$4) returning *`,
      [req.params.id, req.user.id, b.body, internal]
    );
    await pool.query(`update support_tickets set updated_at = now() where id = $1`, [req.params.id]);
    res.status(201).json(m.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
