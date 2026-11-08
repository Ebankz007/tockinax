// Community engagement — public + member API.
// Public: approved testimonials, controlled media, official social links,
// leaderboards, announcements. Member: submissions, media upload, social
// promotion, bonus history and personal ranking.
'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../lib/db');
const { authRequired, optionalAuth } = require('../middleware/auth');
const { mediaUpload } = require('../middleware/upload');
const { saveEvidence, signedUrl } = require('../lib/storage');
const community = require('../lib/community');

const router = express.Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRIES = /^[A-Z]{2}$/;
const PLATFORMS = ['telegram', 'youtube', 'x', 'instagram', 'facebook', 'tiktok', 'linkedin'];

function parseUuid(value, code = 'invalid_id') {
  if (!UUID.test(String(value || ''))) throw community.httpError(400, code);
  return String(value);
}

function extForMime(mime) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/quicktime': 'mov',
  };
  return map[mime] || 'bin';
}

function streamMedia(req, res, row) {
  const filePath = signedUrl(row.storage_key);
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: 'media_not_found' });
  }
  if (!stat.isFile()) return res.status(404).json({ error: 'media_not_found' });

  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const range = req.headers.range;
  if (!range) {
    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(filePath).pipe(res);
  }
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(range));
  if (!m) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }
  let start = m[1] === '' ? null : Number(m[1]);
  let end = m[2] === '' ? null : Number(m[2]);
  if (start === null && end === null) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }
  if (start === null) {
    const suffix = Math.min(end, stat.size);
    start = stat.size - suffix;
    end = stat.size - 1;
  } else {
    if (end === null || end >= stat.size) end = stat.size - 1;
  }
  if (start < 0 || start > end || start >= stat.size) {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    return res.status(416).end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  res.setHeader('Content-Length', end - start + 1);
  return fs.createReadStream(filePath, { start, end }).pipe(res);
}

async function mediaFor(q, testimonialIds) {
  if (!testimonialIds.length) return new Map();
  const r = await q.query(
    `select id, testimonial_id, kind, mime, bytes, duration_seconds, sort_order
       from testimonial_media where testimonial_id = any($1::uuid[])
      order by sort_order asc, created_at asc`,
    [testimonialIds]
  );
  const map = new Map();
  for (const row of r.rows) {
    if (!map.has(row.testimonial_id)) map.set(row.testimonial_id, []);
    map.get(row.testimonial_id).push({
      id: row.id,
      kind: row.kind,
      mime: row.mime,
      bytes: row.bytes,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      url: `/api/v1/community/testimonials/${row.testimonial_id}/media/${row.id}`,
    });
  }
  return map;
}

function publicTestimonial(row, media, views) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    displayName: row.display_name,
    country: row.country,
    mediaType: row.media_type,
    featured: row.featured,
    socialUrl: row.social_url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    views: Number(views || 0),
    media: media || [],
  };
}

// ---------- PUBLIC ----------

