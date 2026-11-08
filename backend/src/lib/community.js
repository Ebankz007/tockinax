// Community engagement & weekly rewards — shared domain helpers.
//
// Everything money-related is delegated to the existing double-entry ledger.
// No reward amount is hardcoded: values come from weekly_bonus_configurations,
// which an admin edits. Week windows are computed in the configured timezone and
// every competition is keyed by (kind, week_key), so a new week starts a fresh
// competition while previous weeks keep their participants, leaderboard and awards.
'use strict';

const crypto = require('crypto');
const { Decimal } = require('./ledger');
const { postBalanced } = require('./ledger');
const { getPool } = require('./db');
const { sendMail } = require('./mailer');

const DEFAULT_SETTINGS = {
  view_dedup_hours: 24,
  view_trust_proxy: false,
  suspicion_threshold: 60,
  max_video_mb: 50,
  max_image_mb: 8,
  max_video_seconds: 120,
  testimonial_min_views: 10,
  referral_min_qualified: 1,
  leaderboard_public: true,
};

const KINDS = ['testimonial', 'referral'];

function httpError(status, code, message) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  return e;
}

// ---------- settings ----------

async function getCommunitySettings(q) {
  const db = q || getPool();
  try {
    const r = await db.query(`select value from system_settings where key = 'community_rewards'`);
    return { ...DEFAULT_SETTINGS, ...(r.rows[0]?.value || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function isFeatureEnabled(key, q) {
  const db = q || getPool();
  try {
    const r = await db.query(`select enabled from feature_flags where key = $1`, [key]);
    return r.rowCount ? r.rows[0].enabled === true : true;
  } catch {
    return true;
  }
}

// ---------- timezone-aware week window ----------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function tzParts(date, timeZone) {
  let tz = timeZone || 'UTC';
  let p;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    p = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  } catch {
    // Minimal ICU build: fall back to UTC components.
    const d = new Date(date.getTime());
    p = {
      year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1).padStart(2, '0'),
      day: String(d.getUTCDate()).padStart(2, '0'),
      hour: String(d.getUTCHours()).padStart(2, '0'),
      minute: String(d.getUTCMinutes()).padStart(2, '0'),
      second: String(d.getUTCSeconds()).padStart(2, '0'),
    };
  }
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

function tzOffsetMs(date, timeZone) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

// Convert a wall-clock time in `timeZone` to a UTC Date. Two passes handle DST
// transitions well enough for weekly windows (a one-hour wobble is acceptable;
// the window is stored as absolute timestamptz once created).
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let offset = tzOffsetMs(new Date(guess), timeZone);
  let ts = guess - offset;
  offset = tzOffsetMs(new Date(ts), timeZone);
  ts = guess - offset;
  return new Date(ts);
}

function parseHm(value, fallback) {
  const s = String(value || fallback || '00:00');
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return [0, 0];
  return [Math.min(23, Number(m[1])), Math.min(59, Number(m[2]))];
}

function computeWeekWindow(config, now = new Date()) {
  const tz = config?.timezone || 'UTC';
  const startDow = Number.isInteger(config?.start_dow) ? config.start_dow : 1;
  const endDow = Number.isInteger(config?.end_dow) ? config.end_dow : 0;
  const [sh, sm] = parseHm(config?.start_time, '00:00');
  const [eh, em] = parseHm(config?.end_time, '23:59');

  const p = tzParts(now, tz);
  const localDow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const back = (localDow - startDow + 7) % 7;

  let startBase = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  let startsAt = zonedTimeToUtc(
    startBase.getUTCFullYear(), startBase.getUTCMonth() + 1, startBase.getUTCDate(), sh, sm, tz
  );
  if (startsAt.getTime() > now.getTime()) {
    startBase = new Date(Date.UTC(startBase.getUTCFullYear(), startBase.getUTCMonth(), startBase.getUTCDate() - 7));
    startsAt = zonedTimeToUtc(
      startBase.getUTCFullYear(), startBase.getUTCMonth() + 1, startBase.getUTCDate(), sh, sm, tz
    );
  }

  const sp = tzParts(startsAt, tz);
  let fwd = (endDow - startDow + 7) % 7;
  if (fwd === 0) fwd = 7; // a weekly competition closes on the next occurrence
  const endBase = new Date(Date.UTC(sp.year, sp.month - 1, sp.day + fwd));
  let endsAt = zonedTimeToUtc(
    endBase.getUTCFullYear(), endBase.getUTCMonth() + 1, endBase.getUTCDate(), eh, em, tz
  );
  if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(endsAt.getTime() + 7 * 86400000);

  return {
    startsAt,
    endsAt,
    timezone: tz,
    weekKey: `${sp.year}-${pad2(sp.month)}-${pad2(sp.day)}`,
  };
}

// ---------- competitions ----------

async function activeConfig(q, kind) {
  if (!KINDS.includes(kind)) throw httpError(400, 'invalid_kind');
  const r = await q.query(
    `select * from weekly_bonus_configurations
      where kind = $1 and active = true
      order by effective_from desc limit 1`,
    [kind]
  );
  return r.rows[0] || null;
}

async function ensureCompetition(kind, { now = new Date(), q } = {}) {
  const db = q || getPool();
  const config = await activeConfig(db, kind);
  if (!config) return null;
  const win = computeWeekWindow(config, now);

  let comp;
  const ins = await db.query(
    `insert into weekly_competitions (kind, week_key, starts_at, ends_at, timezone, status, config)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (kind, week_key) do nothing returning *`,
    [kind, win.weekKey, win.startsAt, win.endsAt, win.timezone, statusFor(now, win), win]
  );
  if (ins.rowCount) comp = ins.rows[0];
  else {
    const ex = await db.query(
      `select * from weekly_competitions where kind = $1 and week_key = $2`,
      [kind, win.weekKey]
    );
    comp = ex.rows[0];
  }

  // Keep the status in step with the clock, but never reopen a terminal state.
  const desired = statusFor(now, win);
  if (['scheduled', 'open', 'closing'].includes(comp.status) && comp.status !== desired) {
    const upd = await db.query(
      `update weekly_competitions set status = $2 where id = $1 and status in ('scheduled','open','closing') returning *`,
      [comp.id, desired]
    );
    if (upd.rowCount) comp = upd.rows[0];
  }
  return { competition: comp, config, window: win };
}

function statusFor(now, win) {
  if (now.getTime() < win.startsAt.getTime()) return 'scheduled';
  if (now.getTime() <= win.endsAt.getTime()) return 'open';
  return 'closing';
}

async function testimonialRanking(q, comp, config) {
  const eligibility = config?.eligibility || {};
  const minMetric = Math.max(0, Number(config?.min_metric || 0));
  const r = await q.query(
    `select t.id as testimonial_id, t.user_id, t.display_name, t.title,
            count(v.id)::int as metric_value
       from testimonials t
       join users u on u.id = t.user_id
       left join testimonial_views v
         on v.testimonial_id = t.id and v.eligible = true
        and v.created_at >= $1 and v.created_at < $2
      where t.status = 'approved' and t.deleted_at is null
        and t.consent = true and t.policy_accepted = true
        and u.status = 'active'
        and ($3::boolean = false or u.email_verified_at is not null)
      group by t.id, t.user_id, t.display_name, t.title
      having count(v.id) > 0 and count(v.id) >= $4
      order by metric_value desc, t.published_at asc nulls last, t.id asc
      limit 200`,
    [comp.starts_at, comp.ends_at, !!eligibility.require_verified_email, minMetric]
  );
  return r.rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    qualified: true,
    qualificationReason: `${row.metric_value} eligible views in period`,
  }));
}

