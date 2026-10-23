// TOCKINAX compat + admin layer for token/payments modules.
// - Member path aliases matching the frontend contract (canonical routes live in
//   v1.tokens / v1.deposits / v1.withdrawals / v1.tokenmarket; aliases forward or
//   re-query the same tables so there is exactly one source of truth per fact).
// - Admin oversight endpoints (listings, deposits, withdrawals, KPIs) + locked
//   stage-config (409: stages carry the APPROVED plan values; edits stay locked).
// Mounted at /api/v1/tokens, /api/v1/deposits, /api/v1/withdrawals, /api/v1/tokenmarket.
const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const { postBalanced, Decimal } = require('../lib/ledger');

async function hasRole(userId, names) {
  const r = await getPool().query(
    `select 1 from user_roles ur join roles rl on rl.id=ur.role_id where ur.user_id=$1 and rl.name = any($2)`,
    [userId, names]
  );
  return r.rowCount > 0;
}
async function audit(actorId, ip, action, targetId, diff) {
  await getPool().query(
    `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, 'token_ops', String(targetId), diff || {}, ip || null]
  ).catch(() => {});
}

// ---------- /api/v1/tokens compat ----------
const tokensCompat = express.Router();
tokensCompat.use(authRequired);

tokensCompat.get('/holdings', async (req, res, next) => {
  try {
    const r = await getPool().query(`select * from token_holdings where user_id=$1 order by purchased_at desc`, [req.user.id]);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

tokensCompat.get('/cycles', async (req, res, next) => {
  try {
    const pool = getPool();
    const cycles = await pool.query(
      `select c.*, h.lock_days from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 order by c.started_at desc`, [req.user.id]);
    const ok7 = await pool.query(
      `select count(*)::int as n from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 and c.success=true and h.lock_days=7`, [req.user.id]);
    const ok14 = await pool.query(
      `select count(*)::int as n from participation_cycles c join token_holdings h on h.id=c.holding_id
       where c.user_id=$1 and c.success=true and h.lock_days=14`, [req.user.id]);
    const st = await pool.query(`select stage from users where id=$1`, [req.user.id]);
    const stage = st.rows[0]?.stage ?? 1;
    const def = await pool.query(`select * from stage_definitions where stage=$1`, [stage]);
    res.json({ items: cycles.rows, eligibility: {
      success_7d: ok7.rows[0].n, success_14d: ok14.rows[0].n,
      required_7d: def.rows[0]?.req_cycles_7d ?? 0, required_14d: def.rows[0]?.req_cycles_14d ?? 0, stage } });
  } catch (e) { next(e); }
});

tokensCompat.get('/definitions', async (_req, res, next) => {
  try {
    const r = await getPool().query(`select code, name, kind, total_supply, basis, rights, active from token_definitions order by code`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

tokensCompat.get('/pricing-versions', async (_req, res, next) => {
  try {
    const r = await getPool().query(`select version, lock_days, rate_bps_per_day, basis, active, created_at from pricing_rules order by version desc, lock_days`);
    res.json({ items: r.rows, note: 'Simple (non-compounded) target pricing. Targets are not guaranteed.' });
  } catch (e) { next(e); }
});

tokensCompat.get('/stages', async (req, res, next) => {
  try {
    const pool = getPool();
    const st = await pool.query(`select stage from users where id=$1`, [req.user.id]);
    const defs = await pool.query(`select * from stage_definitions order by stage`);
    res.json({ current: st.rows[0]?.stage ?? 1, items: defs.rows, note: 'Approved plan limits + fees. NULL (if any) would be unpublished.' });
  } catch (e) { next(e); }
});

tokensCompat.get('/stages/current', async (req, res, next) => {
  try {
    const pool = getPool();
    const st = await pool.query(`select stage, member_no from users where id=$1`, [req.user.id]);
    const stage = st.rows[0]?.stage ?? 1;
    const def = await pool.query(`select * from stage_definitions where stage=$1`, [stage]);
    const d = def.rows[0] || null;
    const nextDef = stage < 5 ? (await pool.query(`select * from stage_definitions where stage=$1`, [stage + 1])).rows[0] || null : null;
    res.json({ member_no: st.rows[0]?.member_no || null, current: stage,
      limits: d ? { min_buy: d.min_buy, max_buy: d.max_buy } : null,
      requirements: d ? { req_cycles_7d: d.req_cycles_7d, req_cycles_14d: d.req_cycles_14d } : null,
      upgrade: nextDef ? { to_stage: stage + 1, fee: d ? d.upgrade_fee : null, fee_unset: (d ? d.upgrade_fee : null) == null } : null,
      renewal: d ? { fee: d.renewal_fee, fee_unset: d.renewal_fee == null } : null });
  } catch (e) { next(e); }
});

tokensCompat.get('/stages/config', async (_req, res, next) => {
  try {
    const r = await getPool().query(`select * from stage_definitions order by stage`);
    res.json({ items: r.rows, editable: false, note: 'Read-only: approved compensation plan values. Edits stay locked.' });
  } catch (e) { next(e); }
});

tokensCompat.put('/stages/config', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin']))) return res.status(403).json({ error: 'admin_only' });
    return res.status(409).json({ error: 'configuration_locked', message: 'Stage limits/fees carry the approved compensation plan. Edits stay locked.' });
  } catch (e) { next(e); }
});

async function stageRequestAs(pool, userId, kind) {
  const st = await pool.query(`select stage from users where id=$1`, [userId]);
  const stage = st.rows[0]?.stage ?? 1;
  let toStage = stage;
  let fee = null;
  if (kind === 'upgrade') {
    if (stage >= 5) return { status: 409, body: { error: 'max_stage' } };
    toStage = stage + 1;
    const nd = await pool.query(`select 1 from stage_definitions where stage=$1`, [toStage]);
    if (!nd.rowCount) return { status: 404, body: { error: 'stage_not_found' } };
    // Approved plan: fee to LEAVE the current stage (stage 5 = 0 / cannot leave).
    const cur = await pool.query(`select * from stage_definitions where stage=$1`, [stage]);
    fee = cur.rows[0]?.upgrade_fee ?? null;
  } else {
    const def = await pool.query(`select * from stage_definitions where stage=$1`, [stage]);
    fee = def.rows[0]?.renewal_fee ?? null;
  }
  if (fee == null) return { status: 409, body: { error: 'fee_unset', message: 'Fee not published — request blocked until admin discloses a fee.' } };
  const idem = `stage:${userId}:${kind}:${stage}->${toStage}:${fee}`;
  const r = await pool.query(
    `insert into stage_requests (user_id, kind, from_stage, to_stage, fee_disclosed, status, idempotency)
     values ($1,$2,$3,$4,$5,'pending',$6) on conflict (idempotency) do nothing returning *`,
    [userId, kind, stage, toStage, String(fee), idem]
  );
  if (!r.rowCount) {
    const ex = await pool.query(`select * from stage_requests where idempotency=$1`, [idem]);
    return { status: 200, body: ex.rows[0] };
  }
  return { status: 201, body: r.rows[0] };
}

tokensCompat.post('/stages/upgrade', async (req, res, next) => {
  try {
    const out = await stageRequestAs(getPool(), req.user.id, 'upgrade');
    res.status(out.status).json(out.body);
  } catch (e) { next(e); }
});
tokensCompat.post('/stages/renew', async (req, res, next) => {
  try {
    const out = await stageRequestAs(getPool(), req.user.id, 'renewal');
    res.status(out.status).json(out.body);
  } catch (e) { next(e); }
});

tokensCompat.get('/categories', async (_req, res, next) => {
  try {
    const r = await getPool().query(`select id as key, name, description, rate_bps, active from commission_categories order by id`);
    res.json({ items: r.rows, note: 'Approved plan categories + rates. All categories disabled (active=false) until payouts are approved and funded.' });
  } catch (e) { next(e); }
});

tokensCompat.get('/commissions', async (req, res, next) => {
  try {
    const r = await getPool().query(
      `select level, status, category, generation, sum(amount)::text as total, currency
       from commission_calculations where beneficiary_id=$1 group by level, status, category, generation, currency`,
      [req.user.id]
    ).catch(async () => (await getPool().query(
      `select level, status, sum(amount)::text as total, currency from commission_calculations where beneficiary_id=$1 group by level, status, currency`,
      [req.user.id])));
    res.json({ items: r.rows, note: 'Payable only after rule approval, confirmation period and funding.' });
  } catch (e) { next(e); }
});

tokensCompat.get('/admin/kpis', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin', 'finance', 'support']))) return res.status(403).json({ error: 'staff_only' });
    const pool = getPool();
    const q = async (t, p = []) => (await pool.query(t, p).catch(() => ({ rows: [{}] }))).rows[0];
    res.json({
      membersByStage: (await pool.query(`select stage, count(*)::int as n from users group by stage order by stage`).catch(() => ({ rows: [] }))).rows,
      holdings: await q(`select count(*)::int as total, coalesce(sum(cost_usdt),0)::text as cost_usdt from token_holdings where status in ('locked','matured')`),
      listings: await q(`select count(*)::int as open_n, coalesce(sum(remaining_qty),0)::text as remaining from token_listings where status in ('open','partial')`),
      fills: await q(`select count(*)::int as n, coalesce(sum(total),0)::text as volume from token_fills`),
      cycles: await q(`select count(*) filter (where success)::int as success, count(*)::int as total from participation_cycles`),
      deposits: await q(`select count(*) filter (where status='confirmed')::int as confirmed, count(*) filter (where status in ('created','pending','confirming'))::int as pending from deposit_intents`),
      withdrawals: await q(`select count(*) filter (where status in ('requested','under_review','approved'))::int as pending from withdrawal_requests`),
      simulated: true,
    });
  } catch (e) { next(e); }
});

// ---------- /api/v1/deposits compat ----------
const depositsCompat = express.Router();
depositsCompat.use(authRequired);
const canonicalDeposits = require('./v1.deposits');

depositsCompat.post('/intents', (req, res, next) => {
  req.url = '/intent';
  canonicalDeposits.handle(req, res, next);
});
depositsCompat.get('/mine', (req, res, next) => {
  req.url = '/intents/mine';
  canonicalDeposits.handle(req, res, next);
});

// POST /deposits/:id/simulate-pay — sandbox ONLY, owner only. Drives the same
// sandbox invoice + confirmDepositIntent path the webhook uses (no test backdoor
// into live: refuses when sandbox mode off or intent not sandbox).
depositsCompat.post('/:id/simulate-pay', async (req, res, next) => {
  try {
    const { isSandboxMode, confirmDepositIntent } = require('./v1.deposits');
    const sandbox = require('../lib/pay2crypto-sandbox');
    if (!isSandboxMode()) return res.status(403).json({ error: 'live_disabled', message: 'Simulation is unavailable outside sandbox mode.' });
    const pool = getPool();
    const r = await pool.query(`select * from deposit_intents where id=$1 and user_id=$2`, [req.params.id, req.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    const intent = r.rows[0];
    if (!intent.sandbox) return res.status(403).json({ error: 'not_sandbox', message: 'Only sandbox intents can be simulated.' });
    if (!['created', 'pending'].includes(intent.status)) return res.status(409).json({ error: 'bad_state', status: intent.status });
    await pool.query(`update deposit_intents set status='confirming', updated_at=now() where id=$1`, [intent.id]);
    const sim = sandbox.simulatePay(intent.provider_invoice_id);
    const tx = (sim.payload && sim.payload.tx_hash) || sim.txHash || sim.tx_hash || null;
    // Mirror webhook semantics: record the provider event (dedupe-consistent) then credit.
    await pool.query(
      `insert into payment_provider_events (provider, event_id, payload, signature_ok, processed_at)
       values ('pay2crypto',$1,$2,true,now()) on conflict (provider, event_id) do nothing`,
      [sim.payload.event_id, JSON.stringify(sim.payload)]
    );
    const out = await confirmDepositIntent(pool, intent, tx);
    await audit(req.user.id, req.ip, 'deposit.simulate_pay', intent.id, { tx, sandbox: true });
    res.json({ ok: true, status: 'confirmed', tx_hash: tx, replayed: !!out.replayed, sandbox: true });
  } catch (e) {
    if (/sandbox_invoice_not_found/i.test(e.message)) return res.status(404).json({ error: 'sandbox_invoice_gone' });
    next(e);
  }
});

depositsCompat.get('/admin/queue', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin', 'finance', 'support']))) return res.status(403).json({ error: 'staff_only' });
    const q = z.object({ status: z.string().max(24).optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const pool = getPool();
    const r = q.status
      ? await pool.query(`select d.*, u.email from deposit_intents d join users u on u.id=d.user_id where d.status=$1 order by d.created_at desc limit 100`, [q.status])
      : await pool.query(`select d.*, u.email from deposit_intents d join users u on u.id=d.user_id order by d.created_at desc limit 100`);
    res.json({ items: r.rows, page: q.page });
  } catch (e) { next(e); }
});

depositsCompat.post('/admin/:id/decision', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin', 'finance']))) return res.status(403).json({ error: 'finance_only' });
    const b = z.object({ action: z.enum(['cancel']), note: z.string().max(500).optional().default('') }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(`select * from deposit_intents where id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not_found' });
    if (!['created', 'pending'].includes(r.rows[0].status)) return res.status(409).json({ error: 'bad_state', status: r.rows[0].status });
    await pool.query(`update deposit_intents set status='cancelled', updated_at=now() where id=$1`, [req.params.id]);
    await audit(req.user.id, req.ip, 'deposit.admin_cancel', req.params.id, { note: b.note });
    res.json({ ok: true, status: 'cancelled' });
  } catch (e) { next(e); }
});

