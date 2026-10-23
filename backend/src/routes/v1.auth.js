const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { signAccess, signRefresh, authRequired } = require('../middleware/auth');

const router = express.Router();
const TERMS_VERSION = '2026.10-v1';

const regSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  displayName: z.string().min(2).max(120).optional(),
  referralCode: z.string().max(16).optional(),
  acceptTerms: z.literal(true),
});

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const body = regSchema.parse(req.body);
    const pool = getPool();
    const email = body.email.toLowerCase().trim();
    const dup = await pool.query(`select 1 from users where lower(email)=$1`, [email]);
    if (dup.rowCount) return res.status(409).json({ error: 'duplicate', message: 'An account with this email already exists.' });

    let referrer = null;
    if (body.referralCode) {
      const r = await pool.query(`select id from users where referral_code=$1`, [body.referralCode.toUpperCase()]);
      if (!r.rows.length) return res.status(400).json({ error: 'bad_referral', message: 'Referral code not found.' });
      referrer = r.rows[0];
      // self-referral impossible here (no account yet) — additional device/duplicate guards in Phase 4 fraud job
    }

    const hash = await bcrypt.hash(body.password, 12);
    const code = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyHash = crypto.createHash('sha256').update(verifyToken).digest('hex');

    // Member number: TKX- + 8 hex upper, unique with retry (column may not exist pre-migration -> fallback without it)
    let u = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const memberNo = 'TKX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      try {
        u = await pool.query(
          `insert into users (email, password_hash, status, referral_code, referred_by, terms_version, terms_accepted_at, member_no)
           values ($1,$2,'pending_email',$3,$4,$5,now(),$6) returning id, email, referral_code, member_no`,
          [email, hash, code, referrer?.id || null, TERMS_VERSION, memberNo]);
        break;
      } catch (e) {
        if (e.code === '23505' && /member_no/i.test(e.constraint || e.message || '')) continue; // collision -> retry
        if (e.code === '42703') { // column missing pre-migration -> legacy insert
          u = await pool.query(
            `insert into users (email, password_hash, status, referral_code, referred_by, terms_version, terms_accepted_at)
             values ($1,$2,'pending_email',$3,$4,$5,now()) returning id, email, referral_code`,
            [email, hash, code, referrer?.id || null, TERMS_VERSION]);
          break;
        }
        throw e;
      }
    }
    if (!u) return res.status(409).json({ error: 'member_no_collision', message: 'Please retry registration.' });
    const userId = u.rows[0].id;
    await pool.query(`insert into user_profiles (user_id, display_name) values ($1,$2)`, [userId, body.displayName || null]);
    await pool.query(`insert into consent_records (user_id, doc, version, ip) values ($1,'terms',$2,$3),($1,'privacy',$2,$3)`, [userId, TERMS_VERSION, req.ip]);
    await pool.query(`insert into identity_checks (user_id, kind, status, evidence_ref) values ($1,'email','pending',$2)`, [userId, verifyHash]);
    if (referrer) {
      await pool.query(`insert into referrals (ancestor_id, descendant_id, depth) values ($1,$2,1) on conflict do nothing`, [referrer.id, userId]);
      await pool.query(`insert into referral_closure (ancestor_id, descendant_id, depth) values ($1,$2,1) on conflict do nothing`, [referrer.id, userId]);
      // depth 2..5 roll-up from referrer's ancestors
      await pool.query(
        `insert into referral_closure (ancestor_id, descendant_id, depth)
         select ancestor_id, $2, depth+1 from referral_closure where descendant_id=$1 and depth < 5
         on conflict do nothing`, [referrer.id, userId]);
    }
    // Transparent fee disclosure (default 0 until admin configures)
    const fee = await pool.query(`select key, amount, currency, description, refund_policy from service_fees where key='registration' and active=true`);
    console.log(`[mail stub] verify ${email}: token=${verifyToken.slice(0, 8)}… (dev log only)`);
    res.status(201).json({
      user: u.rows[0],
      termsVersion: TERMS_VERSION,
      fee: fee.rows[0] || { key: 'registration', amount: '0', currency: 'USD', description: 'Community membership — no investment.', refund_policy: '' },
      next: 'verify_email',
      // dev-only: never return real tokens in production
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyToken: verifyToken } : {}),
    });
  } catch (e) { next(e); }
});

// POST /api/v1/auth/verify-email { email, token }
router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, token } = z.object({ email: z.string().email(), token: z.string().min(16) }).parse(req.body);
    const pool = getPool();
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const chk = await pool.query(`select u.id from users u join identity_checks c on c.user_id=u.id where lower(u.email)=$1 and c.kind='email' and c.evidence_ref=$2`, [email.toLowerCase(), hash]);
    if (!chk.rowCount) return res.status(400).json({ error: 'invalid_token' });
    await pool.query(`update users set status='pending_verification', email_verified_at=now() where id=$1`, [chk.rows[0].id]);
    await pool.query(`update identity_checks set status='passed' where user_id=$1 and kind='email'`, [chk.rows[0].id]);
    res.json({ ok: true, next: 'complete_verification_then_activate' });
  } catch (e) { next(e); }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const pool = getPool();
    const r = await pool.query(`select * from users where lower(email)=$1`, [email.toLowerCase()]);
    if (!r.rowCount) return res.status(401).json({ error: 'invalid_credentials' });
    const u = r.rows[0];
    if (u.locked_until && new Date(u.locked_until) > new Date()) return res.status(423).json({ error: 'locked' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      await pool.query(`update users set failed_logins=failed_logins+1, locked_until=case when failed_logins>=9 then now()+interval '30 minutes' else locked_until end where id=$1`, [u.id]);
      // Audit log on lock: re-read counter; record lockout event (best-effort, never blocks response).
      try {
        const chk = await pool.query(`select failed_logins, locked_until from users where id=$1`, [u.id]);
        if (chk.rows[0] && chk.rows[0].locked_until && new Date(chk.rows[0].locked_until) > new Date()) {
          await pool.query(
            `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,'auth.lockout','user',$2,$3,$4)`,
            [u.id, String(u.id), { failed_logins: chk.rows[0].failed_logins, locked_until: chk.rows[0].locked_until }, req.ip]);
          await pool.query(
            `insert into fraud_risk_events (kind, user_id, detail) values ('login_lockout',$1,$2)`,
            [u.id, { failed_logins: chk.rows[0].failed_logins, ip: req.ip }]);
        }
      } catch {}
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    await pool.query(`update users set failed_logins=0 where id=$1`, [u.id]);
    const sid = crypto.randomUUID();
    const refresh = signRefresh(u, sid);
    const rHash = crypto.createHash('sha256').update(refresh).digest('hex');
    await pool.query(`insert into user_sessions (user_id, refresh_hash, ip, user_agent, expires_at) values ($1,$2,$3,$4, now()+interval '7 days')`, [u.id, rHash, req.ip, req.headers['user-agent']]);
    res.cookie('tockinax_at', signAccess(u), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.json({ access: signAccess(u), refresh, referralCode: u.referral_code, status: u.status });
  } catch (e) { next(e); }
});

router.get('/me', authRequired, async (req, res) => {
  const pool = getPool();
  const r = await pool.query(`select u.id, u.email, u.status, u.referral_code, p.display_name from users u left join user_profiles p on p.user_id=u.id where u.id=$1`, [req.user.id]);
  res.json(r.rows[0]);
});

module.exports = router;
