// Payments sanity seed — NOTHING financial. Only verifies that the shared
// SIM-USDT ledger account exists and prints guidance if it is missing.
// Run: `node db/seed-payments.cjs` (from backend/).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
  await pool.query(`SET search_path TO gatedp2p, public;`);
  const r = await pool.query(`select code, type, currency from ledger_accounts where code = 'LIAB:sim_usdt'`);
  if (!r.rowCount) {
    console.log('[seed-payments] MISSING ledger account LIAB:sim_usdt.');
    console.log('[seed-payments] Guidance: run `node db/migrate-payments.cjs` (creates it IF NOT EXISTS),');
    console.log('[seed-payments] then re-run this check. Do NOT hand-insert financial rows.');
  } else {
    console.log('[seed-payments] OK — LIAB:sim_usdt exists:', JSON.stringify(r.rows[0]));
  }
  const c = await pool.query(`select code from ledger_accounts where code = 'SIM:usdt_clearing'`);
  if (!c.rowCount) {
    console.log('[seed-payments] MISSING ledger account SIM:usdt_clearing — run `node db/migrate-payments.cjs`.');
  } else {
    console.log('[seed-payments] OK — SIM:usdt_clearing exists.');
  }
  console.log('[seed-payments] done. No financial rows written (by design).');
  await pool.end();
}
main().catch((e) => { console.error('[seed-payments] failed:', e.message); process.exit(1); });
