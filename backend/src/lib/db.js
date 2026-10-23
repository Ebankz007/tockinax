// Shared pg pool + Drizzle instance
const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');

let pool;
let db;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
    });
    pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
    pool.on('error', (e) => console.error('[pg pool error]', e.message));
  }
  return pool;
}
function getDb() {
  if (!db) db = drizzle(getPool());
  return db;
}
async function ready() {
  await getPool().query('select 1');
  return true;
}
module.exports = { getPool, getDb, ready };
