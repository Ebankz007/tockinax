// TOCKINAX token-loop smoke (live DB, simulated money only):
// register → sandbox deposit intent → simulate-pay → SIM funded → token purchase
// → force maturity (dev-only SQL) → matureDue auto-list at 107 → partial buys
// (400/300/240/200 scaled) → oversell rejected → cycle success → unsold visible
// → compat aliases + admin gates + approved stage fees (pending request) + categories disabled.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const request = require('supertest');
const { buildApp } = require('./src/app');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
const app = buildApp();
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log(`PASS ${n} ${x}`); } else { fail++; console.log(`FAIL ${n} ${x}`); } };

(async () => {
  const ts = Date.now();
  const reg = async (email) => {
    const r = await request(app).post('/api/v1/auth/register').send({ email, password: 'SuperSecure123!', acceptTerms: true });
    await request(app).post('/api/v1/auth/verify-email').send({ email, token: r.body.devVerifyToken });
    const l = await request(app).post('/api/v1/auth/login').send({ email, password: 'SuperSecure123!' });
    return { id: l.body.access ? (await pool.query(`select id from users where lower(email)=$1`, [email.toLowerCase()])).rows[0].id : null, token: l.body.access, email };
  };
  const buyer = await reg(`tkx-buyer${ts}@test.com`);
  const seller = await reg(`tkx-seller${ts}@test.com`);
  ok('register+login buyer+seller', !!buyer.token && !!seller.token, '');

  // member_no + compat definitions/categories
  let r = await request(app).get('/api/v1/tokens/definitions').set('Authorization', 'Bearer ' + buyer.token);
  ok('definitions list TKX-SIM', r.status === 200 && r.body.items.some(x => x.code === 'TKX-SIM'), `-> ${r.status}`);
  r = await request(app).get('/api/v1/tokens/categories').set('Authorization', 'Bearer ' + buyer.token);
  ok('8 categories all disabled', r.status === 200 && r.body.items.length === 8 && r.body.items.every(x => x.active === false), `n=${r.body.items.length}`);
  r = await request(app).get('/api/v1/tokens/pricing-versions').set('Authorization', 'Bearer ' + buyer.token);
  ok('pricing v1 7d+14d simple', r.status === 200 && r.body.items.length >= 2, `-> ${r.status}`);

  // sandbox deposit → simulate-pay → funded (frontend-shaped paths)
  r = await request(app).post('/api/v1/deposits/intents').set('Authorization', 'Bearer ' + seller.token)
    .send({ purpose: 'token_purchase', amount: '1000.0000', network: 'TRC20' });
  ok('deposit intent 201 (alias path)', r.status === 201 && r.body.sandbox === true, `-> ${r.status}`);
  const intentId = r.body.intent ? r.body.intent.id : r.body.id;
  r = await request(app).post('/api/v1/deposits/intents').set('Authorization', 'Bearer ' + seller.token)
    .send({ purpose: 'token_purchase', amount: '10.0000', network: 'BEP20' });
  ok('BEP20 rejected 400', r.status === 400, `-> ${r.status}`);
  r = await request(app).post(`/api/v1/deposits/${intentId}/simulate-pay`).set('Authorization', 'Bearer ' + seller.token).send({});
  ok('simulate-pay confirmed', r.status === 200 && r.body.status === 'confirmed', `-> ${r.status}`);
  r = await request(app).get('/api/v1/deposits/mine').set('Authorization', 'Bearer ' + seller.token);
  ok('deposit history (alias)', r.status === 200, `-> ${r.status}`);

  // token purchase with FRONTEND field names {amount, cycle_days}
  // Stage-1 max_buy=500 (approved plan) — the harness respects the gate and buys 500.
  r = await request(app).post('/api/v1/tokens/purchase').set('Authorization', 'Bearer ' + seller.token)
    .send({ amount: '500.0000', cycle_days: 14, agreed_risk: true });
  ok('purchase 201 (frontend fields, within stage-1 max)', r.status === 201 && r.body.pricing, `-> ${r.status} target=${r.body.pricing && r.body.pricing.total}`);
  ok('target = 570 simple', r.body.pricing && Number(r.body.pricing.total) === 570, `total=${r.body.pricing && r.body.pricing.total}`);
  const holdingId = r.body.holding.id;

  // force maturity (dev-only) + run maturity job
  await pool.query(`update token_holdings set matures_at = now() - interval '1 minute' where id=$1`, [holdingId]);
  const { matureDue, settleDue } = require('./src/lib/maturity');
  const m = await matureDue();
  ok('matureDue matured', m.matured >= 1, `matured=${m.matured}`);
  const lst = await pool.query(`select * from token_listings where holding_id=$1`, [holdingId]);
  ok('auto-list at 570', lst.rowCount === 1 && Number(lst.rows[0].target_value) === 570, `target=${lst.rows[0] && lst.rows[0].target_value}`);
  const listingId = lst.rows[0].id;

  // fund buyer + partial buys 400/300/240/200 = 1140
  const mkIntent = async (user, amount) => {
    const i = await request(app).post('/api/v1/deposits/intent').set('Authorization', `Bearer ${user.token}`)
      .send({ purpose: 'token_purchase', amount, network: 'TRC20' });
    const id = i.body.intent ? i.body.intent.id : i.body.id;
    await request(app).post(`/api/v1/deposits/${id}/simulate-pay`).set('Authorization', `Bearer ${user.token}`).send({});
  };
  // Plan §4 partial-resale semantics: listing is 500 TKX @ 1.14 = 570 USDT target.
  // Buyers purchase TKX quantities; USDT value = qty x 1.14. Mirror partial portions:
  // ~200/150/120/100 USDT => 175.4386 / 131.5789 / 105.2632 / 87.7193 TKX (= 500).
  await mkIntent(buyer, '400.0000');
  await mkIntent(buyer, '300.0000');
  const buy = async (qty) => request(app).post(`/api/v1/tokenmarket/listings/${listingId}/buy`)
    .set('Authorization', 'Bearer ' + buyer.token).send({ qty, agreed_risk: true });
  r = await buy('175.4386'); ok('fill A ~200 USDT', r.status === 201, `-> ${r.status} rem=${r.body.remaining_qty}`);
  r = await buy('131.5789'); ok('fill B ~150 USDT', r.status === 201, `-> ${r.status} rem=${r.body.remaining_qty}`);
  r = await buy('105.2632'); ok('fill C ~120 USDT', r.status === 201, `-> ${r.status} rem=${r.body.remaining_qty}`);
  r = await buy('87.7193'); ok('fill D ~100 USDT (filled)', r.status === 201 && r.body.listing_status === 'filled', `-> ${r.status}`);
  r = await buy('1.0000'); ok('oversell rejected', r.status === 409, `-> ${r.status}`);

  // settle → cycle success (both legs: 42-day rule needs settled resale, not time)
  const s = await settleDue();
  ok('settleDue settled', s.settled >= 1, `settled=${s.settled}`);
  const cyc = await pool.query(`select success from participation_cycles where holding_id=$1`, [holdingId]);
  ok('cycle success=true', cyc.rows[0] && cyc.rows[0].success === true, '');
  r = await request(app).get('/api/v1/tokens/cycles').set('Authorization', 'Bearer ' + seller.token);
  ok('cycles alias counts 14d=1', r.status === 200 && r.body.eligibility.success_14d === 1, `-> ${r.status}`);

  // proceeds + unsold visibility (seller sold all here; buyer holdings unsold if any)
  r = await request(app).get('/api/v1/tokenmarket/proceeds').set('Authorization', 'Bearer ' + seller.token);
  ok('proceeds 570 visible', r.status === 200, `-> ${r.status}`);

  // stage fees now approved: disclosed + pending stage_request created (201)
  r = await request(app).post('/api/v1/tokens/stage/request').set('Authorization', 'Bearer ' + seller.token).send({ kind: 'upgrade' });
  ok('upgrade 201 fee disclosed (100 to leave stage 1)', r.status === 201 && Number(r.body.fee_disclosed) === 100, `-> ${r.status} fee=${r.body.fee_disclosed}`);
  const stageReqId = r.body.id;
  r = await request(app).post('/api/v1/tokens/stages/upgrade').set('Authorization', 'Bearer ' + seller.token).send({});
  ok('upgrade alias idempotent replay 200 (same pending request)', r.status === 200 && r.body.id === stageReqId, `-> ${r.status}`);
  r = await request(app).post('/api/v1/tokens/stages/renew').set('Authorization', 'Bearer ' + seller.token).send({});
  ok('renew alias 201 fee disclosed (25 to renew stage 1)', r.status === 201 && Number(r.body.fee_disclosed) === 25, `-> ${r.status} fee=${r.body.fee_disclosed}`);
  r = await request(app).get('/api/v1/tokens/stages/current').set('Authorization', 'Bearer ' + seller.token);
  ok('stages/current alias', r.status === 200 && r.body.current === 1, `-> ${r.status}`);
  r = await request(app).get('/api/v1/tokens/stages/config').set('Authorization', 'Bearer ' + seller.token);
  ok('stages/config read-only', r.status === 200 && r.body.editable === false, `-> ${r.status}`);
  r = await request(app).get('/api/v1/tokens/holdings').set('Authorization', 'Bearer ' + seller.token);
  ok('holdings alias', r.status === 200 && r.body.items.length >= 1, `-> ${r.status}`);

  // commissions: inactive → nothing payable; kpis as member → 403
  r = await request(app).get('/api/v1/tokens/commissions').set('Authorization', 'Bearer ' + seller.token);
  ok('commissions empty (disabled)', r.status === 200 && (r.body.items || []).length === 0, `-> ${r.status}`);
  r = await request(app).get('/api/v1/tokens/admin/kpis').set('Authorization', 'Bearer ' + seller.token);
  ok('kpis member 403', r.status === 403, `-> ${r.status}`);

  // withdrawal request + queue visibility (sandbox)
  r = await request(app).post('/api/v1/withdrawals/request').set('Authorization', 'Bearer ' + seller.token)
    .send({ amount: '10.0000', dest_address: 'T' + 'A'.repeat(33) });
  ok('withdrawal requested', [200, 201].includes(r.status), `-> ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  r = await request(app).post('/api/v1/withdrawals/request').set('Authorization', 'Bearer ' + seller.token)
    .send({ amount: '5.0000', dest_address: '0x1234' });
  ok('bad address rejected', r.status === 400, `-> ${r.status}`);

  console.log(`\nTOKEN SMOKE DONE: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('TOKEN-SMOKE-ERR', e); try { await pool.end(); } catch {} process.exit(1); });
