// Idempotent seeds — safe to re-run. No secrets.
// The APPROVED compensation plan (stage limits/fees, commission categories + rates) is RECORDED
// here; every payout path stays DISABLED/gated until separately approved and funded.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const upsert = async (t, rows) => { for (const r of rows) await pool.query(t, r); };

  await pool.query(`insert into roles (name, description) values
    ('super_admin','Full platform control'),('finance','Reward/finance review'),
    ('support','Tickets + disputes'),('member','Default member'),('seller','Can list (flag-gated)')
    on conflict (name) do nothing`);
  await pool.query(`insert into permissions (key, description) values
    ('listings.moderate','Approve/reject listings'),('orders.review','Review evidence + confirm'),
    ('payouts.review','Approve/reject payouts'),('campaigns.manage','Create/approve campaigns'),
    ('commissions.configure','Version commission rules'),('content.manage','Edit CMS pages'),
    ('users.manage','Suspend/reactivate'),('settings.manage','Change platform settings')
    on conflict (key) do nothing`);

  await pool.query(`insert into service_fees (key, amount, currency, description, refund_policy) values
    ('registration', 0, 'USD', 'Community membership — covers onboarding + verification. Not an investment.', 'Refundable within 7 days if account never activated.')
    on conflict (key) do update set description=excluded.description`);

  // Commission proposal as INACTIVE versions — admin must explicitly activate with budget + basis
  await pool.query(`insert into commission_rules (version, level, rate_bps, basis, confirmation_days, active) values
    (1, 1, 500, 'eligible_verified_sales', 7, false),
    (1, 2, 300, 'eligible_verified_sales', 7, false),
    (1, 3, 200, 'eligible_verified_sales', 7, false)
    on conflict (version, level) do nothing`);

  // Stage A (3-day) / Stage B (5-day) as DRAFT, unfunded, payouts blocked
  await pool.query(`insert into reward_campaigns (name, description, status, qualifying_activity, reward_rate_bps) values
    ('Stage A — 3-day activity pilot', 'Proposed 3% activity reward. DISABLED: requires budget, funding source and approval. Never a return on deposits.', 'draft', 'qualifying_sales_revenue', 300),
    ('Stage B — 5-day activity pilot', 'Proposed 7% activity reward. DISABLED: requires budget, funding source and approval. Never a return on deposits.', 'draft', 'qualifying_sales_revenue', 700)
    on conflict (name) do nothing`);

  await pool.query(`insert into ledger_accounts (code, type, currency, description) values
    ('REV:service_fees','REVENUE','USD','Registration + service fee revenue'),
    ('REV:marketplace_fees','REVENUE','USD','Marketplace platform fees'),
    ('REV:marketplace_fees_NGN','REVENUE','NGN','Marketplace platform fees (NGN)'),
    ('LIAB:commissions_USD','LIABILITY','USD','Approved commission liabilities'),
    ('LIAB:rewards_USD','LIABILITY','USD','Approved reward liabilities'),
    ('LIAB:payouts_pending','LIABILITY','USD','Pending payout queue'),
    ('MEMO:member_volume_USD','MEMO','USD','Member-to-member volume record (not company money)'),
    ('MEMO:member_volume_NGN','MEMO','NGN','Member-to-member volume record (not company money)'),
    ('OPS:reward_funding','ASSET','USD','Documented company reward funding pool'),
    ('LIAB:sim_usdt','LIABILITY','USDT','Member SIM-USDT liability (simulated pilot balances)'),
    ('SIM:usdt_clearing','ASSET','USDT','Simulated USDT clearing account for token-marketplace settlement')
    on conflict (code) do nothing`);

  // ---- Token-marketplace pilot seeds (all DISABLED-by-default where financial) ----
  await pool.query(`insert into token_definitions (code, name, kind, total_supply, basis, rights, active) values
    ('TKX-SIM','TKX Simulated Token (SIMULATED — clearly labelled)','SIMULATED',10000000,'1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled','none — simulated participation record', true)
    on conflict (code) do update set name=excluded.name, basis=excluded.basis, rights=excluded.rights`);
  // Pricing v1: 100 bps/day simple => 700 bps term for 7d, 1400 bps term for 14d.
  await pool.query(`insert into pricing_rules (version, lock_days, rate_bps_per_day, basis, active) values
    (1, 7, 100, 'simple', true),
    (1, 14, 100, 'simple', true)
    on conflict (version, lock_days) do update set rate_bps_per_day=excluded.rate_bps_per_day, basis=excluded.basis, active=excluded.active`);
  // Stage 1-5: APPROVED plan limits + fees. upgrade_fee is the fee to LEAVE that stage
  // (stage 5 = 0 because the top stage cannot be left). req_cycles_* unchanged.
  await pool.query(`insert into stage_definitions (stage, name, min_buy, max_buy, req_cycles_7d, req_cycles_14d, upgrade_fee, renewal_fee) values
    (1, 'Entry', 50, 500, 0, 0, 100, 25),
    (2, 'Growth', 500, 2500, 6, 3, 250, 50),
    (3, 'Advancement', 2500, 10000, 6, 3, 600, 120),
    (4, 'Premium', 10000, 25000, 6, 3, 1500, 300),
    (5, 'Elite', 25000, 100000, 6, 3, 0, 600)
    on conflict (stage) do update set name=excluded.name, min_buy=excluded.min_buy, max_buy=excluded.max_buy, req_cycles_7d=excluded.req_cycles_7d, req_cycles_14d=excluded.req_cycles_14d, upgrade_fee=excluded.upgrade_fee, renewal_fee=excluded.renewal_fee`);
  // APPROVED plan: 8 named commission categories + rates (rate_bps = percent x 100).
  // Rows stay INACTIVE (active=false): the plan is recorded; payouts remain gated until
  // approval + funding. The on-conflict update deliberately NEVER touches `active`.
  await pool.query(`insert into commission_categories (id, name, description, rate_bps, active) values
    ('acquisition','Direct Customer Acquisition Reward','Gen 1 — 10% of eligible verified direct customer sales.',1000,false),
    ('marketplace_direct','Direct Marketplace Activity Commission','Gen 1 — 5% of eligible verified direct marketplace activity.',500,false),
    ('retention','Customer Retention Reward','Gen 1 & 2 — 3% retention reward on eligible verified sales.',300,false),
    ('advancement_recognition','Stage Advancement Recognition','Gen 1-3 — 4% recognition on eligible verified sales.',400,false),
    ('gen2','Second-Generation Marketplace Commission','Gen 2 — 3% of eligible verified marketplace sales.',300,false),
    ('gen3','Third-Generation Marketplace Commission','Gen 3 — 2% of eligible verified marketplace sales.',200,false),
    ('gen4','Fourth-Generation Marketplace Commission','Gen 4 — 1.5% of eligible verified marketplace sales.',150,false),
    ('gen5','Fifth-Generation Marketplace Commission','Gen 5 — 1% of eligible verified marketplace sales.',100,false)
    on conflict (id) do update set name=excluded.name, description=excluded.description, rate_bps=excluded.rate_bps`);

  const pages = ['home','about','how-it-works','marketplace','fees','referrals','rewards','faq','contact','terms','privacy','refunds','market-rules'];
  for (const slug of pages) {
    await pool.query(`insert into content_pages (slug, title, body) values ($1,$2,$3) on conflict (slug) do nothing`,
      [slug, slug.replace(/-/g, ' ').toUpperCase(), `Admin-editable content for ${slug}. No investment claims permitted.`]);
  }

  await pool.query(`insert into system_settings (key, value) values
    ('platform', '{"name":"TOCKINAX","company":"MMITPS INC","domain":"tockinax.com"}'),
    ('allowed_currencies', '["USD","NGN"]'),
    ('payout_policy', '{"min_usd":"10","dual_approval_ngn":500000,"schedule":"manual_review"}')
    on conflict (key) do nothing`);
  // APPROVED-PLAN RECORD ONLY: platform fees are recorded here but NOT enforced yet
  // (no purchase gating, no withdrawal deduction) until separately approved.
  await pool.query(`insert into system_settings (key, value) values
    ('platform_fees', '{"activation_usdt":"20","withdrawal_usdt":"1","transfer_usdt":"0"}')
    on conflict (key) do nothing`);
  await pool.query(`insert into feature_flags (key, enabled, description) values
    ('live_payments', false, 'Live money movement gate — needs legal + provider approval'),
    ('rewards_payouts', false, 'Company-funded reward payouts'),
    ('crypto_payouts', false, 'USDT/crypto transfers — needs network + legal + ops approval'),
    ('crypto_deposits', false, 'Crypto deposits'),
    ('seller_open', true, 'Allow seller applications (still admin-approved per listing)')
    on conflict (key) do update set description=excluded.description`);

  console.log('[seed] done. All financial incentives ship DISABLED.');
  await pool.end();
}
main().catch((e) => { console.error('[seed] failed:', e.message); process.exit(1); });