async function referralRanking(q, comp, config) {
  const eligibility = config?.eligibility || {};
  const minMetric = Math.max(0, Number(config?.min_metric || 0));
  const requirePayment = !!(eligibility.require_qualified_registration || eligibility.require_registration_payment);
  const minActivity = Math.max(0, Number(eligibility.min_activity || 0));
  const r = await q.query(
    `select u.id as user_id, u.member_no, u.referral_code,
            count(distinct r.descendant_id)::int as metric_value
       from referrals r
       join users u on u.id = r.ancestor_id
       join users d on d.id = r.descendant_id
      where r.depth = 1
        and r.created_at >= $1 and r.created_at < $2
        and u.status = 'active'
        and d.status = 'active'
        and r.ancestor_id <> r.descendant_id
        and ($3::boolean = false or d.email_verified_at is not null)
        and ($4::boolean = false or exists (
              select 1 from service_payments sp
               where sp.user_id = d.id and sp.fee_key = 'registration' and sp.status = 'confirmed'))
        and ($5::int = 0 or (
              select count(*) from orders o
               where o.buyer_id = d.id and o.status = 'completed') >= $5)
        and not exists (
              select 1 from fraud_risk_events f
               where f.user_id = d.id
                 and f.kind in ('referral_abuse','self_referral','fraud_confirmed'))
      group by u.id, u.member_no, u.referral_code
      having count(distinct r.descendant_id) > 0 and count(distinct r.descendant_id) >= $6
      order by metric_value desc, u.created_at asc, u.id asc
      limit 200`,
    [comp.starts_at, comp.ends_at, !!eligibility.require_verified_email, requirePayment, minActivity, minMetric]
  );
  return r.rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    qualified: true,
    qualificationReason: `${row.metric_value} qualified referrals in period`,
  }));
}

