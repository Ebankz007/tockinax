// Eligible payout balance for member commission/reward payouts.
//
// Commission and reward calculation rows stay `payable` after a payout is
// requested or paid, so the available balance is the sum of payable rows MINUS
// every outstanding/settled payout request (requested..paid). Rejected, failed,
// cancelled and reversed requests release their amount back to the member.
//
// Insurance-claim payouts are a different `kind` and currency (USDT) and are
// never netted against commission/reward eligibility.
const { Decimal } = require('decimal.js');
const { getPool } = require('./db');

async function eligibleBalance(userId, currency, excludePayoutId = null, client = null) {
  const q = client || getPool();
  const r = await q.query(
    `select coalesce(sum(amount),0)::text as bal from (
       select amount from commission_calculations
         where beneficiary_id = $1 and status = 'payable' and currency = $2
       union all
       select amount from reward_calculations rc
         join reward_campaigns c on c.id = rc.campaign_id
         where rc.user_id = $1 and rc.status = 'payable' and rc.currency = $2
           and c.status = 'completed'
       union all
       select -amount from payout_requests
         where user_id = $1 and currency = $2
           and kind in ('commission','reward')
           and status in ('requested','under_review','approved','processing','paid')
           and ($3::uuid is null or id <> $3::uuid)
     ) s`,
    [userId, currency, excludePayoutId]
  );
  return new Decimal(r.rows[0].bal);
}

module.exports = { eligibleBalance };
