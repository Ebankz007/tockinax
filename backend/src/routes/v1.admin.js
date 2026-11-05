const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced } = require('../lib/ledger');
const router = express.Router();

// Admin gate: must hold super_admin role (checked server-side)
async function adminOnly(req, res, next) {
  const pool = getPool();
  const r = await pool.query(`select 1 from user_roles ur join roles rl on rl.id=ur.role_id where ur.user_id=$1 and rl.name='super_admin'`, [req.user.id]);
  if (!r.rowCount) return res.status(403).json({ error: 'admin_only' });
  next();
}
router.use(authRequired, adminOnly);

async function audit(req, action, targetType, targetId, diff) {
  await getPool().query(`insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, action, targetType, targetId, diff || {}, req.ip]);
}

router.get('/overview', async (_req, res, next) => {
  try {
    const pool = getPool();
    const q = async (t) => (await pool.query(t)).rows[0];
    res.json({
      members: await q(`select count(*)::int as total, count(*) filter (where status='active')::int as active, count(*) filter (where status='suspended')::int as suspended from users`),
      orders: await q(`select count(*)::int as total, count(*) filter (where status='completed')::int as completed, count(*) filter (where status='disputed')::int as disputed, count(*) filter (where status in ('pending_payment','evidence_submitted','under_review'))::int as pending from orders`),
      finance: await q(`select (select coalesce(sum(credit-debit),0)::text from ledger_entries where account='REV:service_fees') as service_fee_revenue,
        (select coalesce(sum(credit-debit),0)::text from ledger_entries where account like 'LIAB:%') as outstanding_liabilities,
        (select count(*)::int from payout_requests where status in ('requested','under_review','approved')) as payouts_pending`),
      recon: await q(`select count(*)::int as mismatches_7d from reconciliation_runs where started_at > now()-interval '7 days' and mismatches>0`),
    });
  } catch (e) { next(e); }
});

// Get listings pending review for moderation queue
router.get('/listings', async (req, res, next) => {
  try {
    const status = req.query.status;
    let query = `select l.*, u.email as seller_email from listings l join users u on u.id=l.seller_id where l.status = 'pending_review'`;
    const r = await pool.query(query);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// Get orders awaiting confirmation for moderation queue
router.get('/orders', async (req, res, next) => {
  try {
    const status = req.query.status;
    let query = `select o.*, u.email as member_email from orders o join users u on u.id=o.member_id where o.status = 'evidence_submitted'`;
    const r = await pool.query(query);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// Approve/suspend listing
router.post('/listings/:id/decision', async (req, res, next) => {
  try {
    const { decision, reason } = z.object({ decision: z.enum(['active', 'suspended', 'removed']), reason: z.string().max(1000).optional() }).parse(req.body);
    const r = await getPool().query(`update listings set status=$1, updated_at=now() where id=$2 returning *`, [decision, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'listing.decision', 'listing', req.params.id, { decision, reason });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// Confirm order payment ONLY via admin dual path (evidence review) — records decision
router.post('/orders/:id/confirm', async (req, res, next) => {
  try {
    const { confirm } = z.object({ confirm: z.boolean() }).parse(req.body);
    const pool = getPool();
    const o = await pool.query(`select * from orders where id=$1`, [req.params.id]);
    if (!o.rowCount) return res.status(404).json({ error: 'not_found' });
    const ord = o.rows[0];
    if (!['evidence_submitted', 'under_review'].includes(ord.status)) return res.status(409).json({ error: 'bad_state' });
    const to = confirm ? 'completed' : 'disputed';
    await pool.query(`update orders set status=$1::order_status, completed_at=case when $2::text='completed' then now() else completed_at end, updated_at=now() where id=$3`, [to, to, ord.id]);
    if (confirm) {
      // Book platform fee as revenue (Decimal-safe strings)
      await postBalanced({
        sourceType: 'order_fee', sourceId: ord.id, currency: ord.currency, memo: `fee ${ord.order_no}`,
        idempotencyKey: `fee:${ord.id}`,
        lines: [
          { account: `MEMO:member_volume_${ord.currency}`, debit: ord.platform_fee },
          { account: 'REV:marketplace_fees', credit: ord.platform_fee },
        ],
      }).catch((e) => { if (!/duplicate|already/i.test(e.message)) throw e; });
    }
    await audit(req, 'order.confirm', 'order', ord.id, { confirm });
    res.json({ ok: true, status: to });
  } catch (e) { next(e); }
});

// Campaign approve (requires funding source + budget) — Stage A/B stay DRAFT until this passes
router.post('/campaigns/:id/approve', async (req, res, next) => {
  try {
    const { fundingSource, budgetCap } = z.object({ fundingSource: z.string().min(10), budgetCap: z.string().regex(/^\d+(\.\d{1,4})?$/) }).parse(req.body);
    const pool = getPool();
    const c = await pool.query(`select * from reward_campaigns where id=$1`, [req.params.id]);
    if (!c.rowCount) return res.status(404).json({ error: 'not_found' });
    await pool.query(`update reward_campaigns set funding_source=$1, budget_cap=$2, status='scheduled', approved_by=$3, approved_at=now() where id=$4`,
      [fundingSource, budgetCap, req.user.id, req.params.id]);
    await audit(req, 'campaign.approve', 'campaign', req.params.id, { budgetCap });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Seller toggle (super_admin only)
router.post('/users/:id/seller', async (req, res, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const r = await getPool().query(`update users set seller_enabled=$1, updated_at=now() where id=$2 returning id, email, seller_enabled`, [enabled, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'user.seller', 'user', req.params.id, { enabled });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// List disputes (open first)
router.get('/disputes', async (req, res, next) => {
  try {
    const status = z.object({ status: z.enum(['open', 'under_review', 'resolved', 'rejected']).optional() }).parse(req.query);
    const pool = getPool();
    const r = status.status
      ? await pool.query(`select d.*, o.order_no from disputes d join orders o on o.id=d.order_id where d.status=$1 order by d.created_at desc limit 100`, [status.status])
      : await pool.query(`select d.*, o.order_no from disputes d join orders o on o.id=d.order_id order by case d.status when 'open' then 0 when 'under_review' then 1 else 2 end, d.created_at desc limit 100`);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// Paginated audit logs
router.get('/audit', async (req, res, next) => {
  try {
    const q = z.object({ page: z.coerce.number().int().min(1).default(1), action: z.string().max(96).optional() }).parse(req.query);
    const limit = 50;
    const offset = (q.page - 1) * limit;
    const pool = getPool();
    const rows = q.action
      ? await pool.query(`select * from audit_logs where action=$1 order by created_at desc limit ${limit} offset ${offset}`, [q.action])
      : await pool.query(`select * from audit_logs order by created_at desc limit ${limit} offset ${offset}`);
    const cnt = await pool.query(q.action ? `select count(*)::int as total from audit_logs where action=$1` : `select count(*)::int as total from audit_logs`, q.action ? [q.action] : []);
    res.json({ total: cnt.rows[0].total, page: q.page, logs: rows.rows });
  } catch (e) { next(e); }
});

// ---- Package management (token definitions + pricing) ----

// GET /admin/packages — token definitions
router.get('/packages', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from token_definitions order by code`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /admin/packages — create a token definition
router.post('/packages', async (req, res, next) => {
  try {
    const b = z.object({
      code: z.string().min(1).max(32),
      name: z.string().min(1).max(120),
      kind: z.string().min(1).max(24).default('STANDARD'),
      total_supply: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
      basis: z.string().optional().default(''),
      rights: z.string().optional().default(''),
      active: z.boolean().default(true),
    }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(
      `insert into token_definitions (code, name, kind, total_supply, basis, rights, active)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [b.code, b.name, b.kind, b.total_supply, b.basis, b.rights, b.active]
    );
    await audit(req, 'package.create', 'token_definition', r.rows[0].code, b);
    res.status(201).json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

// PUT /admin/packages/:code — update a token definition
router.put('/packages/:code', async (req, res, next) => {
  try {
    const b = z.object({
      name: z.string().min(1).max(120).optional(),
      kind: z.string().min(1).max(24).optional(),
      total_supply: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
      basis: z.string().optional(),
      rights: z.string().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    const pool = getPool();
    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(b)) {
      if (v !== undefined) { fields.push(`${k} = $${i++}`); vals.push(k === 'total_supply' || k === 'active' ? v : v); }
    }
    if (!fields.length) return res.status(400).json({ error: 'no_fields' });
    vals.push(req.params.code);
    const r = await pool.query(`update token_definitions set ${fields.join(', ')}, updated_at=now() where code=$${i} returning *`, vals);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'package.update', 'token_definition', req.params.code, b);
    res.json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

// GET /admin/packages/pricing — pricing rules
router.get('/packages/pricing', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from pricing_rules order by version, lock_days`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /admin/packages/pricing — create/update a pricing rule
router.post('/packages/pricing', async (req, res, next) => {
  try {
    const b = z.object({
      version: z.coerce.number().int().min(1).default(1),
      lock_days: z.coerce.number().int().min(1),
      rate_bps_per_day: z.coerce.number().int().min(0),
      basis: z.string().min(1).max(16).default('simple'),
      active: z.boolean().default(true),
    }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(
      `insert into pricing_rules (version, lock_days, rate_bps_per_day, basis, active)
       values ($1,$2,$3,$4,$5)
       on conflict (version, lock_days) do update set rate_bps_per_day=excluded.rate_bps_per_day, basis=excluded.basis, active=excluded.active
       returning *`,
      [b.version, b.lock_days, b.rate_bps_per_day, b.basis, b.active]
    );
    await audit(req, 'pricing.upsert', 'pricing_rule', `v${b.version}/lock${b.lock_days}`, b);
    res.status(201).json({ item: r.rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
