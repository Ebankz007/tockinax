// Coverage audit: every URL the frontend assumes, against the live backend.
// Member + admin. Expect real data shapes, never 404-on-contract (tolerant
// ModuleEmpty states aside — this script asserts the contract itself).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { buildApp } = require('./src/app');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
const app = buildApp();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`PASS ${n} ${x}`); } else { fail++; console.log(`FAIL ${n} ${x}`); } };
const H = (t) => ({ Authorization: 'Bearer ' + t });

(async () => {
  const ts = Date.now();
  const reg = async (email) => {
    const r = await request(app).post('/api/v1/auth/register').send({ email, password: 'SuperSecure123!', acceptTerms: true });
    await request(app).post('/api/v1/auth/verify-email').send({ email, token: r.body.devVerifyToken });
    const l = await request(app).post('/api/v1/auth/login').send({ email, password: 'SuperSecure123!' });
    return { token: l.body.access };
  };
  const m = await reg(`cov-m${ts}@test.com`);
  // admin via DB
  const ah = await bcrypt.hash('SuperSecure123!', 12);
  const ac = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  const au = await pool.query(`insert into users (email, password_hash, status, referral_code, email_verified_at) values ($1,$2,'active',$3,now()) returning id`, [`cov-a${ts}@test.com`, ah, ac]);
  const aid = au.rows[0].id;
  const rl = await pool.query(`select id from roles where name='super_admin'`);
  await pool.query(`insert into user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [aid, rl.rows[0].id]);
  const al = await request(app).post('/api/v1/auth/login').send({ email: `cov-a${ts}@test.com`, password: 'SuperSecure123!' });
  const A = H(al.body.access), M = H(m.token);
  ok('member+admin auth', !!m.token && !!al.body.access, '');

  const get = async (url, hdr, expect = 200) => {
    const r = await request(app).get(url).set(hdr);
    ok(`GET ${url} -> ${expect}`, r.status === expect, `got ${r.status}`);
    return r;
  };
  const post = async (url, hdr, body, expect) => {
    const r = await request(app).post(url).set(hdr).send(body);
    const good = Array.isArray(expect) ? expect.includes(r.status) : r.status === expect;
    ok(`POST ${url} -> ${expect} ${JSON.stringify(body).slice(0, 60)}`, good, `got ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    return r;
  };

  // ---- member token reads ----
  await get('/api/v1/tokens/definitions', M);
  await get('/api/v1/tokens/holdings', M);
  await get('/api/v1/tokens/cycles', M);
  await get('/api/v1/tokens/stages', M);
  await get('/api/v1/tokens/stages/current', M);
  await get('/api/v1/tokens/stages/config', M);
  await get('/api/v1/tokens/pricing-versions', M);
  await get('/api/v1/tokens/commissions', M);
  await get('/api/v1/tokens/statement', M);
  await get('/api/v1/tokens/categories', M);
  await get('/api/v1/tokenmarket/listings', M);
  await get('/api/v1/deposits/mine', M);
  await get('/api/v1/withdrawals/mine', M);
  // locked config: PUT as member -> 403 ; as admin -> 409
  const put = async (url, hdr, body, expect) => {
    const r = await request(app).put(url).set(hdr).send(body);
    ok(`PUT ${url} -> ${expect}`, r.status === expect, `got ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
    return r;
  };
  await put('/api/v1/tokens/stages/config', M, {}, 403);
  await put('/api/v1/tokens/stages/config', A, {}, 409);
  // kpis member 403, admin 200
  await get('/api/v1/tokens/admin/kpis', M, 403);
  const kpis = await get('/api/v1/tokens/admin/kpis', A);
  ok('kpis has token keys', kpis.body && 'holdings' in kpis.body && 'listings' in kpis.body, '');

  // ---- fund + purchase + listing for admin flows ----
  let r = await post('/api/v1/deposits/intents', M, { purpose: 'token_purchase', amount: '500.0000', network: 'TRC20' }, 201);
  const di = r.body.intent ? r.body.intent.id : r.body.id;
  await post(`/api/v1/deposits/${di}/simulate-pay`, M, {}, 200);
  r = await post('/api/v1/tokens/purchase', M, { amount: '500.0000', cycle_days: 7, agreed_risk: true }, 201);
  const hid = r.body.holding.id;
  await pool.query(`update token_holdings set matures_at = now() - interval '1 minute' where id=$1`, [hid]);
  const { matureDue } = require('./src/lib/maturity');
  await matureDue();
  const lst = await pool.query(`select id from token_listings where holding_id=$1`, [hid]);

  // ---- tokenmarket admin ----
  r = await get('/api/v1/tokenmarket/admin/listings', M, 403);
  r = await get('/api/v1/tokenmarket/admin/listings', A);
  ok('admin listings sees ours', r.body.items.some(x => x.id === lst.rows[0].id), '');
  r = await post(`/api/v1/tokenmarket/admin/listings/${lst.rows[0].id}/decision`, A, { approve: true, reason: 'coverage stand' }, 200);
  r = await post('/api/v1/deposits/intents', M, { purpose: 'token_purchase', amount: '5.0000', network: 'TRC20' }, 201);
  const di2 = r.body.intent ? r.body.intent.id : r.body.id;
  r = await get('/api/v1/deposits/admin/queue', M, 403);
  r = await get('/api/v1/deposits/admin/queue', A);
  ok('deposits queue sees intents', r.body.items.length >= 2, `n=${r.body.items.length}`);
  r = await post(`/api/v1/deposits/admin/${di2}/decision`, A, { action: 'cancel', note: 'coverage' }, 200);
  r = await post(`/api/v1/deposits/${di2}/simulate-pay`, M, {}, 409); // cancelled -> bad_state

  // ---- withdrawals admin: fund extra -> request -> queue -> approve -> execute (sandbox) ----
  r = await post('/api/v1/deposits/intents', M, { purpose: 'token_purchase', amount: '100.0000', network: 'TRC20' }, 201);
  const di3 = r.body.intent ? r.body.intent.id : r.body.id;
  await post(`/api/v1/deposits/${di3}/simulate-pay`, M, {}, 200);
  r = await post('/api/v1/withdrawals/request', M, { amount: '20.0000', dest_address: 'T' + 'B'.repeat(33) }, [200, 201]);
  const wid = r.body.id || (r.body.request && r.body.request.id) || r.body.withdrawal_id;
  ok('withdrawal id returned', !!wid, `keys=${Object.keys(r.body).join(',')}`);
  r = await get('/api/v1/withdrawals/admin/queue', M, 403);
  r = await get('/api/v1/withdrawals/admin/queue', A);
  ok('withdrawal queue sees it', JSON.stringify(r.body).includes(String(wid).slice(0, 8)), '');
  r = await post(`/api/v1/withdrawals/admin/${wid}/decision`, A, { action: 'approve', note: 'coverage' }, 200);
  r = await post(`/api/v1/withdrawals/${wid}/execute`, A, {}, 200);
  ok('withdrawal executed sandbox', r.body.status === 'paid' || r.body.ok === true, JSON.stringify(r.body).slice(0, 120));

  // ---- openapi lists new modules ----
  r = await request(app).get('/api/v1/openapi.json');
  const paths = Object.keys(r.body.paths || {}).join(' ');
  ok('openapi has token+payments paths', /tokens/.test(paths) && /deposits/.test(paths) && /withdrawals/.test(paths), paths);

  console.log(`\nCOVERAGE DONE: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('COVERAGE-ERR', e); try { await pool.end(); } catch {} process.exit(1); });
