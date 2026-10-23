const express = require('express');
const { z } = require('zod');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_CURRENCIES = ['USD', 'NGN'];

// PUBLIC — no auth
router.get('/pages/:slug', async (req, res, next) => {
  try {
    const r = await getPool().query(`select slug, title, body, updated_at from content_pages where slug = $1`, [
      req.params.slug,
    ]);
    if (!r.rowCount) return res.status(404).json({ error: 'page_not_found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUBLIC settings summary — never leaks secrets
router.get('/settings/public', async (req, res, next) => {
  try {
    const pool = getPool();
    let settings = {};
    let flags = {};
    try {
      const s = await pool.query(`select key, value from system_settings`);
      for (const row of s.rows) settings[row.key] = row.value;
      const f = await pool.query(`select key, enabled from feature_flags`);
      for (const row of f.rows) flags[row.key] = row.enabled;
    } catch { /* tables may be unseeded — fall back to defaults */ }
    res.json({
      platformName: (settings.branding && settings.branding.platformName) || 'TOCKINAX',
      company: (settings.branding && settings.branding.company) || 'MMITPS INC',
      domain: (settings.branding && settings.branding.domain) || null,
      allowedCurrencies: ALLOWED_CURRENCIES,
      fees: settings.fees || { registration: null, seller_activation: null, marketplace: null, note: 'see /api/v1/marketplace/fees' },
      rewards_disabled: flags.rewards_enabled === true ? false : true,
      crypto_disabled: flags.crypto_enabled === true ? false : true,
      payoutsEnabled: flags.payouts_enabled === true,
    });
  } catch (e) { next(e); }
});

// Admin upsert — super_admin only
router.put('/pages/:slug', authRequired, async (req, res, next) => {
  try {
    const pool = getPool();
    const chk = await pool.query(
      `select 1 from user_roles ur join roles rl on rl.id = ur.role_id
       where ur.user_id = $1 and rl.name = 'super_admin'`,
      [req.user.id]
    );
    if (!chk.rowCount) return res.status(403).json({ error: 'admin_only' });
    const b = z.object({
      title: z.string().min(3).max(160),
      body: z.string().max(50000),
    }).parse(req.body);
    const r = await pool.query(
      `insert into content_pages (slug, title, body, updated_by) values ($1,$2,$3,$4)
       on conflict (slug) do update set title = excluded.title, body = excluded.body,
       updated_by = excluded.updated_by, updated_at = now() returning *`,
      [req.params.slug, b.title, b.body, req.user.id]
    );
    await pool.query(
      `insert into audit_logs (actor_id, action, target_type, target_id, diff, ip)
       values ($1,'content.upsert','page',$2,$3,$4)`,
      [req.user.id, req.params.slug, { title: b.title }, req.ip]
    );
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
