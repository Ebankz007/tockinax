const express = require('express');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

// GET /referrals/me — network + eligibility (privacy-scoped: counts + direct list only)
router.get('/me', async (req, res, next) => {
  try {
    const pool = getPool();
    const me = await pool.query(`select referral_code from users where id=$1`, [req.user.id]);
    const direct = await pool.query(`select u.id, u.email, u.status, r.created_at from referrals r join users u on u.id=r.descendant_id where r.ancestor_id=$1 and r.depth=1`, [req.user.id]);
    const byLevel = await pool.query(`select depth as level, count(*)::int as n from referral_closure where ancestor_id=$1 group by depth order by depth`, [req.user.id]);
    const comms = await pool.query(`select level, status, sum(amount)::text as total, currency from commission_calculations where beneficiary_id=$1 group by level, status, currency`, [req.user.id]);
    res.json({
      referralCode: me.rows[0].referral_code,
      referralUrl: `${process.env.APP_URL || ''}/register?ref=${me.rows[0].referral_code}`,
      direct: direct.rows.map(r => ({ id: r.id, status: r.status, joined: r.created_at })),
      byLevel: byLevel.rows,
      commissions: comms.rows,
      policy: 'Commissions pay ONLY on eligible verified sales after confirmation period. Registration fees, deposits and member transfers never qualify.',
    });
  } catch (e) { next(e); }
});
module.exports = router;
