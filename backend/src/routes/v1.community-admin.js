// Community & Rewards management — admin API.
// Mounted at /api/v1/admin/community BEFORE the generic /api/v1/admin router,
// which otherwise applies its own super_admin gate to everything below it.
'use strict';

const express = require('express');
const fs = require('fs');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired, requirePerm } = require('../middleware/auth');
const { signedUrl } = require('../lib/storage');
const community = require('../lib/community');

const router = express.Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TESTIMONIAL_STATUSES = ['pending', 'approved', 'rejected', 'needs_correction', 'unpublished'];

function parseUuid(value) {
  if (!UUID.test(String(value || ''))) throw community.httpError(400, 'invalid_id');
  return String(value);
}

async function communityAdmin(req, res, next) {
  try {
    const r = await getPool().query(
      `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
        where ur.user_id = $1 and rl.name = 'super_admin'`, [req.user.id]
    );
    if (r.rowCount) return next();
  } catch { /* fall through to permission check */ }
  return requirePerm('community.manage')(req, res, next);
}

router.use(authRequired, communityAdmin);

async function audit(req, action, targetType, targetId, diff) {
  await getPool().query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
     values ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, action, targetType, targetId, diff || {}, req.ip]
  ).catch(() => {});
}

function streamScreenshot(res, key) {
  const filePath = signedUrl(key);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return res.status(404).json({ error: 'media_not_found' });
    res.setHeader('Content-Type', key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return fs.createReadStream(filePath).pipe(res);
  } catch {
    return res.status(404).json({ error: 'media_not_found' });
  }
}

// ---------- overview ----------

router.get('/overview', async (_req, res, next) => {
  try {
    const q = getPool();
    const t = await q.query(`select status, count(*)::int as n from testimonials where deleted_at is null group by status`);
    const s = await q.query(`select status, count(*)::int as n from social_media_submissions group by status`);
    const c = await q.query(`select kind, status, count(*)::int as n from weekly_competitions group by kind, status`);
    const a = await q.query(`select status, payment_status, count(*)::int as n, coalesce(sum(amount),0)::text as total from weekly_bonus_awards group by status, payment_status`);
    const by = (rows) => rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + r.n; return acc; }, {});
    res.json({
      testimonials: by(t.rows),
      socialSubmissions: by(s.rows),
      competitions: c.rows,
      awards: a.rows,
    });
  } catch (e) { next(e); }
});

// ---------- testimonials ----------

router.get('/testimonials', async (req, res, next) => {
  try {
    const q = getPool();
    const status = TESTIMONIAL_STATUSES.includes(req.query.status) ? req.query.status : null;
    const suspicious = String(req.query.suspicious || '') === 'true';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = ['t.deleted_at is null'];
    const params = [];
    if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
    if (suspicious) where.push('t.suspicious = true');
    params.push(limit, offset);
    const r = await q.query(
      `select t.*, u.email, u.member_no,
              (select count(*) from testimonial_views v where v.testimonial_id = t.id and v.eligible = true)::int as views
         from testimonials t join users u on u.id = t.user_id
        where ${where.join(' and ')}
        order by t.created_at desc limit $${params.length - 1} offset $${params.length}`,
      params
    );
    const count = await q.query(
      `select count(*)::int as n from testimonials t where ${where.join(' and ')}`,
      params.slice(0, params.length - 2)
    );
    const media = await q.query(
      `select id, testimonial_id, kind, mime, bytes, duration_seconds
         from testimonial_media where testimonial_id = any($1::uuid[]) order by sort_order`,
      [r.rows.map((x) => x.id)]
    );
    const byT = new Map();
    for (const m of media.rows) {
      if (!byT.has(m.testimonial_id)) byT.set(m.testimonial_id, []);
      byT.get(m.testimonial_id).push(m);
    }
    res.json({
      items: r.rows.map((row) => ({ ...row, media: byT.get(row.id) || [] })),
      total: count.rows[0].n, limit, offset,
    });
  } catch (e) { next(e); }
});

