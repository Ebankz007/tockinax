// Secure first-admin bootstrap — no hardcoded passwords.
// Usage: ADMIN_EMAIL=you@co.com npm run admin:create  → prints one-time token (valid 60 min).
// The token holder completes /api/v1/auth/register then redeems via script output instructions.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const crypto = require('crypto');
const { Pool } = require('pg');
async function main() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
  if (!email || !email.includes('@')) { console.error('Set ADMIN_EMAIL=... first'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.query(`insert into system_settings (key, value) values ('admin_bootstrap:'||$1, $2)
    on conflict (key) do update set value=excluded.value`,
    [hash.slice(0, 32), JSON.stringify({ email, hash, expires: Date.now() + 60 * 60 * 1000 })]);
  console.log(`[admin:create] bootstrap reserved for ${email}. One-time token:\n${token}\nRegister with that email, then run: node src/scripts/admin-grant.cjs ${hash.slice(0, 16)} <user-id>`);
  await pool.end();
}
main();
