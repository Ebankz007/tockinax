// Payout eligibility — duplicate-payment prevention.
//
// A commission/reward calculation stays `payable` after its payout is requested
// or paid, so eligibility must net every outstanding/settled payout request.
// Rejected/failed/cancelled/reversed requests release their amount.
const fs = require('fs');
const path = require('path');
const { Decimal } = require('decimal.js');
const { eligibleBalance } = require('../src/lib/payoutEligibility');

const describeDB = process.env.DATABASE_URL ? describe : describe.skip;
const helperSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'payoutEligibility.js'), 'utf8');
const payoutsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.payouts.js'), 'utf8');
const financeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'v1.finance.js'), 'utf8');

describe('payout eligibility (offline)', () => {
  test('nets commission/reward requests in every non-released status', () => {
    expect(helperSrc).toMatch(/kind in \('commission','reward'\)/);
    expect(helperSrc).toContain("status in ('requested','under_review','approved','processing','paid')");
    // The request being reviewed must not count against itself.
    expect(helperSrc).toContain('id <> $3::uuid');
  });

  test('request path serializes concurrent submissions', () => {
    expect(payoutsSrc).toContain('pg_advisory_xact_lock');
    expect(payoutsSrc).toContain('eligibleBalance(req.user.id, b.currency, null, client)');
  });

  test('review path excludes the payout under review', () => {
    expect(financeSrc).toMatch(/eligibleBalance\(p\.user_id, p\.currency, p\.id\)/);
  });
});

describeDB('payout eligibility (live DB)', () => {
  let pool;
  let userId;
  let payoutId;
  let campaignId;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  beforeAll(async () => {
    const { getPool } = require('../src/lib/db');
    pool = getPool();

    const u = await pool.query(
      `insert into users (email, password_hash, referral_code, status)
       values ($1,'x',$2,'active') returning id`,
      [`payout-elig-${suffix}@example.test`, `PE${suffix}`.slice(0, 16)]
    );
    userId = u.rows[0].id;

    const p = await pool.query(
      `insert into payout_requests (user_id, amount, currency, kind, status, idempotency_key)
       values ($1,'10.0000','USD','commission','requested',$2) returning id`,
      [userId, `payout-elig-${suffix}`]
    );
    payoutId = p.rows[0].id;

    const c = await pool.query(
      `insert into reward_campaigns (name, status) values ($1,'completed') returning id`,
      [`payout-elig-${suffix}`]
    );
    campaignId = c.rows[0].id;

    await pool.query(
      `insert into reward_calculations (campaign_id, user_id, base_amount, amount, currency, status, idempotency_key)
       values ($1,$2,'10.0000','10.0000','USD','payable',$3)`,
      [campaignId, userId, `reward-elig-${suffix}`]
    );
  });

  afterAll(async () => {
    if (!pool || !userId) return;
    await pool.query(`delete from reward_calculations where user_id=$1`, [userId]).catch(() => {});
    await pool.query(`delete from payout_requests where user_id=$1`, [userId]).catch(() => {});
    await pool.query(`delete from reward_campaigns where id=$1`, [campaignId]).catch(() => {});
    await pool.query(`delete from users where id=$1`, [userId]).catch(() => {});
  });

  test('outstanding request is subtracted from payable rewards', async () => {
    const bal = await eligibleBalance(userId, 'USD');
    expect(bal.equals(new Decimal(0))).toBe(true);
  });

  test('excluding the request under review restores its amount', async () => {
    const bal = await eligibleBalance(userId, 'USD', payoutId);
    expect(bal.equals(new Decimal(10))).toBe(true);
  });

  test('rejected request releases the amount back to eligibility', async () => {
    await pool.query(`update payout_requests set status='rejected' where id=$1`, [payoutId]);
    const bal = await eligibleBalance(userId, 'USD');
    expect(bal.equals(new Decimal(10))).toBe(true);
  });
});