router.get('/testimonials/:id/views', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = await q.query(
      `select id, user_id, viewer_hash, ip_hash, ua_hash, bucket, eligible,
              suspicion_score, reason, created_at
         from testimonial_views where testimonial_id = $1
        order by created_at desc limit $2`,
      [id, limit]
    );
    const stats = await q.query(
      `select date_trunc('day', created_at) as day,
              count(*)::int as total,
              count(*) filter (where eligible)::int as eligible,
              count(*) filter (where not eligible)::int as ineligible
         from testimonial_views where testimonial_id = $1
        group by 1 order by 1 desc limit 30`,
      [id]
    );
    res.json({ views: rows.rows, daily: stats.rows });
  } catch (e) { next(e); }
});

const reviewBody = z.object({
  action: z.enum(['approve', 'reject', 'needs_correction', 'feature', 'unfeature', 'unpublish', 'suspect', 'unsuspect']),
  remarks: z.string().trim().max(2000).optional().default(''),
  reason: z.string().trim().max(500).optional().default(''),
});

router.post('/testimonials/:id/review', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const b = reviewBody.parse(req.body);
    const q = getPool();
    const cur = await q.query(`select * from testimonials where id = $1 and deleted_at is null`, [id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });

    let set = `admin_remarks = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()`;
    const params = [id, b.remarks || null, req.user.id];
    if (b.action === 'approve') {
      if (!cur.rows[0].consent || !cur.rows[0].policy_accepted) {
        return res.status(409).json({ error: 'consent_missing' });
      }
      set += `, status = 'approved', published_at = coalesce(published_at, now())`;
    } else if (b.action === 'reject') set += `, status = 'rejected'`;
    else if (b.action === 'needs_correction') set += `, status = 'needs_correction'`;
    else if (b.action === 'feature') set += `, featured = true`;
    else if (b.action === 'unfeature') set += `, featured = false`;
    else if (b.action === 'unpublish') set += `, status = 'unpublished'`;
    else if (b.action === 'suspect') set += `, suspicious = true, suspicious_reason = $4`;
    else if (b.action === 'unsuspect') set += `, suspicious = false, suspicious_reason = null`;
    if (b.action === 'suspect') params.push(b.reason || 'admin_flag');

    const r = await q.query(`update testimonials set ${set} where id = $1 returning *`, params);
    await audit(req, `community.testimonial.${b.action}`, 'testimonial', id, {
      remarks: b.remarks || null, reason: b.reason || null,
    });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/testimonials/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const r = await getPool().query(
      `update testimonials set deleted_at = now(), status = 'unpublished', updated_at = now()
        where id = $1 and deleted_at is null returning id`, [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    await audit(req, 'community.testimonial.delete', 'testimonial', id, {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- social accounts ----------

router.get('/social-accounts', async (_req, res, next) => {
  try {
    const r = await getPool().query(`select * from social_media_accounts order by sort_order asc, platform asc`);
    res.json(r.rows);
  } catch (e) { next(e); }
});

const socialAccountBody = z.object({
  platform: z.string().trim().min(2).max(32),
  label: z.string().trim().max(80).optional().default(''),
  url: z.string().trim().url().max(500),
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).max(1000).optional().default(0),
});

router.put('/social-accounts', async (req, res, next) => {
  try {
    const b = socialAccountBody.parse(req.body);
    const r = await getPool().query(
      `insert into social_media_accounts (platform, label, url, enabled, sort_order, updated_by, updated_at)
       values ($1,$2,$3,$4,$5,$6,now())
       on conflict (platform) do update
         set label = excluded.label, url = excluded.url, enabled = excluded.enabled,
             sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now()
       returning *`,
      [b.platform.toLowerCase(), b.label, b.url, b.enabled, b.sortOrder, req.user.id]
    );
    await audit(req, 'community.social_account.update', 'social_media_account', r.rows[0].id, { platform: b.platform, url: b.url });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ---------- social submissions ----------

router.get('/social-submissions', async (req, res, next) => {
  try {
    const q = getPool();
    const status = ['pending', 'verified', 'rejected', 'needs_info'].includes(req.query.status) ? req.query.status : null;
    const where = [];
    const params = [];
    if (status) { params.push(status); where.push(`s.status = $${params.length}`); }
    params.push(Math.min(200, Math.max(1, Number(req.query.limit) || 100)));
    const r = await q.query(
      `select s.*, u.email, u.member_no
         from social_media_submissions s join users u on u.id = s.user_id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by s.submitted_at desc limit $${params.length}`,
      params
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/social-submissions/:id/screenshot', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const r = await getPool().query(`select screenshot_key from social_media_submissions where id = $1`, [id]);
    if (!r.rowCount || !r.rows[0].screenshot_key) return res.status(404).json({ error: 'media_not_found' });
    return streamScreenshot(res, r.rows[0].screenshot_key);
  } catch (e) { next(e); }
});

const verifyBody = z.object({
  status: z.enum(['verified', 'rejected', 'needs_info']),
  remarks: z.string().trim().max(2000).optional().default(''),
  method: z.enum(['admin', 'platform_api']).optional().default('admin'),
  detail: z.record(z.any()).optional().default({}),
});

router.post('/social-submissions/:id/verify', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const b = verifyBody.parse(req.body);
    const q = getPool();
    const cur = await q.query(`select * from social_media_submissions where id = $1`, [id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'submission_not_found' });

    const r = await q.query(
      `update social_media_submissions
          set status = $2, admin_remarks = $3, verification_method = $4,
              reviewed_by = $5, reviewed_at = now()
        where id = $1 returning *`,
      [id, b.status, b.remarks || null, b.method, req.user.id]
    );
    await q.query(
      `insert into social_media_verifications (submission_id, method, status, detail, verified_by)
       values ($1,$2,$3,$4,$5)`,
      [id, b.method, b.status, { ...b.detail, remarks: b.remarks || null }, req.user.id]
    );
    await audit(req, 'community.social_submission.verify', 'social_media_submission', id, {
      status: b.status, method: b.method,
    });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ---------- competitions ----------

router.get('/competitions', async (req, res, next) => {
  try {
    const kind = community.KINDS.includes(req.query.kind) ? req.query.kind : null;
    const params = [];
    let where = '';
    if (kind) { params.push(kind); where = `where c.kind = $1`; }
    const r = await getPool().query(
      `select c.*,
              (select count(*) from competition_participants p where p.competition_id = c.id)::int as participants,
              (select count(*) from weekly_bonus_awards a where a.competition_id = c.id)::int as awards
         from weekly_competitions c ${where}
        order by c.starts_at desc limit 50`,
      params
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/competitions/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const c = await q.query(`select * from weekly_competitions where id = $1`, [id]);
    if (!c.rowCount) return res.status(404).json({ error: 'competition_not_found' });
    const p = await q.query(
      `select p.*, u.member_no, u.referral_code, t.display_name, t.title
         from competition_participants p
         left join users u on u.id = p.user_id
         left join testimonials t on t.id = p.testimonial_id
        where p.competition_id = $1 order by p.rank asc nulls last limit 200`, [id]
    );
    const a = await q.query(
      `select a.*, u.member_no, u.email from weekly_bonus_awards a
         join users u on u.id = a.user_id where a.competition_id = $1 order by a.position`, [id]
    );
    res.json({ competition: c.rows[0], participants: p.rows, awards: a.rows });
  } catch (e) { next(e); }
});

router.post('/competitions/:id/snapshot', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const c = await q.query(`select * from weekly_competitions where id = $1`, [id]);
    if (!c.rowCount) return res.status(404).json({ error: 'competition_not_found' });
    const config = await community.activeConfig(q, c.rows[0].kind);
    if (!config) return res.status(409).json({ error: 'bonus_config_missing' });
    const snap = await community.snapshotCompetition(c.rows[0], config, { q });
    await audit(req, 'community.competition.snapshot', 'weekly_competition', id, { participants: snap.rows.length });
    res.json({ participants: snap.rows.length, top: snap.top.length });
  } catch (e) { next(e); }
});

router.post('/competitions/:id/finalize', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const out = await community.finalizeCompetition(id, { actorId: req.user.id });
    await audit(req, 'community.competition.finalize', 'weekly_competition', id, {
      awards: out.awards.length, replayed: !!out.replayed,
    });
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/competitions/:id/cancel', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ error: 'reason_required' });
    const r = await getPool().query(
      `update weekly_competitions set status = 'cancelled'
        where id = $1 and status in ('scheduled','open','closing','verifying') returning *`,
      [id]
    );
    if (!r.rowCount) return res.status(409).json({ error: 'not_cancellable' });
    await community.auditCompetition(getPool(), id, req.user.id, 'competition.cancel', { reason });
    await audit(req, 'community.competition.cancel', 'weekly_competition', id, { reason });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// ---------- bonus configuration ----------

router.get('/bonus-config', async (_req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from weekly_bonus_configurations where active = true order by kind`
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

const bonusConfigBody = z.object({
  poolAmount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().trim().min(2).max(8).optional(),
  positionRewards: z.record(z.union([z.string(), z.number()])).optional(),
  minMetric: z.number().int().min(0).optional(),
  approvalRequired: z.boolean().optional(),
  notificationSettings: z.record(z.any()).optional(),
  timezone: z.string().trim().max(48).optional(),
  startDow: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endDow: z.number().int().min(0).max(6).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  eligibility: z.record(z.any()).optional(),
});

router.put('/bonus-config/:kind', async (req, res, next) => {
  try {
    const kind = req.params.kind;
    if (!community.KINDS.includes(kind)) return res.status(400).json({ error: 'invalid_kind' });
    const b = bonusConfigBody.parse(req.body);
    const q = getPool();
    const cur = await community.activeConfig(q, kind);
    if (!cur) return res.status(404).json({ error: 'bonus_config_missing' });

    const rewards = b.positionRewards || cur.position_rewards || {};
    for (let i = 1; i <= 5; i += 1) {
      const v = rewards[String(i)] ?? '0';
      if (Number.isNaN(Number(v)) || Number(v) < 0) return res.status(400).json({ error: 'invalid_position_reward', position: i });
    }
    const pool = b.poolAmount !== undefined ? String(b.poolAmount) : String(cur.pool_amount);
    if (Number.isNaN(Number(pool)) || Number(pool) < 0) return res.status(400).json({ error: 'invalid_pool_amount' });

    const client = await q.connect();
    let row;
    try {
      await client.query('BEGIN');
      await client.query(`update weekly_bonus_configurations set active = false where kind = $1 and active = true`, [kind]);
      const ins = await client.query(
        `insert into weekly_bonus_configurations
           (kind, active, pool_amount, currency, position_rewards, min_metric, approval_required,
            notification_settings, timezone, start_dow, start_time, end_dow, end_time, eligibility, updated_by)
         values ($1,true,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
        [kind, pool, b.currency || cur.currency, rewards,
          b.minMetric !== undefined ? b.minMetric : cur.min_metric,
          b.approvalRequired !== undefined ? b.approvalRequired : cur.approval_required,
          b.notificationSettings || cur.notification_settings,
          b.timezone || cur.timezone,
          b.startDow !== undefined ? b.startDow : cur.start_dow,
          b.startTime || cur.start_time,
          b.endDow !== undefined ? b.endDow : cur.end_dow,
          b.endTime || cur.end_time,
          b.eligibility || cur.eligibility,
          req.user.id]
      );
      row = ins.rows[0];
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally { client.release(); }
    await audit(req, 'community.bonus_config.update', 'weekly_bonus_configuration', row.id, {
      kind, pool_amount: row.pool_amount, position_rewards: row.position_rewards,
    });
    res.json(row);
  } catch (e) { next(e); }
});

// ---------- awards & payments ----------

router.get('/awards', async (req, res, next) => {
  try {
    const q = getPool();
    const params = [];
    const where = [];
    if (community.KINDS.includes(req.query.kind)) { params.push(req.query.kind); where.push(`a.kind = $${params.length}`); }
    if (['provisional', 'approved', 'disqualified', 'paid', 'cancelled'].includes(req.query.status)) {
      params.push(req.query.status); where.push(`a.status = $${params.length}`);
    }
    if (UUID.test(String(req.query.competition || ''))) {
      params.push(req.query.competition); where.push(`a.competition_id = $${params.length}`);
    }
    const r = await q.query(
      `select a.*, c.week_key, u.member_no, u.email,
              t.reference, t.ledger_tx_id, t.posted_at
         from weekly_bonus_awards a
         join weekly_competitions c on c.id = a.competition_id
         join users u on u.id = a.user_id
         left join weekly_bonus_transactions t on t.award_id = a.id
        ${where.length ? `where ${where.join(' and ')}` : ''}
        order by c.starts_at desc, a.position asc limit 200`,
      params
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/awards/:id/approve', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const out = await community.approveAward(id, req.user.id);
    await audit(req, 'community.award.approve', 'weekly_bonus_award', id, { replayed: out.replayed });
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/awards/:id/disqualify', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    const row = await community.disqualifyAward(id, req.user.id, reason);
    await audit(req, 'community.award.disqualify', 'weekly_bonus_award', id, { reason });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/awards/:id/pay', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const out = await community.payAward(id, req.user.id, { ip: req.ip });
    await audit(req, 'community.award.pay', 'weekly_bonus_award', id, {
      replayed: out.replayed, reference: out.transaction?.reference,
    });
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/bonus-transactions', async (_req, res, next) => {
  try {
    const r = await getPool().query(
      `select t.*, a.position, a.kind, a.user_id, c.week_key, u.member_no
         from weekly_bonus_transactions t
         join weekly_bonus_awards a on a.id = t.award_id
         join weekly_competitions c on c.id = a.competition_id
         join users u on u.id = a.user_id
        order by t.posted_at desc limit 200`
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// ---------- announcements ----------

router.get('/announcements', async (_req, res, next) => {
  try {
    const r = await getPool().query(
      `select * from notification_feed order by created_at desc limit 100`
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

const announcementBody = z.object({
  category: z.string().trim().min(2).max(48),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(6000).optional().default(''),
  audience: z.enum(['all', 'members', 'winners', 'admins']).optional().default('members'),
  competitionId: z.string().uuid().optional().nullable(),
  meta: z.record(z.any()).optional().default({}),
  publish: z.boolean().optional().default(true),
});

router.post('/announcements', async (req, res, next) => {
  try {
    const b = announcementBody.parse(req.body);
    const q = getPool();
    if (b.publish) {
      const feed = await community.publishAnnouncement(q, {
        category: b.category, title: b.title, body: b.body, audience: b.audience,
        competitionId: b.competitionId || null, meta: b.meta, actorId: req.user.id,
      });
      await audit(req, 'community.announcement.publish', 'notification_feed', feed.id, {
        category: b.category, audience: b.audience, delivered: feed.delivered,
      });
      return res.status(201).json(feed);
    }
    const r = await q.query(
      `insert into notification_feed (category, title, body, audience, competition_id, meta, published, published_by)
       values ($1,$2,$3,$4,$5,$6,false,$7) returning *`,
      [b.category, b.title, b.body, b.audience, b.competitionId || null, b.meta, req.user.id]
    );
    await audit(req, 'community.announcement.create', 'notification_feed', r.rows[0].id, { category: b.category });
    return res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.post('/announcements/:id/publish', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const cur = await q.query(`select * from notification_feed where id = $1`, [id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'announcement_not_found' });
    if (cur.rows[0].published) return res.status(409).json({ error: 'already_published' });
    const feed = await community.publishAnnouncement(q, {
      category: cur.rows[0].category,
      title: cur.rows[0].title,
      body: cur.rows[0].body,
      audience: cur.rows[0].audience,
      competitionId: cur.rows[0].competition_id,
      meta: cur.rows[0].meta,
      actorId: req.user.id,
    });
    await q.query(`delete from notification_feed where id = $1`, [id]);
    await audit(req, 'community.announcement.publish', 'notification_feed', feed.id, { delivered: feed.delivered });
    res.json(feed);
  } catch (e) { next(e); }
});

router.delete('/announcements/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const r = await getPool().query(
      `update notification_feed set published = false where id = $1 returning id`, [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'announcement_not_found' });
    await audit(req, 'community.announcement.unpublish', 'notification_feed', id, {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
