const jwt = require('jsonwebtoken');
const { getPool } = require('../lib/db');

function signAccess(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
}
function signRefresh(user, sid) {
  return jwt.sign({ sub: user.id, sid }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
}

async function authRequired(req, res, next) {
  try {
    const token = req.cookies?.tockinax_at || (req.headers.authorization || '').replace(/^Bearer /i, '');
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    const p = jwt.verify(token, process.env.JWT_SECRET);
    const pool = getPool();
    const r = await pool.query(`select id, email, status from users where id=$1`, [p.sub]);
    if (!r.rows.length || ['suspended', 'banned'].includes(r.rows[0].status)) return res.status(401).json({ error: 'account_blocked' });
    req.user = r.rows[0];
    next();
  } catch { return res.status(401).json({ error: 'unauthorized' }); }
}

// Granular RBAC — checks DB, never trusts frontend flags.
function requirePerm(...keys) {
  return async (req, res, next) => {
    const pool = getPool();
    const r = await pool.query(
      `select p.key from permissions p
       join role_permissions rp on rp.permission_id=p.id
       join user_roles ur on ur.role_id=rp.role_id
       where ur.user_id=$1`, [req.user.id]).catch(async () => {
        // fallback: role-name based bootstrap (pre-migration of role_permissions table)
        const r2 = await pool.query(`select r.name from roles r join user_roles ur on ur.role_id=r.id where ur.user_id=$1`, [req.user.id]);
        const names = r2.rows.map(x => x.name);
        if (names.includes('super_admin')) return { rows: keys.map(k => ({ key: k })) };
        return { rows: [] };
      });
    const have = new Set(r.rows.map(x => x.key));
    if (keys.every(k => have.has(k))) return next();
    return res.status(403).json({ error: 'forbidden', need: keys });
  };
}

module.exports = { signAccess, signRefresh, authRequired, requirePerm };
