const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { signAccess, signRefresh, authRequired } = require('../middleware/auth');
const speakeasy = require('speakeasy');

const router = express.Router();
const TERMS_VERSION = '2026.10-v1';

const regSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(10).max(128),
  displayName: z.string().min(2).max(120).optional(),
  referralCode: z.string().min(1).max(16),
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
    console.log('LOGIN DEBUG: req.body =', JSON.stringify(req.body), 'type =', typeof req.body);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
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
    // If 2FA is enabled, do not issue tokens yet — require TOTP validation first.
    if (u.mfa_enabled) {
      const challenge = crypto.randomBytes(16).toString('hex');
      await pool.query(
        `insert into user_sessions (user_id, refresh_hash, ip, user_agent, expires_at)
         values ($1,$2,$3,$4, now()+interval '10 minutes')`,
        [u.id, `2fa:${challenge}`, req.ip, req.headers['user-agent']]);
      return res.status(200).json({
        mfa_required: true,
        userId: u.id,
        email: u.email,
        challenge,
        next: 'verify_2fa',
      });
    }
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
  const r = await pool.query(`select u.id, u.email, u.status, u.referral_code, p.display_name, u.mfa_enabled from users u left join user_profiles p on p.user_id=u.id where u.id=$1`, [req.user.id]);
  const roles = await pool.query(`select rl.name from roles rl join user_roles ur on ur.role_id=rl.id where ur.user_id=$1`, [req.user.id]);
  res.json({ ...r.rows[0], roles: roles.rows.map(x => x.name) });
});

// POST /auth/refresh — exchange a valid refresh token for a new access token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh } = z.object({ refresh: z.string().min(1) }).parse(req.body);
    const pool = getPool();
    const rHash = crypto.createHash('sha256').update(refresh).digest('hex');
    const s = await pool.query(`select s.user_id, u.email, u.status from user_sessions s join users u on u.id=s.user_id where s.refresh_hash=$1 and s.expires_at > now()`, [rHash]);
    if (!s.rowCount) return res.status(401).json({ error: 'invalid_refresh' });
    const session = s.rows[0];
    if (['suspended', 'banned'].includes(session.status)) return res.status(403).json({ error: 'account_blocked' });
    const user = { id: session.user_id, email: session.email };
    const access = signAccess(user);
    res.cookie('tockinax_at', access, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.json({ access });
  } catch (e) { next(e); }
});

// ---- 2FA (TOTP) ----

// POST /auth/2fa/setup — generate secret + QR URI (requires auth)
router.post('/2fa/setup', authRequired, async (req, res, next) => {
  try {
    const pool = getPool();
    const secret = speakeasy.generateSecret({ length: 32, name: `TOCKINAX (${req.user.email})` });
    // Store secret unconfirmed until user verifies with a valid code
    await pool.query(`update users set mfa_secret=$1 where id=$2`, [secret.base32, req.user.id]);
    const otpauth = speakeasy.otpauthURL({
      secret: secret.base32,
      label: req.user.email,
      issuer: 'TOCKINAX',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    res.json({ secret: secret.base32, qrUri: otpauth });
  } catch (e) { next(e); }
});

// POST /auth/2fa/verify — verify TOTP code and enable mfa (requires auth + setup)
router.post('/2fa/verify', authRequired, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const pool = getPool();
    const u = await pool.query(`select mfa_secret from users where id=$1`, [req.user.id]);
    if (!u.rowCount || !u.rows[0].mfa_secret) return res.status(400).json({ error: 'no_setup' });
    const verified = speakeasy.totp.verify({
      secret: u.rows[0].mfa_secret,
      encoding: 'base32',
      token,
    });
    if (!verified) return res.status(400).json({ error: 'invalid_code' });
    await pool.query(`update users set mfa_enabled=true where id=$1`, [req.user.id]);
    await pool.query(`insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,'2fa.enable','user',$2,'{}',$3)`,
      [req.user.id, req.user.id, req.ip]);
    res.json({ ok: true, mfa_enabled: true });
  } catch (e) { next(e); }
});

// POST /auth/2fa/disable — disable mfa (requires auth + valid current code)
router.post('/2fa/disable', authRequired, async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const pool = getPool();
    const u = await pool.query(`select mfa_secret, mfa_enabled from users where id=$1`, [req.user.id]);
    if (!u.rowCount || !u.rows[0].mfa_enabled) return res.status(400).json({ error: 'mfa_not_enabled' });
    const verified = speakeasy.totp.verify({
      secret: u.rows[0].mfa_secret,
      encoding: 'base32',
      token,
    });
    if (!verified) return res.status(400).json({ error: 'invalid_code' });
    await pool.query(`update users set mfa_enabled=false, mfa_secret=null where id=$1`, [req.user.id]);
    await pool.query(`insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,'2fa.disable','user',$2,'{}',$3)`,
      [req.user.id, req.user.id, req.ip]);
    res.json({ ok: true, mfa_enabled: false });
  } catch (e) { next(e); }
});

