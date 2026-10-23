const express = require('express');
const { getPool } = require('../lib/db');
const { authRequired } = require('../middleware/auth');
const router = express.Router();
router.use(authRequired);

// GET /rewards/campaigns — Stage A/B visible but DISABLED until approved+funded
router.get('/campaigns', async (_req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`select id, name, description, status, starts_at, ends_at, qualifying_activity, reward_rate_bps, budget_cap, funding_source is not null as funded from reward_campaigns order by created_at`);
    res.json(r.rows.map(c => ({ ...c, payoutsEnabled: false, note: 'Disabled by default. Requires budget + funding source + formal approval. Rates are NOT returns on deposits.' })));
  } catch (e) { next(e); }
});

// POST /rewards/claim — always 409 until campaign Active + funded + eligible
router.post('/claim', async (req, res, next) => {
  try {
    const pool = getPool();
    const flag = await pool.query(`select enabled from feature_flags where key='rewards_payouts'`);
    if (!flag.rows[0]?.enabled) return res.status(409).json({ error: 'rewards_disabled', message: 'Reward payouts are disabled until campaigns are approved and funded.' });
    return res.status(409).json({ error: 'not_eligible', message: 'No payable reward found for current period.' });
  } catch (e) { next(e); }
});
module.exports = router;