async function computeRanking(q, comp, config) {
  return comp.kind === 'referral'
    ? referralRanking(q, comp, config)
    : testimonialRanking(q, comp, config);
}

// Write a live snapshot. Top 5 qualified rows become the leaderboard; every
// participant row is retained so an admin can investigate the wider field.
// When `q` is provided (called from the scheduler within an existing txn),
// use that client directly without starting a nested transaction. When called
// standalone, acquire a pool client and manage BEGIN/COMMIT internally.
async function snapshotCompetition(comp, config, { q, now = new Date() } = {}) {
  const db = q || getPool();
  const rows = await computeRanking(db, comp, config);
  const top = rows.slice(0, 5);
  const client = q || await db.connect();
  const ownsClient = !q;
  try {
    if (ownsClient) await client.query('BEGIN');
    await client.query(`delete from competition_participants where competition_id = $1`, [comp.id]);
    for (const row of rows) {
      await client.query(
        `insert into competition_participants
           (competition_id, user_id, testimonial_id, metric_value, qualified, qualification_reason, rank, snapshot_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [comp.id, row.user_id, row.testimonial_id || null, row.metric_value, row.qualified,
          row.qualificationReason, row.rank, now]
      );
    }
    await client.query(`delete from competition_leaderboards where competition_id = $1`, [comp.id]);
    for (const row of top) {
      await client.query(
        `insert into competition_leaderboards
           (competition_id, rank, user_id, testimonial_id, metric_value, qualified, snapshot)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [comp.id, row.rank, row.user_id, row.testimonial_id || null, row.metric_value, row.qualified,
          { reason: row.qualificationReason, captured_at: now.toISOString() }]
      );
    }
    if (ownsClient) await client.query('COMMIT');
  } catch (e) {
    if (ownsClient) { try { await client.query('ROLLBACK'); } catch {} }
    throw e;
  } finally {
    if (ownsClient) client.release();
  }
  return { rows, top };
}

