// Admin user & role management — super_admin only.
// Lists users, creates staff accounts, assigns/removes roles and permissions.
const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

async function superAdminOnly(req, res, next) {
  const pool = getPool();
  const r = await pool.query(`select 1 from user_roles ur join roles rl on rl.id=ur.role_id where ur.user_id=$1 and rl.name='super_admin'`, [req.user.id]);
  if (!r.rowCount) return res.status(403).json({ error: 'super_admin_only' });
  next();
}
router.use(superAdminOnly);

async function audit(req, action, targetType, targetId, diff) {
  await getPool().query(`insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, action, targetType, targetId, diff || {}, req.ip]);
}

// ---- Users ----

// GET /admin/users — list users with roles
router.get('/users', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select u.id, u.email, u.status, u.member_no, u.mfa_enabled, u.created_at,
              p.display_name,
              coalesce(array_agg(rl.name) filter (where rl.name is not null), '{}') as roles
       from users u
       left join user_profiles p on p.user_id = u.id
       left join user_roles ur on ur.user_id = u.id
       left join roles rl on rl.id = ur.role_id
       group by u.id, p.display_name
       order by u.created_at desc`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /admin/users — create a staff account (random password, email it out-of-band)
router.post('/users', async (req, res, next) => {
  try {
    const b = z.object({
      email: z.string().email().max(320),
      displayName: z.string().min(2).max(120).optional(),
      role: z.string().min(1), // role name to assign
      sendPassword: z.boolean().optional().default(false),
    }).parse(req.body);

    const pool = getPool();
    const email = b.email.toLowerCase().trim();
    const dup = await pool.query(`select 1 from users where lower(email)=$1`, [email]);
    if (dup.rowCount) return res.status(409).json({ error: 'duplicate', message: 'Email already registered.' });

    const roleRow = await pool.query(`select id from roles where name=$1`, [b.role]);
    if (!roleRow.rowCount) return res.status(400).json({ error: 'bad_role', message: 'Role not found.' });

    const tempPassword = crypto.randomBytes(10).toString('hex');
    const hash = await bcrypt.hash(tempPassword, 12);
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    const memberNo = 'TKX-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const u = await pool.query(
      `insert into users (email, password_hash, status, referral_code, member_no, email_verified_at)
       values ($1,$2,'active',$3,$4,now()) returning id, email, referral_code, member_no`,
      [email, hash, code, memberNo]);
    const userId = u.rows[0].id;

    await pool.query(`insert into user_profiles (user_id, display_name) values ($1,$2)`, [userId, b.displayName || null]);
    await pool.query(`insert into user_roles (user_id, role_id, granted_by) values ($1,$2,$3)`, [userId, roleRow.rows[0].id, req.user.id]);
    await pool.query(`insert into consent_records (user_id, doc, version, ip) values ($1,'terms',$2,$3),($1,'privacy',$2,$3)`, [userId, '2026.10-v1', req.ip]);

    await audit(req, 'user.create', 'user', userId, { email, role: b.role });

    res.status(201).json({
      user: u.rows[0],
      ...(b.sendPassword ? { tempPassword } : {}), // only returned once; deliver out-of-band
      note: 'Temporary password shown once. User should reset on first login.',
    });
  } catch (e) { next(e); }
});

// PUT /admin/users/:id/role — assign or remove a role
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const b = z.object({
      action: z.enum(['assign', 'remove']),
      role: z.string().min(1),
    }).parse(req.body);

    const pool = getPool();
    const userRow = await pool.query(`select id from users where id=$1`, [req.params.id]);
    if (!userRow.rowCount) return res.status(404).json({ error: 'not_found' });
    const roleRow = await pool.query(`select id from roles where name=$1`, [b.role]);
    if (!roleRow.rowCount) return res.status(404).json({ error: 'not_found', message: 'Role not found.' });

    if (b.action === 'assign') {
      await pool.query(`insert into user_roles (user_id, role_id, granted_by) values ($1,$2,$3) on conflict do nothing`,
        [req.params.id, roleRow.rows[0].id, req.user.id]);
    } else {
      await pool.query(`delete from user_roles where user_id=$1 and role_id=$2`, [req.params.id, roleRow.rows[0].id]);
    }
    await audit(req, `user.role.${b.action}`, 'user', req.params.id, { role: b.role });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /admin/users/:id — suspend (soft) a user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`update users set status='suspended', updated_at=now() where id=$1 returning id, email`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'user.suspend', 'user', req.params.id, {});
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) { next(e); }
});

// ---- Roles ----

// GET /admin/roles — list roles with permission counts
router.get('/roles', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select r.id, r.name, r.description,
              count(rp.permission_id)::int as permission_count
       from roles r
       left join role_permissions rp on rp.role_id = r.id
       group by r.id, r.name, r.description
       order by r.name`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /admin/permissions — all permission definitions
router.get('/permissions', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`select * from permissions order by key`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// GET /admin/roles/:id/permissions — permissions assigned to a role
router.get('/roles/:id/permissions', async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `select p.id, p.key, p.description from permissions p
       join role_permissions rp on rp.permission_id = p.id
       where rp.role_id = $1
       order by p.key`, [req.params.id]);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /admin/roles/:id/permissions — assign a permission to a role
router.post('/roles/:id/permissions', async (req, res, next) => {
  try {
    const b = z.object({ permissionKey: z.string().min(1) }).parse(req.body);
    const pool = getPool();
    const roleRow = await pool.query(`select id from roles where id=$1`, [req.params.id]);
    if (!roleRow.rowCount) return res.status(404).json({ error: 'not_found' });
    const permRow = await pool.query(`select id from permissions where key=$1`, [b.permissionKey]);
    if (!permRow.rowCount) return res.status(404).json({ error: 'not_found', message: 'Permission not found.' });
    await pool.query(`insert into role_permissions (role_id, permission_id) values ($1,$2) on conflict do nothing`,
      [req.params.id, permRow.rows[0].id]);
    await audit(req, 'role.permission.assign', 'role', req.params.id, { permission: b.permissionKey });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /admin/roles/:id/permissions/:permissionKey — remove permission from role
router.delete('/roles/:id/permissions/:permissionKey', async (req, res, next) => {
  try {
    const pool = getPool();
    const permRow = await pool.query(`select id from permissions where key=$1`, [req.params.permissionKey]);
    if (!permRow.rowCount) return res.status(404).json({ error: 'not_found' });
    await pool.query(`delete from role_permissions where role_id=$1 and permission_id=$2`, [req.params.id, permRow.rows[0].id]);
    await audit(req, 'role.permission.remove', 'role', req.params.id, { permission: req.params.permissionKey });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