router.get('/testimonials', async (req, res, next) => {
  try {
    const q = getPool();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const mediaType = ['video', 'image', 'written'].includes(req.query.media) ? req.query.media : null;
    const country = COUNTRIES.test(String(req.query.country || '').toUpperCase()) ? String(req.query.country).toUpperCase() : null;
    const featured = String(req.query.featured || '') === 'true';

    const where = [`t.status = 'approved'`, `t.deleted_at is null`, `t.consent = true`, `t.policy_accepted = true`];
    const params = [];
    if (mediaType) { params.push(mediaType); where.push(`t.media_type = $${params.length}`); }
    if (country) { params.push(country); where.push(`t.country = $${params.length}`); }
    if (featured) where.push(`t.featured = true`);

    params.push(limit, offset);
    const r = await q.query(
      `select t.id, t.title, t.body, t.display_name, t.country, t.media_type, t.featured,
              t.social_url, t.published_at, t.created_at,
              (select count(*) from testimonial_views v
                where v.testimonial_id = t.id and v.eligible = true)::int as views
         from testimonials t
        where ${where.join(' and ')}
        order by t.featured desc, t.published_at desc nulls last, t.created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params
    );
    const media = await mediaFor(q, r.rows.map((x) => x.id));
    const count = await q.query(
      `select count(*)::int as n from testimonials t where ${where.join(' and ')}`,
      params.slice(0, params.length - 2)
    );
    res.json({
      items: r.rows.map((row) => publicTestimonial(row, media.get(row.id), row.views)),
      total: count.rows[0].n,
      limit,
      offset,
    });
  } catch (e) { next(e); }
});

router.get('/testimonials/mine', authRequired, async (req, res, next) => {
  try {
    const q = getPool();
    const r = await q.query(
      `select t.*, (select count(*) from testimonial_views v
                    where v.testimonial_id = t.id and v.eligible = true)::int as views
         from testimonials t
        where t.user_id = $1 and t.deleted_at is null
        order by t.created_at desc limit 100`,
      [req.user.id]
    );
    const media = await mediaFor(q, r.rows.map((x) => x.id));
    res.json(r.rows.map((row) => ({
      id: row.id, title: row.title, body: row.body, displayName: row.display_name,
      country: row.country, mediaType: row.media_type, status: row.status,
      featured: row.featured, suspicious: row.suspicious, adminRemarks: row.admin_remarks,
      consent: row.consent, policyAccepted: row.policy_accepted,
      publishedAt: row.published_at, createdAt: row.created_at, views: row.views,
      media: media.get(row.id) || [],
    })));
  } catch (e) { next(e); }
});

router.get('/testimonials/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const r = await q.query(
      `select t.id, t.title, t.body, t.display_name, t.country, t.media_type, t.featured,
              t.social_url, t.published_at, t.created_at,
              (select count(*) from testimonial_views v
                where v.testimonial_id = t.id and v.eligible = true)::int as views
         from testimonials t
        where t.id = $1 and t.status = 'approved' and t.deleted_at is null
          and t.consent = true and t.policy_accepted = true`,
      [id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    const media = await mediaFor(q, [id]);
    res.json(publicTestimonial(r.rows[0], media.get(id), r.rows[0].views));
  } catch (e) { next(e); }
});

// Views are counted server-side only. The client never supplies a count.
router.post('/testimonials/:id/view',
  rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }),
  optionalAuth,
  async (req, res, next) => {
    try {
      const id = parseUuid(req.params.id);
      const result = await community.recordTestimonialView(id, req, { userId: req.user?.id || null });
      res.json(result);
    } catch (e) { next(e); }
  });

// Controlled media: approved testimonials are public; a member may always see
// their own media (needed while a submission awaits moderation).
router.get('/testimonials/:id/media/:mediaId', optionalAuth, async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const mediaId = parseUuid(req.params.mediaId);
    const q = getPool();
    const t = await q.query(`select id, user_id, status, deleted_at from testimonials where id = $1`, [id]);
    if (!t.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    const row = t.rows[0];
    const isOwner = req.user && req.user.id === row.user_id;
    if (row.deleted_at || (row.status !== 'approved' && !isOwner)) {
      return res.status(404).json({ error: 'testimonial_not_found' });
    }
    const m = await q.query(
      `select * from testimonial_media where id = $1 and testimonial_id = $2`, [mediaId, id]
    );
    if (!m.rowCount) return res.status(404).json({ error: 'media_not_found' });
    return streamMedia(req, res, m.rows[0]);
  } catch (e) { next(e); }
});

router.get('/social-accounts', async (_req, res, next) => {
  try {
    const r = await getPool().query(
      `select platform, label, url, sort_order from social_media_accounts
        where enabled = true order by sort_order asc, platform asc`
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/leaderboards', optionalAuth, async (req, res, next) => {
  try {
    const settings = await community.getCommunitySettings();
    if (settings.leaderboard_public === false && !req.user) {
      return res.status(403).json({ error: 'leaderboard_private' });
    }
    const kinds = req.query.kind && community.KINDS.includes(req.query.kind)
      ? [req.query.kind] : community.KINDS;
    const out = {};
    for (const kind of kinds) {
      const data = await community.getLeaderboard(kind);
      if (!data) { out[kind] = null; continue; }
      const showAmounts = data.config?.notification_settings?.public_amounts !== false;
      out[kind] = {
        competition: {
          id: data.competition.id,
          kind: data.competition.kind,
          weekKey: data.competition.week_key,
          startsAt: data.competition.starts_at,
          endsAt: data.competition.ends_at,
          timezone: data.competition.timezone,
          status: data.competition.status,
          minMetric: data.config?.min_metric,
        },
        rewards: showAmounts ? data.config?.position_rewards || {} : undefined,
        pool: showAmounts ? data.config?.pool_amount : undefined,
        currency: data.config?.currency,
        leaderboard: data.leaderboard.map((row) => ({
          rank: row.rank,
          member: row.display_name || (row.member_no ? `Member ${row.member_no}` : 'Member'),
          referralCode: row.referral_code || null,
          testimonialId: row.testimonial_id,
          title: row.title || null,
          country: row.country || null,
          metric: row.metric_value,
          qualified: row.qualified,
          awardStatus: row.award_status || null,
          amount: showAmounts ? row.amount : undefined,
        })),
      };
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/announcements', async (_req, res, next) => {
  try {
    const r = await getPool().query(
      `select id, category, title, body, audience, competition_id, meta, published_at
         from notification_feed
        where published = true and audience in ('all','members')
        order by published_at desc nulls last, created_at desc limit 50`
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/rules', async (_req, res, next) => {
  try {
    const q = getPool();
    const page = await q.query(`select slug, title, body from content_pages where slug = 'community-rules'`);
    const configs = await q.query(
      `select kind, pool_amount, currency, position_rewards, min_metric, approval_required,
              timezone, start_dow, start_time, end_dow, end_time, eligibility, notification_settings
         from weekly_bonus_configurations where active = true order by kind`
    );
    const settings = await community.getCommunitySettings(q);
    res.json({
      page: page.rows[0] || null,
      competitions: configs.rows,
      policy: {
        minViews: settings.testimonial_min_views,
        viewDedupHours: settings.view_dedup_hours,
        maxVideoMb: settings.max_video_mb,
        maxImageMb: settings.max_image_mb,
        maxVideoSeconds: settings.max_video_seconds,
      },
      disclosure: 'Weekly bonuses are promotional incentives funded by TOCKINAX. They are not investment returns and are never conditional on a positive review. Critical and honest feedback is welcome.',
    });
  } catch (e) { next(e); }
});

// ---------- MEMBER ----------

router.use(authRequired);

const testimonialBody = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(6000).optional().default(''),
  displayName: z.string().trim().min(2).max(120),
  country: z.string().trim().regex(COUNTRIES).transform((s) => s.toUpperCase()),
  socialUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  mediaType: z.enum(['video', 'image', 'written']).default('written'),
  consent: z.literal(true),
  policyAccepted: z.literal(true),
});

router.post('/testimonials', async (req, res, next) => {
  try {
    const b = testimonialBody.parse(req.body);
    if (b.mediaType === 'written' && !b.body) {
      return res.status(400).json({ error: 'body_required', message: 'Written testimonials need text.' });
    }
    if (b.mediaType !== 'written' && b.body.length > 0 && b.body.length < 3) {
      return res.status(400).json({ error: 'body_too_short' });
    }
    const q = getPool();
    const r = await q.query(
      `insert into testimonials
         (user_id, title, body, display_name, country, social_url, media_type, status, consent, policy_accepted)
       values ($1,$2,$3,$4,$5,$6,$7,'pending',true,true) returning *`,
      [req.user.id, b.title, b.body || '', b.displayName, b.country, b.socialUrl || null, b.mediaType]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.patch('/testimonials/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const b = testimonialBody.parse(req.body);
    const q = getPool();
    const cur = await q.query(`select * from testimonials where id = $1 and user_id = $2 and deleted_at is null`, [id, req.user.id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    if (!['pending', 'needs_correction', 'rejected'].includes(cur.rows[0].status)) {
      return res.status(409).json({ error: 'not_editable', message: 'Approved testimonials can only be changed through support.' });
    }
    const r = await q.query(
      `update testimonials
          set title=$3, body=$4, display_name=$5, country=$6, social_url=$7, media_type=$8,
              status='pending', admin_remarks=null, reviewed_by=null, reviewed_at=null, updated_at=now()
        where id=$1 and user_id=$2 returning *`,
      [id, req.user.id, b.title, b.body || '', b.displayName, b.country, b.socialUrl || null, b.mediaType]
    );
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/testimonials/:id', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const r = await getPool().query(
      `update testimonials set deleted_at = now(), status = 'unpublished', updated_at = now()
        where id = $1 and user_id = $2 and deleted_at is null returning id`,
      [id, req.user.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Raw media upload: metadata first, then bytes. Content type is validated by
// magic bytes; limits come from admin settings.
router.post('/testimonials/:id/media',
  express.raw({ type: () => true, limit: '60mb' }),
  async (req, res, next) => {
    try {
      const id = parseUuid(req.params.id);
      const q = getPool();
      const t = await q.query(`select * from testimonials where id = $1 and user_id = $2 and deleted_at is null`, [id, req.user.id]);
      if (!t.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
      const row = t.rows[0];
      if (!['pending', 'needs_correction', 'rejected'].includes(row.status)) {
        return res.status(409).json({ error: 'not_editable' });
      }
      if (row.media_type === 'written') return res.status(400).json({ error: 'written_has_no_media' });
      const settings = await community.getCommunitySettings(q);
      const isVideo = row.media_type === 'video';
      const maxBytes = (isVideo ? settings.max_video_mb : settings.max_image_mb) * 1024 * 1024;
      const guard = mediaUpload({
        required: true,
        kind: isVideo ? 'video' : 'image',
        maxBytes,
        maxVideoSeconds: settings.max_video_seconds,
      });
      await new Promise((resolve, reject) => guard(req, res, (err) => (err ? reject(err) : resolve())));
      if (!req.fileCheck?.present) return undefined;

      const count = await q.query(
        `select count(*)::int as n from testimonial_media where testimonial_id = $1`, [id]
      );
      if (isVideo && count.rows[0].n >= 1) return res.status(409).json({ error: 'one_video_only' });
      if (!isVideo && count.rows[0].n >= 3) return res.status(409).json({ error: 'max_three_images' });

      const key = await saveEvidence(req.body, extForMime(req.fileCheck.kind));
      const ins = await q.query(
        `insert into testimonial_media
           (testimonial_id, kind, storage_key, mime, bytes, original_name, duration_seconds, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [id, isVideo ? 'video' : 'image', key, req.fileCheck.kind, req.fileCheck.bytes,
          req.fileCheck.originalName, req.fileCheck.durationSeconds, count.rows[0].n]
      );
      return res.status(201).json({
        id: ins.rows[0].id,
        kind: ins.rows[0].kind,
        mime: ins.rows[0].mime,
        bytes: ins.rows[0].bytes,
        durationSeconds: ins.rows[0].duration_seconds === null ? null : Number(ins.rows[0].duration_seconds),
        url: `/api/v1/community/testimonials/${id}/media/${ins.rows[0].id}`,
      });
    } catch (e) { next(e); }
  });

router.get('/testimonials/:id/media', async (req, res, next) => {
  try {
    const id = parseUuid(req.params.id);
    const q = getPool();
    const t = await q.query(`select id from testimonials where id = $1 and user_id = $2 and deleted_at is null`, [id, req.user.id]);
    if (!t.rowCount) return res.status(404).json({ error: 'testimonial_not_found' });
    const media = await mediaFor(q, [id]);
    res.json(media.get(id) || []);
  } catch (e) { next(e); }
});

const socialBody = z.object({
  platform: z.enum(PLATFORMS),
  postUrl: z.string().trim().url().max(500),
  caption: z.string().trim().max(2000).optional().default(''),
});

router.post('/social-submissions', async (req, res, next) => {
  try {
    const b = socialBody.parse(req.body);
    const q = getPool();
    const r = await q.query(
      `insert into social_media_submissions (user_id, platform, post_url, caption, status)
       values ($1,$2,$3,$4,'pending')
       on conflict (user_id, post_url) do nothing returning *`,
      [req.user.id, b.platform, b.postUrl, b.caption || null]
    );
    if (!r.rowCount) return res.status(409).json({ error: 'duplicate_submission' });
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.post('/social-submissions/:id/screenshot',
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res, next) => {
    try {
      const id = parseUuid(req.params.id);
      const q = getPool();
      const s = await q.query(`select * from social_media_submissions where id = $1 and user_id = $2`, [id, req.user.id]);
      if (!s.rowCount) return res.status(404).json({ error: 'submission_not_found' });
      const guard = mediaUpload({ required: true, kind: 'image', maxBytes: 8 * 1024 * 1024 });
      await new Promise((resolve, reject) => guard(req, res, (err) => (err ? reject(err) : resolve())));
      if (!req.fileCheck?.present) return undefined;
      const key = await saveEvidence(req.body, extForMime(req.fileCheck.kind));
      const r = await q.query(
        `update social_media_submissions
            set screenshot_key = $3, status = 'pending', reviewed_by = null, reviewed_at = null
          where id = $1 and user_id = $2 returning *`,
        [id, req.user.id, key]
      );
      return res.json({ ok: true, id: r.rows[0].id });
    } catch (e) { next(e); }
  });

router.get('/social-submissions/mine', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select id, platform, post_url, caption, status, verification_method, admin_remarks,
              submitted_at, reviewed_at, (screenshot_key is not null) as has_screenshot
         from social_media_submissions where user_id = $1 order by submitted_at desc limit 100`,
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.get('/leaderboards/mine', async (req, res, next) => {
  try {
    const out = {};
    for (const kind of community.KINDS) {
      const data = await community.getLeaderboard(kind);
      if (!data) { out[kind] = null; continue; }
      const mine = await getPool().query(
        `select rank, metric_value, qualified, qualification_reason
           from competition_participants
          where competition_id = $1 and user_id = $2 order by rank asc nulls last limit 1`,
        [data.competition.id, req.user.id]
      );
      const total = await getPool().query(
        `select count(*)::int as n from competition_participants where competition_id = $1`,
        [data.competition.id]
      );
      out[kind] = {
        competition: {
          id: data.competition.id, weekKey: data.competition.week_key,
          startsAt: data.competition.starts_at, endsAt: data.competition.ends_at,
          status: data.competition.status, minMetric: data.config?.min_metric,
        },
        me: mine.rows[0] || null,
        participants: total.rows[0].n,
        leaderboard: data.leaderboard.map((row) => ({
          rank: row.rank,
          member: row.display_name || (row.member_no ? `Member ${row.member_no}` : 'Member'),
          metric: row.metric_value,
          testimonialId: row.testimonial_id,
          awardStatus: row.award_status || null,
          amount: row.amount,
          currency: row.currency,
        })),
      };
    }
    res.json(out);
  } catch (e) { next(e); }
});

router.get('/bonuses/mine', async (req, res, next) => {
  try {
    const q = getPool();
    const awards = await q.query(
      `select a.id, a.kind, a.position, a.metric_value, a.amount, a.currency, a.status,
              a.payment_status, a.disqualify_reason, a.approved_at, a.created_at,
              c.week_key, c.starts_at, c.ends_at
         from weekly_bonus_awards a
         join weekly_competitions c on c.id = a.competition_id
        where a.user_id = $1 order by a.created_at desc limit 100`,
      [req.user.id]
    );
    const tx = await q.query(
      `select t.id, t.reference, t.amount, t.currency, t.status, t.posted_at,
              t.ledger_tx_id, t.award_id
         from weekly_bonus_transactions t
         join weekly_bonus_awards a on a.id = t.award_id
        where a.user_id = $1 order by t.posted_at desc limit 100`,
      [req.user.id]
    );
    const totals = await q.query(
      `select
         coalesce(sum(case when a.payment_status = 'paid' then a.amount else 0 end),0)::text as paid,
         coalesce(sum(case when a.status = 'approved' and a.payment_status <> 'paid' then a.amount else 0 end),0)::text as approved_pending,
         coalesce(sum(case when a.status = 'provisional' then a.amount else 0 end),0)::text as provisional
       from weekly_bonus_awards a where a.user_id = $1`,
      [req.user.id]
    );
    res.json({ awards: awards.rows, transactions: tx.rows, totals: totals.rows[0] });
  } catch (e) { next(e); }
});

router.get('/me/summary', async (req, res, next) => {
  try {
    const q = getPool();
    const t = await q.query(
      `select status, count(*)::int as n from testimonials
        where user_id = $1 and deleted_at is null group by status`, [req.user.id]
    );
    const s = await q.query(
      `select status, count(*)::int as n from social_media_submissions
        where user_id = $1 group by status`, [req.user.id]
    );
    const views = await q.query(
      `select coalesce(count(*),0)::int as n from testimonial_views v
         join testimonials t on t.id = v.testimonial_id
        where t.user_id = $1 and v.eligible = true`, [req.user.id]
    );
    const unread = await q.query(
      `select count(*)::int as n from notifications where user_id = $1 and read_at is null`, [req.user.id]
    );
    const bonus = await q.query(
      `select coalesce(sum(case when payment_status = 'paid' then amount else 0 end),0)::text as paid
         from weekly_bonus_awards where user_id = $1`, [req.user.id]
    );
    const by = (rows) => Object.fromEntries(rows.map((r) => [r.status, r.n]));
    res.json({
      testimonials: { byStatus: by(t.rows), total: t.rows.reduce((a, r) => a + r.n, 0) },
      socialSubmissions: { byStatus: by(s.rows), total: s.rows.reduce((a, r) => a + r.n, 0) },
      verifiedViews: views.rows[0].n,
      unreadNotifications: unread.rows[0].n,
      bonusPaid: bonus.rows[0].paid,
    });
  } catch (e) { next(e); }
});

module.exports = router;