// End-of-week provisional winners. Idempotent: awards are unique per
// (competition, position) and the competition is only moved to `verifying`.
// When `q` is provided (called from the scheduler within an existing txn),
// use that client directly without starting a nested transaction. When called
// standalone, acquire a pool client and manage BEGIN/COMMIT internally.
async function finalizeCompetition(competitionId, { actorId = null, q, now = new Date() } = {}) {
  const db = q || getPool();
  const cr = await db.query(`select * from weekly_competitions where id = $1`, [competitionId]);
  if (!cr.rowCount) throw httpError(404, 'competition_not_found');
  let comp = cr.rows[0];
  if (comp.status === 'finalized') return { competition: comp, awards: [], replayed: true };
  if (comp.status === 'cancelled') throw httpError(409, 'competition_cancelled');

  const config = await activeConfig(db, comp.kind);
  if (!config) throw httpError(409, 'bonus_config_missing');
  const rows = await computeRanking(db, comp, config);
  const top = rows.slice(0, 5);
  const rewards = config.position_rewards || {};

  const client = q || await db.connect();
  const ownsClient = !q;
  let awards = [];
  try {
    if (ownsClient) await client.query('BEGIN');
    const lock = await client.query(`select * from weekly_competitions where id = $1 for update`, [competitionId]);
    comp = lock.rows[0];
    if (comp.status === 'finalized') {
      if (ownsClient) await client.query('COMMIT');
      return { competition: comp, awards: [], replayed: true };
    }

    for (const row of top) {
      const amount = new Decimal(rewards[String(row.rank)] ?? '0').toFixed(4);
      const ins = await client.query(
        `insert into weekly_bonus_awards
           (competition_id, kind, position, user_id, testimonial_id, metric_value, amount, currency, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'provisional')
         on conflict (competition_id, position) do nothing returning *`,
        [comp.id, comp.kind, row.rank, row.user_id, row.testimonial_id || null, row.metric_value, amount, config.currency]
      );
      if (ins.rowCount) awards.push(ins.rows[0]);
      await client.query(
        `insert into competition_leaderboards
           (competition_id, rank, user_id, testimonial_id, metric_value, qualified, award_id, snapshot)
         values ($1,$2,$3,$4,$5,true,$6,$7)
         on conflict (competition_id, rank) do update set award_id = excluded.award_id`,
        [comp.id, row.rank, row.user_id, row.testimonial_id || null, row.metric_value,
          ins.rows[0]?.id || null, { reason: row.qualificationReason, provisional: true }]
      );
    }
    const upd = await client.query(
      `update weekly_competitions set status = 'verifying', finalized_at = coalesce(finalized_at, $2) where id = $1 returning *`,
      [comp.id, now]
    );
    comp = upd.rows[0];
    if (ownsClient) await client.query('COMMIT');
  } catch (e) {
    if (ownsClient) { try { await client.query('ROLLBACK'); } catch {} }
    throw e;
  } finally {
    if (ownsClient) client.release();
  }

  await auditCompetition(db, comp.id, actorId, 'competition.finalize', {
    kind: comp.kind, week_key: comp.week_key, awards: awards.length,
  });
  if (!awards.length) {
    const ex = await db.query(`select * from weekly_bonus_awards where competition_id = $1 order by position`, [comp.id]);
    awards = ex.rows;
  }
  return { competition: comp, awards };
}

// Public/member view of a leaderboard. Refreshes a live snapshot while the
// competition is running and finalizes provisional winners once the window ends.
async function getLeaderboard(kind, { q, now = new Date(), refresh = true } = {}) {
  const db = q || getPool();
  const ensured = await ensureCompetition(kind, { now, q: db });
  if (!ensured) return null;
  let { competition, config } = ensured;

  if (refresh) {
    if (competition.status === 'closing') {
      const fin = await finalizeCompetition(competition.id, { q: db, now });
      competition = fin.competition;
    } else if (competition.status === 'open') {
      await snapshotCompetition(competition, config, { q: db, now });
    }
  }

  const lb = await db.query(
    `select l.rank, l.user_id, l.testimonial_id, l.metric_value, l.qualified, l.award_id,
            u.member_no, u.referral_code,
            t.display_name, t.title, t.country,
            a.amount, a.currency, a.status as award_status
       from competition_leaderboards l
       left join users u on u.id = l.user_id
       left join testimonials t on t.id = l.testimonial_id
       left join weekly_bonus_awards a on a.id = l.award_id
      where l.competition_id = $1 order by l.rank asc limit 5`,
    [competition.id]
  );
  return { competition, config, leaderboard: lb.rows };
}

// ---------- view tracking ----------

function viewerHash(req, userId, salt) {
  const raw = userId ? `u:${userId}` : `a:${req.ip || ''}|${req.headers['user-agent'] || ''}`;
  return crypto.createHmac('sha256', salt).update(raw).digest('hex');
}

function hashHeader(value, salt) {
  return crypto.createHmac('sha256', salt).update(String(value || '')).digest('hex');
}

function looksAutomated(ua) {
  const s = String(ua || '').toLowerCase();
  if (!s) return true;
  return /(bot|crawler|spider|headless|phantom|selenium|puppeteer|playwright|curl|wget|python-requests|go-http|java\/|scrapy|httpclient)/.test(s);
}