// POST /auth/2fa/validate — validate TOTP during login flow, issue tokens
router.post('/2fa/validate', async (req, res, next) => {
  try {
    const { userId, token, challenge } = z.object({
      userId: z.string().uuid(),
      token: z.string().regex(/^\d{6}$/),
      challenge: z.string().min(16),
    }).parse(req.body);

    const pool = getPool();
    // Find the 2FA session created during login
    const s = await pool.query(`select id, user_id, refresh_hash, expires_at from user_sessions
      where user_id=$1 and refresh_hash like '2fa:%' and expires_at > now() order by created_at desc limit 1`, [userId]);
    if (!s.rowCount) return res.status(401).json({ error: 'challenge_expired' });
    const session = s.rows[0];
    const storedChallenge = session.refresh_hash.replace(/^2fa:/, '');

    if (storedChallenge !== challenge) return res.status(401).json({ error: 'invalid_challenge' });

    const u = await pool.query(`select mfa_secret from users where id=$1`, [userId]);
    if (!u.rowCount || !u.rows[0].mfa_secret) return res.status(400).json({ error: 'no_mfa' });

    const verified = speakeasy.totp.verify({
      secret: u.rows[0].mfa_secret,
      encoding: 'base32',
      token,
    });
    if (!verified) return res.status(400).json({ error: 'invalid_code' });

    // Issue real tokens, clean up the 2FA session
    const userRow = await pool.query(`select id, email from users where id=$1`, [userId]);
    const user = userRow.rows[0];
    await pool.query(`delete from user_sessions where id=$1`, [session.id]);
    const sid = crypto.randomUUID();
    const refresh = signRefresh(user, sid);
    const rHash = crypto.createHash('sha256').update(refresh).digest('hex');
    await pool.query(`insert into user_sessions (user_id, refresh_hash, ip, user_agent, expires_at) values ($1,$2,$3,$4, now()+interval '7 days')`, [user.id, rHash, req.ip, req.headers['user-agent']]);
    res.cookie('tockinax_at', signAccess(user), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.json({ access: signAccess(user), refresh, mfa_validated: true });
  } catch (e) { next(e); }
});

// POST /auth/forgot-password — send password reset link (always returns 200 to prevent email enumeration)
router.post('/forgot-password', async (req, res, next) => {
  try {
    const b = z.object({ email: z.string().email() }).parse(req.body);
    const pool = getPool();
    const u = await pool.query(`select id, email from users where lower(email)=$1`, [b.email.toLowerCase()]);
    if (u.rowCount) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await pool.query(`insert into password_resets (user_id, token_hash, expires_at) values ($1,$2,$3) on conflict (user_id) do update set token_hash=$2, expires_at=$3`, [u.rows[0].id, resetHash, expiresAt]);
      console.log(`[password reset] ${b.email}: token=${resetToken.slice(0, 8)}… (dev log only)`);
    }
    // Always return success to prevent email enumeration
    res.json({ ok: true, message: 'If an account exists with this email, a reset link has been sent.' });
  } catch (e) { next(e); }
});

// POST /auth/change-password — require current password, set a new one
  try {
    const b = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(10).max(128),
    }).parse(req.body);

    const pool = getPool();
    const u = await pool.query(`select password_hash from users where id=$1`, [req.user.id]);
    if (!u.rowCount) return res.status(404).json({ error: 'not_found' });

    const ok = await bcrypt.compare(b.current_password, u.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_current_password' });

    const hash = await bcrypt.hash(b.new_password, 12);
    await pool.query(`update users set password_hash=$1 where id=$2`, [hash, req.user.id]);

    await pool.query(`insert into audit_logs (actor_id, action, target_type, target_id, diff, ip) values ($1,'auth.change_password','user',$2,'{}',$3)`,
      [req.user.id, req.user.id, req.ip]);

    res.json({ ok: true, message: 'Password changed successfully' });
  } catch (e) { next(e); }
});

// POST /auth/logout — clear the auth cookie
router.post('/logout', authRequired, async (req, res, next) => {
  try {
    res.clearCookie('tockinax_at', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
