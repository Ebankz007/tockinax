// Fraud heuristics — detection only. Never auto-suspends; flags for staff review.
const { getPool } = require('./db');

async function flag(kind, userId, orderId, detail) {
  await getPool().query(
    `insert into fraud_risk_events (kind, user_id, order_id, detail) values ($1,$2,$3,$4)`,
    [kind, userId || null, orderId || null, detail || {}]
  );
}

async function detectForUser(userId, context = {}) {
  const pool = getPool();
  const events = [];
  const push = async (kind, detail) => {
    await flag(kind, userId, context.orderId || null, detail);
    events.push({ kind, detail });
  };

  // 1. Self-referral attempt (user referred by themselves, or ancestor == self)
  try {
    const self = await pool.query(
      `select 1 from referral_closure where descendant_id = $1 and ancestor_id = $1 limit 1`,
      [userId]
    );
    const row = await pool.query(`select referred_by from users where id = $1`, [userId]);
    if (self.rowCount || (row.rowCount && row.rows[0].referred_by === userId)) {
      await push('self_referral', { userId });
    }
  } catch { /* table may be unseeded in dev */ }

  // 2. Duplicate phone / device across accounts
  try {
    const me = await pool.query(`select phone from user_profiles where user_id = $1`, [userId]);
    const phone = me.rowCount ? me.rows[0].phone : null;
    if (phone) {
      const dup = await pool.query(
        `select count(*)::int as n from user_profiles where phone = $1 and user_id != $2`,
        [phone, userId]
      );
      if (dup.rows[0].n > 0) await push('duplicate_phone', { phone, matches: dup.rows[0].n });
    }
    if (context.deviceId) {
      const dd = await pool.query(
        `select count(distinct user_id)::int as n from user_sessions where user_agent = $1 and user_id != $2`,
        [String(context.deviceId), userId]
      ).catch(() => ({ rows: [{ n: 0 }] }));
      if (dd.rows[0].n > 0) await push('shared_device', { device: 'redacted', matches: dd.rows[0].n });
    }
  } catch { /* best-effort */ }

  // 3. Wash-trade velocity: orders where the user's network trades with itself (>5 in 1h)
  try {
    const w = await pool.query(
      `select count(*)::int as n from orders
       where created_at > now() - interval '1 hour'
       and (buyer_id = $1 or seller_id = $1)
       and buyer_id in (select descendant_id from referral_closure where ancestor_id = $1
                        union select $1) 
       and seller_id in (select descendant_id from referral_closure where ancestor_id = $1
                         union select $1)`,
      [userId]
    ).catch(async () => pool.query(
      `select count(*)::int as n from orders
       where created_at > now() - interval '1 hour' and (buyer_id = $1 or seller_id = $1)`,
      [userId]
    ));
    if (w.rows[0].n > 5) await push('wash_trade_velocity', { ordersLastHour: w.rows[0].n });
  } catch { /* best-effort */ }

  // 4. Rapid dispute / evidence churn (optional context-driven)
  try {
    if (context.orderId) {
      const d = await pool.query(
        `select count(*)::int as n from disputes where opened_by = $1 and created_at > now() - interval '24 hours'`,
        [userId]
      );
      if (d.rows[0].n > 3) await push('dispute_churn', { disputes24h: d.rows[0].n });
    }
  } catch { /* best-effort */ }

  return events;
}

module.exports = { detectForUser };