// Server-side view recording. The browser can call this endpoint, but it cannot
// submit a view count: the server derives identity, dedup bucket and suspicion.
async function recordTestimonialView(testimonialId, req, { q, userId = null, now = new Date() } = {}) {
  const db = q || getPool();
  const settings = await getCommunitySettings(db);
  const tr = await db.query(
    `select id, user_id, status, deleted_at from testimonials where id = $1`, [testimonialId]
  );
  if (!tr.rowCount) throw httpError(404, 'testimonial_not_found');
  const t = tr.rows[0];
  if (t.deleted_at || t.status !== 'approved') throw httpError(404, 'testimonial_not_found');

  const salt = process.env.VIEW_HASH_SALT || process.env.JWT_SECRET || 'tockinax-view';
  const dedupHours = Math.max(1, Number(settings.view_dedup_hours || 24));
  const bucketMs = dedupHours * 3600 * 1000;
  const bucket = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || req.socket?.remoteAddress || '';
  const viewer = viewerHash(req, userId, salt);
  const ipHash = hashHeader(ip, salt);
  const uaHash = hashHeader(ua, salt);

  let score = 0;
  const reasons = [];
  if (looksAutomated(ua)) { score += 60; reasons.push('automated_ua'); }
  if (!ip) { score += 20; reasons.push('missing_ip'); }
  // Same IP flooding the same testimonial in the last hour.
  const flood = await db.query(
    `select count(*)::int as n from testimonial_views
      where testimonial_id = $1 and ip_hash = $2 and created_at > now() - interval '1 hour'`,
    [t.id, ipHash]
  ).catch(() => ({ rows: [{ n: 0 }] }));
  if ((flood.rows[0]?.n || 0) >= 30) { score += 40; reasons.push('ip_flood'); }
  const threshold = Math.max(1, Number(settings.suspicion_threshold || 60));
  const eligible = score < threshold;

  const ins = await db.query(
    `insert into testimonial_views
       (testimonial_id, user_id, viewer_hash, ip_hash, ua_hash, bucket, eligible, suspicion_score, reason, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (testimonial_id, viewer_hash, bucket) do nothing returning id`,
    [t.id, userId, viewer, ipHash, uaHash, bucket, eligible, score, reasons.join(',') || null, now]
  );
  const counted = ins.rowCount > 0;

  // Spike detection: a burst across distinct viewers flags the testimonial for
  // review; it never silently deletes views.
  if (counted) {
    const spike = await db.query(
      `select count(*)::int as n from testimonial_views
        where testimonial_id = $1 and created_at > now() - interval '10 minutes'`,
      [t.id]
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((spike.rows[0]?.n || 0) >= 100) {
      await db.query(
        `update testimonials set suspicious = true,
           suspicious_reason = coalesce(suspicious_reason, 'view_spike'), updated_at = now()
         where id = $1`, [t.id]
      ).catch(() => {});
      await db.query(
        `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
         values (null,'community.view_spike','testimonial',$1,$2,$3)`,
        [t.id, { views_10m: spike.rows[0].n }, req.ip]
      ).catch(() => {});
    }
  }

  const total = await db.query(
    `select count(*)::int as n from testimonial_views where testimonial_id = $1 and eligible = true`, [t.id]
  );
  return { counted, duplicate: !counted, eligible, views: total.rows[0].n, suspicion: score };
}

// ---------- awards & payments ----------

async function auditCompetition(q, competitionId, actorId, action, detail) {
  await q.query(
    `insert into competition_audit_logs (competition_id, actor_id, action, detail)
     values ($1,$2,$3,$4)`,
    [competitionId, actorId || null, action, detail || {}]
  ).catch(() => {});
}

async function approveAward(awardId, actorId, { q } = {}) {
  const db = q || getPool();
  const r = await db.query(
    `update weekly_bonus_awards
        set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
      where id = $1 and status = 'provisional'
      returning *`,
    [awardId, actorId]
  );
  if (!r.rowCount) {
    const ex = await db.query(`select * from weekly_bonus_awards where id = $1`, [awardId]);
    if (!ex.rowCount) throw httpError(404, 'award_not_found');
    if (ex.rows[0].status === 'approved' || ex.rows[0].status === 'paid') return { award: ex.rows[0], replayed: true };
    throw httpError(409, 'award_not_provisional');
  }
  await auditCompetition(db, r.rows[0].competition_id, actorId, 'award.approve', {
    award_id: awardId, position: r.rows[0].position, amount: r.rows[0].amount,
  });
  return { award: r.rows[0], replayed: false };
}

async function disqualifyAward(awardId, actorId, reason, { q } = {}) {
  const db = q || getPool();
  if (!reason || String(reason).trim().length < 3) throw httpError(400, 'reason_required');
  const r = await db.query(
    `update weekly_bonus_awards
        set status = 'disqualified', disqualify_reason = $3, payment_status = 'void', updated_at = now()
      where id = $1 and status in ('provisional','approved')
      returning *`,
    [awardId, actorId, String(reason).trim()]
  );
  if (!r.rowCount) {
    const ex = await db.query(`select * from weekly_bonus_awards where id = $1`, [awardId]);
    if (!ex.rowCount) throw httpError(404, 'award_not_found');
    if (ex.rows[0].payment_status === 'paid') throw httpError(409, 'already_paid');
    throw httpError(409, 'award_not_disqualifiable');
  }
  await auditCompetition(db, r.rows[0].competition_id, actorId, 'award.disqualify', {
    award_id: awardId, reason: String(reason).trim(),
  });
  return r.rows[0];
}

// Post the bonus through the existing ledger. Idempotency is enforced twice:
// weekly_bonus_transactions.award_id is UNIQUE and the ledger idempotency key is
// `community_bonus:<award id>`. A retry returns the original transaction.
async function payAward(awardId, actorId, { q, ip } = {}) {
  const db = q || getPool();
  if (!(await isFeatureEnabled('community_bonus_payouts', db))) {
    throw httpError(403, 'bonus_payouts_disabled',
      'Weekly bonus payouts are disabled until the pool is funded and an admin enables community_bonus_payouts.');
  }
  const ar = await db.query(
    `select a.*, c.week_key from weekly_bonus_awards a
       join weekly_competitions c on c.id = a.competition_id where a.id = $1`,
    [awardId]
  );
  if (!ar.rowCount) throw httpError(404, 'award_not_found');
  const award = ar.rows[0];
  if (award.payment_status === 'paid') {
    const ex = await db.query(`select * from weekly_bonus_transactions where award_id = $1`, [awardId]);
    return { replayed: true, award, transaction: ex.rows[0] || null };
  }
  if (award.status !== 'approved') throw httpError(409, 'award_not_approved');
  const amount = new Decimal(award.amount || 0);
  if (amount.lte(0)) throw httpError(422, 'zero_amount', 'Configured reward for this position is zero.');

  const reference = `WB-${String(award.kind).toUpperCase()}-${award.competition_id.slice(0, 8)}-P${award.position}`;
  const ins = await db.query(
    `insert into weekly_bonus_transactions
       (award_id, reference, amount, currency, status, posted_by)
     values ($1,$2,$3,$4,'pending',$5)
     on conflict (award_id) do nothing returning *`,
    [award.id, reference, amount.toFixed(4), award.currency, actorId]
  );
  let txRow = ins.rows[0];
  if (!txRow) {
    txRow = (await db.query(`select * from weekly_bonus_transactions where award_id = $1`, [award.id])).rows[0];
  }
  if (txRow && txRow.status === 'posted') {
    await db.query(
      `update weekly_bonus_awards set status = 'paid', payment_status = 'paid', updated_at = now() where id = $1`,
      [award.id]
    );
    return { replayed: true, award: { ...award, status: 'paid', payment_status: 'paid' }, transaction: txRow };
  }

  const posted = await postBalanced({
    sourceType: 'community_bonus',
    sourceId: award.id,
    currency: award.currency,
    memo: `Weekly ${award.kind} bonus — ${award.week_key} position ${award.position}`,
    idempotencyKey: `community_bonus:${award.id}`,
    lines: [
      { account: 'EXP:community_bonuses', debit: amount.toFixed(4) },
      { account: 'LIAB:sim_usdt', credit: amount.toFixed(4) },
    ],
  });

  await db.query(
    `update weekly_bonus_transactions
        set ledger_tx_id = $2, status = 'posted', posted_at = now()
      where award_id = $1`,
    [award.id, posted.txId]
  );
  await db.query(
    `update weekly_bonus_awards set status = 'paid', payment_status = 'paid', updated_at = now() where id = $1`,
    [award.id]
  );
  await auditCompetition(db, award.competition_id, actorId, 'award.pay', {
    award_id: award.id, reference, amount: amount.toFixed(4), ledger_tx_id: posted.txId, replayed: posted.replayed,
  });

  await notifyAwardPaid(db, award.id, amount.toFixed(4), award.currency);
  return {
    replayed: posted.replayed,
    award: { ...award, status: 'paid', payment_status: 'paid' },
    transaction: { ...txRow, ledger_tx_id: posted.txId, status: 'posted' },
  };
}

// ---------- notifications ----------

async function pushNotification(q, userId, { title, body, category, link, meta, channel = 'inapp' }) {
  if (!userId) return;
  await q.query(
    `insert into notifications (user_id, channel, title, body, category, link, meta)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, channel, title, body || '', category || null, link || null, meta || {}]
  );
}

async function notifyAwardPaid(q, awardId, amount, currency) {
  const r = await q.query(
    `select a.id, a.user_id, a.position, a.kind, a.competition_id, c.week_key, u.email
       from weekly_bonus_awards a
       join weekly_competitions c on c.id = a.competition_id
       join users u on u.id = a.user_id
      where a.id = $1`,
    [awardId]
  );
  if (!r.rowCount) return;
  const a = r.rows[0];
  const title = 'Weekly bonus paid';
  const body = `Your ${a.kind} competition bonus of ${amount} ${currency} (week ${a.week_key}, position ${a.position}) has been credited to your balance.`;
  await pushNotification(q, a.user_id, {
    title, body, category: 'community_bonus',
    link: '/dashboard/community?tab=bonuses',
    meta: { award_id: a.id, competition_id: a.competition_id, amount, currency },
  });

  // Email is optional and only when SMTP is configured; the in-app notice is
  // always written first so a mail failure never loses the record.
  const cfg = await activeConfig(q, a.kind).catch(() => null);
  if (cfg?.notification_settings?.email && a.email) {
    await sendMail({
      to: a.email,
      subject: 'TOCKINAX weekly bonus credited',
      text: body,
    }).catch(() => {});
  }
}

async function publishAnnouncement(q, { category, title, body, audience = 'all', competitionId = null, meta = {}, actorId = null }) {
  if (!category || !title) throw httpError(400, 'category_and_title_required');
  const ins = await q.query(
    `insert into notification_feed
       (category, title, body, audience, competition_id, meta, published, published_at, published_by)
     values ($1,$2,$3,$4,$5,$6,true,now(),$7) returning *`,
    [category, title, body || '', audience, competitionId, meta, actorId]
  );
  const feed = ins.rows[0];

  let ids;
  if (audience === 'winners') {
    const r = await q.query(
      `select distinct user_id from weekly_bonus_awards
        where competition_id = $1 and status in ('approved','paid')`, [competitionId]
    );
    ids = r.rows.map((x) => x.user_id);
  } else if (audience === 'admins') {
    const r = await q.query(
      `select distinct ur.user_id from user_roles ur join roles rl on rl.id = ur.role_id
        where rl.name in ('super_admin','finance')`
    );
    ids = r.rows.map((x) => x.user_id);
  } else {
    const r = await q.query(`select id from users where status = 'active' limit 5000`);
    ids = r.rows.map((x) => x.id);
  }

  for (const uid of ids) {
    await pushNotification(q, uid, {
      title, body, category,
      link: meta.link || '/dashboard/community',
      meta: { announcement_id: feed.id, ...meta },
    });
  }
  return { ...feed, delivered: ids.length };
}

module.exports = {
  DEFAULT_SETTINGS,
  KINDS,
  httpError,
  getCommunitySettings,
  isFeatureEnabled,
  computeWeekWindow,
  zonedTimeToUtc,
  tzParts,
  activeConfig,
  ensureCompetition,
  computeRanking,
  snapshotCompetition,
  finalizeCompetition,
  getLeaderboard,
  recordTestimonialView,
  viewerHash,
  looksAutomated,
  approveAward,
  disqualifyAward,
  payAward,
  pushNotification,
  notifyAwardPaid,
  publishAnnouncement,
  auditCompetition,
};
