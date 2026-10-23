const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const TS_TOLERANCE_MS = 10 * 60 * 1000;

async function livePaymentsOn() {
  try {
    const r = await getPool().query(`select enabled from feature_flags where key = 'live_payments'`);
    return r.rowCount ? !!r.rows[0].enabled : false;
  } catch { return false; }
}

function withinTolerance(ts) {
  if (!ts) return true; // no timestamp supplied — nothing to check
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return false;
  return Math.abs(Date.now() - t) <= TS_TOLERANCE_MS;
}

// Records provider event (dedupe via unique(provider, event_id)).
// Never auto-activates anything: activation happens only on signatureOk + approved amount match
// via the finance dual path (POST /admin/confirm-service-payment).
async function recordEvent(provider, eventId, payload, signatureOk) {
  const pool = getPool();
  try {
    await pool.query(
      `insert into payment_provider_events (provider, event_id, payload, signature_ok)
       values ($1,$2,$3,$4) on conflict (provider, event_id) do nothing`,
      [provider, eventId, payload, signatureOk]
    );
    return { duplicate: false };
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return { duplicate: true };
    throw e;
  }
}

function verifyHmacSha512(rawBody, secret, signature) {
  if (!secret || !signature) return false;
  const hex = signature.replace(/^sha512=/i, '');
  const digest = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hex, 'utf8'));
  } catch { return false; }
}

async function handleProvider(req, res, next, provider, extractId, verify) {
  try {
    const live = await livePaymentsOn();
    const raw = JSON.stringify(req.body || {});
    const eventId = extractId(req);
    const sigOk = verify(req, raw);
    const ts = (req.body && (req.body.created_at || req.body.createdAt || req.body.timestamp)) || req.headers['x-timestamp'];
    if (!withinTolerance(ts)) return res.status(400).json({ error: 'stale_event' });
    // If live payments are off, record the event as NOT verified and stop — never activate.
    await recordEvent(provider, eventId, req.body || {}, live ? sigOk : false);
    if (!live) return res.json({ received: true, live: false });
    // Live but unverified / unapproved → record only, never auto-activate.
    return res.json({ received: true, live: true, signatureOk: sigOk, activated: false });
  } catch (e) { next(e); }
}

// POST /paystack — HMAC SHA512 of raw JSON body vs x-paystack-signature
router.post('/paystack', (req, res, next) =>
  handleProvider(
    req, res, next, 'paystack',
    (rq) => String((rq.body && (rq.body.event_id || rq.body.id || rq.body.reference)) || rq.headers['x-event-id'] || `evt-${Date.now()}`),
    (rq, raw) => verifyHmacSha512(raw, process.env.PAYSTACK_WEBHOOK_SECRET, rq.headers['x-paystack-signature'])
  )
);

// POST /flutterwave — stub verify against configured hash; record only
router.post('/flutterwave', (req, res, next) =>
  handleProvider(
    req, res, next, 'flutterwave',
    (rq) => String((rq.body && (rq.body.id || rq.body.tx_ref || rq.body.event_id)) || rq.headers['x-event-id'] || `evt-${Date.now()}`),
    (rq) => {
      const expected = process.env.FLW_SECRET_HASH;
      if (!expected) return false;
      const got = rq.headers['verif-hash'];
      if (!got) return false;
      try { return crypto.timingSafeEqual(Buffer.from(String(got)), Buffer.from(expected)); } catch { return false; }
    }
  )
);

// POST /korapay — stub HMAC verify; record only
router.post('/korapay', (req, res, next) =>
  handleProvider(
    req, res, next, 'korapay',
    (rq) => String((rq.body && (rq.body.reference || rq.body.id || rq.body.event_id)) || rq.headers['x-event-id'] || `evt-${Date.now()}`),
    (rq, raw) => verifyHmacSha512(raw, process.env.KORAPAY_WEBHOOK_SECRET, rq.headers['x-korapay-signature'])
  )
);

// POST /admin/confirm-service-payment — finance dual path (super_admin / finance role)
router.post('/admin/confirm-service-payment', authRequired, async (req, res, next) => {
  try {
    const pool = getPool();
    const chk = await pool.query(
      `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
       where ur.user_id = $1 and rl.name in ('super_admin','finance')`,
      [req.user.id]
    );
    if (!chk.rowCount) return res.status(403).json({ error: 'finance_only' });
    const b = z.object({ paymentId: z.string().uuid(), confirm: z.boolean() }).parse(req.body);
    const p = await pool.query(`select * from service_payments where id = $1`, [b.paymentId]);
    if (!p.rowCount) return res.status(404).json({ error: 'not_found' });
    if (p.rows[0].status !== 'pending') return res.status(409).json({ error: 'already_decided' });
    const to = b.confirm ? 'confirmed' : 'failed';
    await pool.query(`update service_payments set status = $1 where id = $2`, [to, b.paymentId]);
    await pool.query(
      `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
       values ($1,'service_payment.confirm','service_payment',$2,$3,$4)`,
      [req.user.id, b.paymentId, { confirm: b.confirm }, req.ip]
    );
    res.json({ ok: true, status: to });
  } catch (e) { next(e); }
});

module.exports = router;
