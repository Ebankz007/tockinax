// Live-DB smoke: register→verify→login→list→order→evidence→dispute→ledger→payout guards.
// In-process via supertest + buildApp (no detached server needed).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const request = require('supertest');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');
const { buildApp } = require('./src/app');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildApp();
const S = (t) => console.log(t);
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; S(`PASS ${name} ${extra}`); }
  else { fail++; S(`FAIL ${name} ${extra}`); }
}

(async () => {
  const ts = Date.now();
  const buyerEmail = `buyer${ts}@test.com`;
  const sellerEmail = `seller${ts}@test.com`;
  const adminEmail = `admin${ts}@test.com`;
  const pw = 'SuperSecure123!';

  // 1. register buyer (fee disclosed)
  let r = await request(app).post('/api/v1/auth/register').send({ email: buyerEmail, password: pw, acceptTerms: true });
  ok('register buyer 201', r.status === 201, `-> ${r.status}`);
  ok('fee disclosed', r.body && r.body.fee, JSON.stringify(r.body.fee || {}).slice(0, 120));
  const buyerVerify = r.body.devVerifyToken;

  // 2. verify + login buyer
  r = await request(app).post('/api/v1/auth/verify-email').send({ email: buyerEmail, token: buyerVerify });
  ok('verify buyer', r.status === 200, `-> ${r.status}`);
  r = await request(app).post('/api/v1/auth/login').send({ email: buyerEmail, password: pw });
  ok('login buyer', r.status === 200 && r.body.access, `-> ${r.status}`);
  const buyerTok = r.body.access;

  // 3. create seller + admin directly (activate + roles)
  const mkUser = async (email, { seller = false, admin = false } = {}) => {
    const hash = await bcrypt.hash(pw, 12);
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    const u = await pool.query(
      `insert into users (email, password_hash, status, referral_code, email_verified_at) values ($1,$2,'active',$3,now()) returning id, referral_code`,
      [email, hash, code]);
    const id = u.rows[0].id;
    await pool.query(`insert into user_profiles (user_id, display_name) values ($1,$2)`, [id, email.split('@')[0]]);
    if (seller) await pool.query(`update users set seller_enabled=true where id=$1`, [id]);
    const roleName = admin ? 'super_admin' : (seller ? 'seller' : 'member');
    const rl = await pool.query(`select id from roles where name=$1`, [roleName]);
    if (rl.rows.length) await pool.query(`insert into user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [id, rl.rows[0].id]);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password: pw });
    return { id, token: login.body.access, code: u.rows[0].referral_code };
  };
  const seller = await mkUser(sellerEmail, { seller: true });
  const admin = await mkUser(adminEmail, { admin: true });
  ok('seller+admin logins', !!seller.token && !!admin.token, '');

  // 4. seller creates listing (pending_review)
  r = await request(app).post('/api/v1/marketplace/listings').set('Authorization', 'Bearer ' + seller.token)
    .send({ title: 'Smoke Test Bag', description: 'A genuine leather bag for live smoke testing purposes.', price: '100.0000', currency: 'USD', stock: 5 });
  ok('create listing 201', r.status === 201, `-> ${r.status} ${r.body.status || ''}`);
  const listingId = r.body.id;

  // 5. buyer cannot see it before approval; admin approves
  let l = await request(app).get('/api/v1/marketplace/listings').set('Authorization', 'Bearer ' + buyerTok);
  ok('listing hidden pre-approval', l.status === 200 && !(l.body.items || []).find(x => x.id === listingId), `items=${(l.body.items || []).length}`);
  r = await request(app).post(`/api/v1/admin/listings/${listingId}/decision`).set('Authorization', 'Bearer ' + admin.token).send({ decision: 'active', reason: 'smoke approve' });
  ok('admin approve listing', r.status === 200 && r.body.status === 'active', `-> ${r.status}`);

  // 6. buyer places order with tampered amount field (must be ignored, server-priced 100*2=200)
  r = await request(app).post('/api/v1/marketplace/orders').set('Authorization', 'Bearer ' + buyerTok)
    .send({ listingId, qty: 2, paymentMethod: 'bank_transfer', amount: '1.00' });
  ok('order server-priced (tamper ignored)', r.status === 201 && Number(r.body.amount) === 200, `-> ${r.status} amount=${r.body.amount}`);
  ok('order pending_payment + no escrow copy', r.body.status === 'pending_payment' && /does NOT hold/i.test(r.body.payment_instructions || ''), r.body.status);
  const orderId = r.body.id;

  // 7. evidence submit (stays pending, NOT completed)
  r = await request(app).post(`/api/v1/marketplace/orders/${orderId}/evidence`).set('Authorization', 'Bearer ' + buyerTok).send({ providerRef: 'SMOKE-REF-1', note: 'paid via bank' });
  ok('evidence recorded pending', r.status === 200, `-> ${r.status}`);
  let st = await pool.query(`select status from orders where id=$1`, [orderId]);
  ok('order NOT auto-completed', st.rows[0].status === 'evidence_submitted', st.rows[0].status);

  // 8. buyer opens dispute
  r = await request(app).post('/api/v1/disputes').set('Authorization', 'Bearer ' + buyerTok).send({ orderId, reason: 'Seller has not confirmed after 2 hours, testing dispute flow.' });
  ok('dispute opened', [200, 201].includes(r.status), `-> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  st = await pool.query(`select status from orders where id=$1`, [orderId]);
  ok('order disputed', st.rows[0].status === 'disputed', st.rows[0].status);

  // 9. support resolves dispute back to under_review path? Resolve as cancelled for smoke, then re-create clean order for completion
  const disp = await pool.query(`select id from disputes where order_id=$1 order by created_at desc limit 1`, [orderId]);
  if (disp.rows.length) {
    r = await request(app).post(`/api/v1/disputes/${disp.rows[0].id}/resolve`).set('Authorization', 'Bearer ' + admin.token).send({ outcome: 'cancelled', resolution: 'Smoke test cancel; seller unresponsive in test.' });
    ok('dispute resolved', r.status === 200, `-> ${r.status}`);
  }

  // 10. clean order for completion + fee ledger
  r = await request(app).post('/api/v1/marketplace/orders').set('Authorization', 'Bearer ' + buyerTok).send({ listingId, qty: 1, paymentMethod: 'bank_transfer' });
  const order2 = r.body.id;
  await request(app).post(`/api/v1/marketplace/orders/${order2}/evidence`).set('Authorization', 'Bearer ' + buyerTok).send({ providerRef: 'SMOKE-REF-2' });
  r = await request(app).post(`/api/v1/admin/orders/${order2}/confirm`).set('Authorization', 'Bearer ' + admin.token).send({ confirm: true });
  ok('admin confirm completed', r.status === 200, `-> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  const fee = await pool.query(`select sum(credit-debit)::text as rev from ledger_entries where account='REV:marketplace_fees'`);
  ok('fee revenue booked', Number(fee.rows[0].rev) > 0, `rev=${fee.rows[0].rev}`);
  const bal = await pool.query(`select sum(debit)::text d, sum(credit)::text c from ledger_entries le join ledger_transactions lt on lt.id=le.tx_id where lt.idempotency_key=$1`, [`fee:${order2}`]);
  ok('fee entry balanced', bal.rows[0].d === bal.rows[0].c, `d=${bal.rows[0].d} c=${bal.rows[0].c}`);

  // 11. commissions: inactive rules pay 0 (safeguard), then one-shot active rule v99 pays once + idempotent
  const { calculateForOrder } = require('./src/lib/commissions');
  let calc0 = await calculateForOrder(order2).catch(e => ({ error: e.message }));
  ok('inactive rules pay 0', Array.isArray(calc0) && calc0.length === 0, JSON.stringify(calc0).slice(0, 120));
  await pool.query(`insert into commission_rules (version, level, rate_bps, basis, confirmation_days, active, budget_cap) values (99,1,500,'eligible_verified_sales',0,true,100000) on conflict (version,level) do update set active=true`);
  // attribute buyer under an independent referrer (not the seller — engine skips seller-beneficiary to block wash)
  const refEmail = `ref${ts}@test.com`;
  const refHash = await bcrypt.hash(pw, 12);
  const refCode = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
  const refU = await pool.query(`insert into users (email, password_hash, status, referral_code, email_verified_at) values ($1,$2,'active',$3,now()) returning id`, [refEmail, refHash, refCode]);
  const refId = refU.rows[0].id;
  await pool.query(`insert into user_profiles (user_id, display_name) values ($1,$2)`, [refId, 'ref']);
  await pool.query(`insert into referrals (ancestor_id, descendant_id, depth) values ($1,(select id from users where lower(email)=$2),1) on conflict do nothing`, [refId, buyerEmail]);
  await pool.query(`insert into referral_closure (ancestor_id, descendant_id, depth) values ($1,(select id from users where lower(email)=$2),1) on conflict do nothing`, [refId, buyerEmail]);
  const calc1 = await calculateForOrder(order2);
  ok('active rule pays L1', calc1.length >= 1 && Number(calc1[0].amount) > 0, JSON.stringify(calc1).slice(0, 200));
  const calc2 = await calculateForOrder(order2);
  ok('commission idempotent', calc2.filter(x => !x.replayed).length === 0, `second run new=${calc2.filter(x => !x.replayed).length}`);
  await pool.query(`update commission_rules set active=false where version=99`);
  await pool.query(`delete from commission_calculations where rule_version=99`);
  await pool.query(`delete from ledger_transactions where idempotency_key like 'comm:%:v99:%'`);

  // 11b. file evidence round-trip (private upload, magic-byte verified, still PENDING)
  r = await request(app).post('/api/v1/marketplace/orders').set('Authorization', 'Bearer ' + buyerTok).send({ listingId, qty: 1, paymentMethod: 'bank_transfer' });
  const order3 = r.body.id;
  const pngBytes = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x01,0x02]);
  r = await request(app).post(`/api/v1/marketplace/orders/${order3}/evidence/file`).set('Authorization', 'Bearer ' + buyerTok)
    .set('Content-Type', 'image/png').set('X-Provider-Ref', 'SMOKE-FILE-1').send(pngBytes);
  ok('file evidence 201 + stored privately', r.status === 201 && r.body.evidenceId, `-> ${r.status}`);
  st = await pool.query(`select status from orders where id=$1`, [order3]);
  ok('file evidence still PENDING (not paid)', st.rows[0].status === 'evidence_submitted', st.rows[0].status);
  const txtAttempt = await request(app).post(`/api/v1/marketplace/orders/${order3}/evidence/file`).set('Authorization', 'Bearer ' + buyerTok)
    .set('Content-Type', 'text/plain').send(Buffer.from('fake receipt lol'));
  ok('text bytes denied 400', txtAttempt.status === 400, `-> ${txtAttempt.status}`);
  const meta = await request(app).get(`/api/v1/marketplace/orders/${order3}/evidence`).set('Authorization', 'Bearer ' + buyerTok);
  ok('evidence metadata lists file', meta.status === 200 && meta.body.items.some(x => x.has_file), `-> ${meta.status}`);
  const dl = await request(app).get(`/api/v1/marketplace/evidence/${r.body.evidenceId}/file`).set('Authorization', 'Bearer ' + buyerTok);
  ok('private download 200 png magic', dl.status === 200 && dl.body && dl.body[0] === 0x89 && dl.body[1] === 0x50, `-> ${dl.status}`);
  const stranger = await mkUser(`stranger${ts}@test.com`, {});
  const dlForbidden = await request(app).get(`/api/v1/marketplace/evidence/${r.body.evidenceId}/file`).set('Authorization', 'Bearer ' + stranger.token);
  ok('stranger download 403', dlForbidden.status === 403, `-> ${dlForbidden.status}`);

  // 12. rewards stay disabled; crypto stays locked
  r = await request(app).post('/api/v1/rewards/claim').set('Authorization', 'Bearer ' + buyerTok).send({});
  ok('rewards claim 409', r.status === 409, `-> ${r.status}`);
  r = await request(app).get('/api/v1/crypto/status');
  ok('crypto 403', r.status === 403, `-> ${r.status}`);

  // 13. payout guards: keys rejected, insufficient rejected
  r = await request(app).post('/api/v1/payouts/request').set('Authorization', 'Bearer ' + buyerTok)
    .send({ kind: 'commission', amount: '10.0000', currency: 'USD', destination: { privateKey: 'xxx' } });
  ok('private keys rejected 400', r.status === 400, `-> ${r.status}`);
  r = await request(app).post('/api/v1/payouts/request').set('Authorization', 'Bearer ' + buyerTok)
    .send({ kind: 'commission', amount: '999999.0000', currency: 'USD', destination: { bank: 'test' } });
  ok('insufficient eligible 422', r.status === 422, `-> ${r.status} eligible=${r.body.eligible}`);

  // 14. content public + admin overview RBAC
  r = await request(app).get('/api/v1/content/pages/terms');
  ok('public terms page', r.status === 200, `-> ${r.status}`);
  r = await request(app).get('/api/v1/admin/overview').set('Authorization', 'Bearer ' + buyerTok);
  ok('member blocked from admin 403', r.status === 403, `-> ${r.status}`);
  r = await request(app).get('/api/v1/admin/overview').set('Authorization', 'Bearer ' + admin.token);
  ok('admin overview 200', r.status === 200 && r.body.members, `-> ${r.status}`);

  S(`\nSMOKE DONE: ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('SMOKE-ERR', e); try { await pool.end(); } catch {} process.exit(1); });