// ---------- /api/v1/withdrawals compat (admin path aliases; gates preserved) ----------
const withdrawalsCompat = express.Router();
withdrawalsCompat.use(authRequired);
const canonicalWithdrawals = require('./v1.withdrawals');

withdrawalsCompat.get('/admin/queue', (req, res, next) => {
  req.url = '/queue';
  canonicalWithdrawals.handle(req, res, next);
});
withdrawalsCompat.post('/admin/:id/decision', (req, res, next) => {
  const b = req.body || {};
  if (b.action && !b.decision) {
    req.body = { decision: b.action, note: b.note || '' };
  }
  req.url = `/${req.params.id}/review`;
  canonicalWithdrawals.handle(req, res, next);
});

// ---------- /api/v1/tokenmarket compat (admin oversight) ----------
const tokenmarketCompat = express.Router();
tokenmarketCompat.use(authRequired);

tokenmarketCompat.get('/admin/listings', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin', 'finance', 'support']))) return res.status(403).json({ error: 'staff_only' });
    const r = await getPool().query(
      `select l.*, u.email as seller_email from token_listings l join users u on u.id=l.seller_id order by l.created_at desc limit 100`);
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

tokenmarketCompat.post('/admin/listings/:id/decision', async (req, res, next) => {
  try {
    if (!(await hasRole(req.user.id, ['super_admin', 'finance']))) return res.status(403).json({ error: 'finance_only' });
    const b = z.object({ approve: z.boolean(), reason: z.string().max(500).optional().default('') }).parse(req.body);
    const pool = getPool();
    const l = await pool.query(`select * from token_listings where id=$1`, [req.params.id]);
    if (!l.rowCount) return res.status(404).json({ error: 'not_found' });
    if (b.approve === false) {
      if (!['open', 'partial'].includes(l.rows[0].status)) return res.status(409).json({ error: 'bad_state', status: l.rows[0].status });
      await pool.query(`update token_listings set status='cancelled', updated_at=now() where id=$1`, [req.params.id]);
      await audit(req.user.id, req.ip, 'tokenlisting.cancel', req.params.id, { reason: b.reason });
      return res.json({ ok: true, status: 'cancelled' });
    }
    await audit(req.user.id, req.ip, 'tokenlisting.stand', req.params.id, { reason: b.reason });
    res.json({ ok: true, status: l.rows[0].status });
  } catch (e) { next(e); }
});

module.exports = { tokensCompat, depositsCompat, withdrawalsCompat, tokenmarketCompat };
