// Community engagement & weekly rewards — unit + DB-guarded integration tests.
//
// Pure helpers run offline. Anything touching the database is gated behind
// DATABASE_URL and skipped in CI-like environments without a live Postgres.
// The admin router requires super_admin / community.manage auth, so award
// lifecycle flows are exercised through `src/lib/community` directly rather
// than through supertest (mocking session cookies for supertest is brittle
// and adds no value beyond the existing coverage of authRequired).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const request = require('supertest');
const { computeWeekWindow, tzParts } = require('../src/lib/community');
const { sniffKind, mediaUpload } = require('../src/middleware/upload');
const { buildApp } = require('../src/app');

const describeDB = process.env.DATABASE_URL ? describe : describe.skip;

// ---------- offline: week windows & timezones ----------

describe('community week windows (offline)', () => {
  test('computeWeekWindow returns same-week window starting Monday 00:00 UTC', () => {
    const cfg = { timezone: 'UTC', start_dow: 1, start_time: '00:00', end_dow: 0, end_time: '23:59' };
    const now = new Date(Date.UTC(2026, 10, 9, 12, 0, 0)); // Monday 2026-11-09 UTC
    const win = computeWeekWindow(cfg, now);
    expect(win.timezone).toBe('UTC');
    expect(win.weekKey).toMatch(/^2026-11-09$/);
    expect(new Date(win.startsAt).getTime()).toBe(Date.UTC(2026, 10, 9, 0, 0, 0));
    expect(new Date(win.endsAt).getTime()).toBeGreaterThan(now.getTime());
  });

  test('computeWeekWindow respects start_dow/time and closes next occurrence', () => {
    const cfg = { timezone: 'UTC', start_dow: 1, start_time: '00:00', end_dow: 1, end_time: '23:59' };
    const now = new Date(Date.UTC(2026, 10, 12, 12, 0, 0)); // Thursday after Monday start
    const win = computeWeekWindow(cfg, now);
    expect(win.startsAt.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(new Date(win.endsAt).getTime()).toBeGreaterThan(now.getTime());
  });

  test('tzParts converts local wall clock to components', () => {
    const p = tzParts(new Date(Date.UTC(2026, 10, 9, 12, 30, 0)), 'America/Lagos');
    expect(p.year).toBe(2026);
    expect(typeof p.hour).toBe('number');
  });

  test('computeWeekWindow defaults to UTC 00:00–23:59 when times omitted', () => {
    const now = new Date(Date.UTC(2026, 10, 10, 10, 0, 0));
    const win = computeWeekWindow({}, now);
    expect(win.timezone).toBe('UTC');
  });
});

// ---------- offline: magic-byte sniffing & media guard ----------

describe('community media upload guards (offline)', () => {
  test('sniffKind detects webp and mp4/mov', () => {
    expect(sniffKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffKind(Buffer.from('RIFF\x00\x00\x00\x00WEBP'))).toBe('image/webp');
    expect(sniffKind(Buffer.from('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00'))).toBe('video/mp4');
    expect(sniffKind(Buffer.from('\x00\x00\x00\x20ftypqt '))).toBe('video/quicktime');
    expect(sniffKind(Buffer.from('not a file'))).toBe('unknown');
  });

  test('mediaUpload allows image/video within config, denies oversized', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    const mkRes = () => {
      const r = { statusCode: 200, body: null };
      r.status = (c) => { r.statusCode = c; return r; };
      r.json = (b) => { r.body = b; return r; };
      return r;
    };

    // valid webp image -> calls next
    let nexted = false;
    mediaUpload({ required: true, kind: 'image', maxBytes: 8 * 1024 * 1024 })(
      { body: webp, headers: { 'content-type': 'image/webp' } },
      mkRes(),
      () => { nexted = true; }
    );
    expect(nexted).toBe(true);

    // oversized image -> responds 413, does not call next
    const bigWebp = Buffer.alloc(9 * 1024 * 1024);
    nexted = false;
    const res = mkRes();
    mediaUpload({ required: true, kind: 'image', maxBytes: 8 * 1024 * 1024 })(
      { body: bigWebp, headers: { 'content-type': 'image/webp' } },
      res,
      () => { nexted = true; }
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toBe('file_too_large');

    // tiny mp4 -> calls next, no duration error (ftyp detected, no mvhd)
    const mp4 = Buffer.from('\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00');
    nexted = false;
    mediaUpload({ required: true, kind: 'video', maxBytes: 50 * 1024 * 1024, maxVideoSeconds: 120 })(
      { body: mp4, headers: { 'content-type': 'video/mp4' } },
      mkRes(),
      () => { nexted = true; }
    );
    expect(nexted).toBe(true);
  });
});

// ---------- DB-guarded integration ----------

describeDB('community engagement (live DB)', () => {
  const { getPool } = require('../src/lib/db');
  const community = require('../src/lib/community');
  let pool;
  let memberId;
  const tag = Math.random().toString(36).slice(2, 8);

  async function makeTestimonial(userId, title, displayName) {
    const ins = await pool.query(
      `insert into testimonials (user_id,title,body,display_name,country,media_type,status,consent,policy_accepted,published_at)
       values ($1,$2,'Honest review',$3,'NG','written','approved',true,true,now()) returning id`,
      [userId, title, displayName]
    );
    return ins.rows[0].id;
  }

  beforeAll(async () => {
    pool = getPool();
    const r = await pool.query(
      `insert into users (email, password_hash, status, referral_code, email_verified_at)
       values ($1,'x','active',$2,now()) returning id`,
      [`community-db-${tag}@example.test`, `T${tag.toUpperCase()}`]
    );
    memberId = r.rows[0].id;
    await pool.query(
      `update weekly_bonus_configurations set position_rewards=$1, min_metric=1, pool_amount=200 where kind='testimonial'`,
      [JSON.stringify({ 1: '10', 2: '5', 3: '3', 4: '2', 5: '1' })]
    );
  });

  afterAll(async () => {
    await pool.query(`delete from weekly_bonus_transactions where award_id in (select id from weekly_bonus_awards where user_id=$1)`, [memberId]);
    await pool.query(`delete from ledger_entries where tx_id in (select id from ledger_transactions where idempotency_key like $1)`, [`community_bonus:%`]);
    await pool.query(`delete from ledger_transactions where idempotency_key like $1`, [`community_bonus:%`]);
    await pool.query(`delete from weekly_bonus_awards where user_id=$1`, [memberId]);
    await pool.query(`delete from competition_leaderboards where competition_id in (select id from weekly_competitions where kind='testimonial')`);
    await pool.query(`delete from competition_participants where competition_id in (select id from weekly_competitions where kind='testimonial')`);
    await pool.query(`delete from competition_audit_logs where competition_id in (select id from weekly_competitions where kind='testimonial')`);
    await pool.query(`delete from weekly_competitions where kind='testimonial'`);
    await pool.query(`delete from testimonial_views where testimonial_id in (select id from testimonials where user_id=$1)`, [memberId]);
    await pool.query(`delete from testimonial_media where testimonial_id in (select id from testimonials where user_id=$1)`, [memberId]);
    await pool.query(`delete from testimonials where user_id=$1`, [memberId]);
    await pool.query(`delete from users where id=$1`, [memberId]);
    await pool.end();
  });

  test('public testimonials endpoint and media list work', async () => {
    const app = buildApp();
    const tid = await makeTestimonial(memberId, 'Great', 'Tester');
    const pub = await request(app).get(`/api/v1/community/testimonials/${tid}`);
    expect(pub.status).toBe(200);
    expect(pub.body.displayName).toBe('Tester');
    expect(pub.body.media).toEqual([]);
    expect(pub.body.views).toBe(0);

    const list = await request(app).get('/api/v1/community/testimonials?media=written&country=NG&featured=true');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.items)).toBe(true);

    const view = await request(app)
      .post(`/api/v1/community/testimonials/${tid}/view`)
      .set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    expect(view.status).toBe(200);
    expect(view.body.counted).toBe(true);
    expect(view.body.eligible).toBe(true);

    const dup = await request(app)
      .post(`/api/v1/community/testimonials/${tid}/view`)
      .set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
    expect(dup.status).toBe(200);
    expect(dup.body.counted).toBe(false);
    expect(dup.body.duplicate).toBe(true);

    const bot = await request(app)
      .post(`/api/v1/community/testimonials/${tid}/view`)
      .set('user-agent', 'python-requests/2.31.0');
    expect(bot.status).toBe(200);
    expect(bot.body.suspicion).toBeGreaterThanOrEqual(60);

    const stats = await pool.query(
      `select count(*)::int as n, count(*) filter (where eligible)::int as eligible from testimonial_views where testimonial_id=$1`,
      [tid]
    );
    expect(stats.rows[0].n).toBe(2);
    expect(stats.rows[0].eligible).toBe(1); // first only; bot flagged ineligible
  });

  test('weekly leaderboard ranks top 5 by eligible views', async () => {
    const app = buildApp();
    // Full isolation: clear community media tables so only tid1/tid2 rank.
    await pool.query(`delete from testimonial_views`);
    await pool.query(`delete from testimonial_media`);
    await pool.query(`delete from testimonials`);
    const tid1 = await makeTestimonial(memberId, 'T1', 'Alpha');
    const m2 = (await pool.query(
      `insert into users (email,password_hash,status,referral_code,email_verified_at) values ($1,'x','active',$2,now()) returning id`,
      [`community-db2-${tag}@example.test`, `M2${tag.toUpperCase()}`])).rows[0].id;
    const tid2 = await makeTestimonial(m2, 'T2', 'Beta');

    const cfg = (await pool.query(`select * from weekly_bonus_configurations where kind='testimonial' and active`)).rows[0];
    const win = computeWeekWindow(cfg, new Date());
    await pool.query(`update weekly_competitions set starts_at=$1, ends_at=$2 where kind='testimonial'`, [win.startsAt, win.endsAt]);

    for (let i = 0; i < 7; i += 1)
      await pool.query(`insert into testimonial_views (testimonial_id,viewer_hash,bucket,eligible,created_at) values ($1,$2,$3,true,$4)`,
        [tid1, `vh1-${i}`, win.startsAt, new Date(win.startsAt.getTime() + i * 10000)]);
    for (let i = 0; i < 3; i += 1)
      await pool.query(`insert into testimonial_views (testimonial_id,viewer_hash,bucket,eligible,created_at) values ($1,$2,$3,true,$4)`,
        [tid2, `vh2-${i}`, win.startsAt, new Date(win.startsAt.getTime() + i * 10000)]);

    const board = await request(app).get(`/api/v1/community/leaderboards?kind=testimonial`);
    expect(board.status).toBe(200);
    const t = board.body.testimonial;
    expect(t.leaderboard.length).toBe(2);
    expect(t.leaderboard[0].metric).toBe(7);
    expect(t.leaderboard[0].member).toBe('Alpha');
    expect(t.leaderboard[1].metric).toBe(3);

    await pool.query(`delete from testimonial_views where testimonial_id in ($1,$2)`, [tid1, tid2]);
    await pool.query(`delete from testimonials where id in ($1,$2)`, [tid1, tid2]);
    await pool.query(`delete from users where id=$1`, [m2]);
  });

  test('finalize + award approve + pay is idempotent and credits ledger', async () => {
    const { finalizeCompetition, approveAward, payAward } = community;
    const tid = await makeTestimonial(memberId, 'PayTest', 'Gamma');
    const cfg = (await pool.query(`select * from weekly_bonus_configurations where kind='testimonial' and active`)).rows[0];
    const win = computeWeekWindow(cfg, new Date());
    await pool.query(`update weekly_competitions set starts_at=$1, ends_at=$2 where kind='testimonial'`, [win.startsAt, win.endsAt]);
    await pool.query(`insert into testimonial_views (testimonial_id,viewer_hash,bucket,eligible,created_at) values ($1,$2,$3,true,$4)`,
      [tid, `payv`, win.startsAt, new Date()]);

    const comp = (await pool.query(`select * from weekly_competitions where kind='testimonial'`)).rows[0];
    const fin = await finalizeCompetition(comp.id, { actorId: memberId });
    expect(fin.awards.length).toBeGreaterThan(0);
    const award = fin.awards[0];
    const approved = await approveAward(award.id, memberId);
    expect(approved.award.status).toBe('approved');

    await pool.query(`update feature_flags set enabled=true where key='community_bonus_payouts'`);
    const paid = await payAward(award.id, memberId);
    expect(paid.transaction.reference).toMatch(/^WB-/);

    const bal = await pool.query(
      `select coalesce(sum(e.credit-e.debit),0)::text as bal from ledger_entries e
       join ledger_transactions t on t.id=e.tx_id
       where e.account='LIAB:sim_usdt' and t.source_type='community_bonus'`, []
    );
    expect(Number(bal.rows[0].bal)).toBeGreaterThan(0);

    const paidAgain = await payAward(award.id, memberId);
    expect(paidAgain.replayed).toBe(true);
    const txCount = await pool.query(`select count(*)::int as n from weekly_bonus_transactions where award_id=$1`, [award.id]);
    expect(txCount.rows[0].n).toBe(1);

    await pool.query(`update feature_flags set enabled=false where key='community_bonus_payouts'`);
    await pool.query(`delete from weekly_bonus_transactions where award_id=$1`, [award.id]);
    await pool.query(`delete from ledger_entries where tx_id in (select id from ledger_transactions where idempotency_key like $1)`, [`community_bonus:%`]);
    await pool.query(`delete from ledger_transactions where idempotency_key like $1`, [`community_bonus:%`]);
    await pool.query(`delete from weekly_bonus_awards where id=$1`, [award.id]);
    await pool.query(`delete from competition_leaderboards where competition_id=$1`, [comp.id]);
    await pool.query(`delete from competition_participants where competition_id=$1`, [comp.id]);
    await pool.query(`delete from competition_audit_logs where competition_id=$1`, [comp.id]);
    await pool.query(`delete from weekly_competitions where id=$1`, [comp.id]);
    await pool.query(`delete from testimonial_views where testimonial_id=$1`, [tid]);
    await pool.query(`delete from testimonials where id=$1`, [tid]);
  });
});
