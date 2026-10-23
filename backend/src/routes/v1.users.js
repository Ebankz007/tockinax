const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

async function isSuperAdmin(userId) {
  const r = await getPool().query(
    `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
     where ur.user_id = $1 and rl.name = 'super_admin'`,
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

// GET /profile
router.get('/profile', async (req, res, next) => {
  try {
    const pool = getPool();
    const u = await pool.query(
      `select id, email, status, seller_enabled, referral_code, created_at from users where id = $1`,
      [req.user.id]
    );
    const p = await pool.query(`select * from user_profiles where user_id = $1`, [req.user.id]);
    res.json({ user: u.rows[0], profile: p.rows[0] || null });
  } catch (e) { next(e); }
});

// PUT /profile — displayName, phone, USDT addresses, country. NO email change here.
router.put('/profile', async (req, res, next) => {
  try {
    const b = z.object({
      displayName: z.string().max(120).optional(),
      phone: z.string().max(32).optional(),
      country: z.string().regex(/^[A-Z]{2}$/).optional(),
      usdtAddressBep20: z.string().max(128).nullable().optional(),
      usdtAddressTrc20: z.string().max(128).nullable().optional(),
      avatarUrl: z.string().url().max(500).nullable().optional(),
    }).strict().parse(req.body);
    const pool = getPool();
    await pool.query(
      `insert into user_profiles (user_id, display_name, phone, country, usdt_bep20, usdt_trc20, avatar_url)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (user_id) do update set
         display_name = coalesce(excluded.display_name, user_profiles.display_name),
         phone = coalesce(excluded.phone, user_profiles.phone),
         country = coalesce(excluded.country, user_profiles.country),
         usdt_bep20 = coalesce(excluded.usdt_bep20, user_profiles.usdt_bep20),
         usdt_trc20 = coalesce(excluded.usdt_trc20, user_profiles.usdt_trc20),
         avatar_url = coalesce(excluded.avatar_url, user_profiles.avatar_url),
         updated_at = now()`,
      [req.user.id, b.displayName ?? null, b.phone ?? null, b.country ?? null,
        b.usdtAddressBep20 ?? null, b.usdtAddressTrc20 ?? null, b.avatarUrl ?? null]
    );
    const p = await pool.query(`select * from user_profiles where user_id = $1`, [req.user.id]);
    res.json(p.rows[0]);
  } catch (e) { next(e); }
});

// POST /seller/apply — files a seller-application support ticket for staff review
router.post('/seller/apply', async (req, res, next) => {
  try {
    const b = z.object({ note: z.string().max(2000).optional().default('') }).parse(req.body);
    const pool = getPool();
    const me = await pool.query(`select seller_enabled from users where id = $1`, [req.user.id]);
    if (me.rows[0] && me.rows[0].seller_enabled)
      return res.status(409).json({ error: 'already_seller' });
    const dup = await pool.query(
      `select id from support_tickets where user_id = $1 and category = 'seller_application' and status != 'closed' limit 1`,
      [req.user.id]
    );
    if (dup.rowCount) return res.status(409).json({ error: 'application_pending', ticketId: dup.rows[0].id });
    const t = await pool.query(
      `insert into support_tickets (user_id, subject, category, status) values ($1,'Seller application','seller_application','open') returning *`,
      [req.user.id]
    );
    await pool.query(
      `insert into support_messages (ticket_id, author_id, body, internal) values ($1,$2,$3,false)`,
      [t.rows[0].id, req.user.id, b.note || 'Requesting seller activation.']
    );
    res.status(201).json({ ok: true, ticket: t.rows[0] });
  } catch (e) { next(e); }
});

// GET /notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from notifications where user_id = $1 order by created_at desc limit 50`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /notifications/:id/read
router.post('/notifications/:id/read', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `update notifications set read_at = now() where id = $1 and user_id = $2 and read_at is null returning *`,
      [req.params.id, req.user.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ---- Admin ----
async function adminOnly(req, res, next) {
  if (!(await isSuperAdmin(req.user.id))) return res.status(403).json({ error: 'admin_only' });
  next();
}

// GET / — search ?q&status&page
router.get('/', adminOnly, async (req, res, next) => {
  try {
    const q = z.object({
      q: z.string().max(320).optional(),
      status: z.enum(['pending_email', 'pending_verification', 'active', 'suspended', 'banned']).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).parse(req.query);
    const limit = 25;
    const offset = (q.page - 1) * limit;
    const clauses = [];
    const params = [];
    if (q.q) { params.push(`%${q.q}%`); clauses.push(`(email ilike $${params.length} or referral_code ilike $${params.length})`); }
    if (q.status) { params.push(q.status); clauses.push(`status = $${params.length}`); }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const pool = getPool();
    const rows = await pool.query(
      `select id, email, status, seller_enabled, referral_code, created_at from users ${where} order by created_at desc limit ${limit} offset ${offset}`,
      params
    );
    const cnt = await pool.query(`select count(*)::int as total from users ${where}`, params);
    res.json({ total: cnt.rows[0].total, page: q.page, users: rows.rows });
  } catch (e) { next(e); }
});

// POST /:id/suspend {reason}
router.post('/:id/suspend', adminOnly, async (req, res, next) => {
  try {
    const b = z.object({ reason: z.string().min(5).max(1000) }).parse(req.body);
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'cannot_suspend_self' });
    const r = await getPool().query(
      `update users set status = 'suspended', updated_at = now() where id = $1 and status != 'banned' returning id, email, status`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(req.user.id, req.ip, 'user.suspend', 'user', req.params.id, { reason: b.reason });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /:id/reactivate
router.post('/:id/reactivate', adminOnly, async (req, res, next) => {
  try {
    const r = await getPool().query(
      `update users set status = 'active', failed_logins = 0, locked_until = null, updated_at = now()
       where id = $1 and status = 'suspended' returning id, email, status`,
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'not_found_or_not_suspended' });
    await audit(req.user.id, req.ip, 'user.reactivate', 'user', req.params.id, {});
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
