// Idempotent seeds — safe to re-run. No secrets.
// The APPROVED compensation plan (stage limits/fees, commission categories + rates) is RECORDED
// here; every payout path stays DISABLED/gated until separately approved and funded.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Schema gatedp2p is pinned. Set it per-connection so this works on a fresh DB
// (CI) that has no role/database-level search_path default.
pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
  const upsert = async (t, rows) => { for (const r of rows) await pool.query(t, r); };

  await pool.query(`insert into roles (name, description) values
    ('super_admin','Full platform control'),('finance','Reward/finance review'),
    ('support','Tickets + disputes'),('member','Default member'),('seller','Can list (flag-gated)')
    on conflict (name) do nothing`);
  await pool.query(`insert into permissions (key, description) values
    ('users.manage','Create, suspend, reactivate users'),
    ('users.create','Create new user accounts'),
    ('roles.manage','Create/assign roles and permissions'),
    ('permissions.manage','Manage permission definitions'),
    ('listings.moderate','Approve/reject listings'),
    ('orders.review','Review evidence + confirm orders'),
    ('payouts.review','Approve/reject payouts'),
    ('campaigns.manage','Create/approve campaigns'),
    ('commissions.configure','Version commission rules'),
    ('content.manage','Edit CMS pages'),
    ('settings.manage','Change platform settings'),
    ('insurance.manage','Manage insurance policies and claims'),
    ('token.manage','Manage token definitions and pricing'),
    ('community.manage','Moderate testimonials, social submissions, weekly competitions and bonus awards')
    on conflict (key) do nothing`);

  // Grant all permissions to super_admin; scoped permissions to other roles
  await pool.query(`
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p where r.name='super_admin'
    on conflict (role_id, permission_id) do nothing`);
  await pool.query(`
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
    where r.name='finance' and p.key in ('payouts.review','orders.review','content.manage','insurance.manage','community.manage')
    on conflict (role_id, permission_id) do nothing`);
  await pool.query(`
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
    where r.name='support' and p.key in ('listings.moderate','orders.review','content.manage')
    on conflict (role_id, permission_id) do nothing`);
  await pool.query(`
    insert into role_permissions (role_id, permission_id)
    select r.id, p.id from roles r, permissions p
    where r.name='seller' and p.key in ('listings.moderate')
    on conflict (role_id, permission_id) do nothing`);

  // Approved plan: $20 USDT registration, split $5 direct / $2 gen-2 / $1 gen-3 /
  // $2 leadership pool / $2 transaction charges / $8 administration.
  await pool.query(`insert into service_fees (key, amount, currency, description, refund_policy) values
    ('registration', 20, 'USDT', 'USDT membership registration — $5 direct referral, $2 second generation, $1 third generation, $2 leadership pool, $2 transaction charges, $8 administration. Not an investment.', 'Refundable within 7 days if account never activated.')
    on conflict (key) do update set amount=excluded.amount, currency=excluded.currency, description=excluded.description`);

  // Commission proposal as INACTIVE versions — admin must explicitly activate with budget + basis.
  // Version 2 records the approved plan's three-generation registration rewards:
  // $5 / $20 = 2500 bps, $2 / $20 = 1000 bps, $1 / $20 = 500 bps.
  await pool.query(`insert into commission_rules (version, level, rate_bps, basis, confirmation_days, active) values
    (1, 1, 500, 'eligible_verified_sales', 7, false),
    (1, 2, 300, 'eligible_verified_sales', 7, false),
    (1, 3, 200, 'eligible_verified_sales', 7, false),
    (2, 1, 2500, 'eligible_registration', 7, false),
    (2, 2, 1000, 'eligible_registration', 7, false),
    (2, 3, 500, 'eligible_registration', 7, false)
    on conflict (version, level) do update set rate_bps=excluded.rate_bps, basis=excluded.basis`);

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
    ('LIAB:sim_usdt','LIABILITY','USDT','Member balance liability (pre-live balances)'),
    ('SIM:usdt_clearing','ASSET','USDT','Simulated USDT clearing account for token-marketplace settlement'),
    ('REV:insurance_premiums','REVENUE','USDT','Insurance premium revenue'),
    ('REV:insurance_reserve','REVENUE','USDT','Insurance claim reserve'),
    ('LIAB:insurance_claims','LIABILITY','USDT','Approved insurance claim liability pending payout'),
    ('REV:settlement_fees','REVENUE','USDT','10% company-funded settlement charge on profit'),
    ('EXP:community_bonuses','EXPENSE','USDT','Weekly community bonus expense (testimonial + referral competitions)'),
    ('OPS:community_bonus_funding','ASSET','USDT','Documented funding pool for weekly community bonuses')
    on conflict (code) do nothing`);

  // ---- Token-marketplace pilot seeds (all DISABLED-by-default where financial) ----
  await pool.query(`insert into token_definitions (code, name, kind, total_supply, basis, rights, active) values
    ('TKX','TKX Token (standard)','STANDARD',10000000,'1 TKX = 1 USDT at mint/purchase; off-platform transfers disabled','none — participation record', true)
    on conflict (code) do update set name=excluded.name, basis=excluded.basis, rights=excluded.rights`);
  // Retired legacy token code. The pilot token is TKX only. Delete the stale
  // `TKX-SIM` definition when nothing references it; otherwise deactivate it so
  // historical holdings keep a valid FK target. Never touches TKX.
  await pool.query(`delete from token_definitions d
    where d.code = 'TKX-SIM'
      and not exists (select 1 from token_holdings h where h.token_code = d.code)`);
  await pool.query(`update token_definitions set active = false where code = 'TKX-SIM'`);
  // Pricing v1 — approved plan: 7d 0.60%/day (4.20%), 14d 0.75%/day (10.50%),
  // 30d 1.00%/day (30.00%). All simple (non-compounded).
  await pool.query(`insert into pricing_rules (version, lock_days, rate_bps_per_day, basis, active) values
    (1, 7, 60, 'simple', true),
    (1, 14, 75, 'simple', true),
    (1, 30, 100, 'simple', true)
    on conflict (version, lock_days) do update set rate_bps_per_day=excluded.rate_bps_per_day, basis=excluded.basis, active=excluded.active`);
  // Stage 1-5: APPROVED plan ranges + entry fees. `upgrade_fee` is the fee to ENTER
  // that stage (Stage 1 = the $20 registration; Stage 2-5 = $25/$50/$100/$250).
  // The plan publishes no renewal fee, so renewal_fee stays NULL (blocked until disclosed).
  await pool.query(`insert into stage_definitions (stage, name, min_buy, max_buy, req_cycles_7d, req_cycles_14d, upgrade_fee, renewal_fee) values
    (1, 'Entry', 50, 500, 0, 0, 20, null),
    (2, 'Growth', 500.01, 2000, 0, 0, 25, null),
    (3, 'Advanced', 2000.01, 5000, 0, 0, 50, null),
    (4, 'Premium', 5000.01, 50000, 0, 0, 100, null),
    (5, 'Elite', 50000.01, 100000, 0, 0, 250, null)
    on conflict (stage) do update set name=excluded.name, min_buy=excluded.min_buy, max_buy=excluded.max_buy, req_cycles_7d=excluded.req_cycles_7d, req_cycles_14d=excluded.req_cycles_14d, upgrade_fee=excluded.upgrade_fee, renewal_fee=excluded.renewal_fee`);
  // APPROVED plan: three referral generations paid from each $20 registration:
  // $5 direct (2500 bps), $2 second generation (1000 bps), $1 third generation (500 bps).
  // Rows stay INACTIVE (active=false): the plan is recorded; payouts remain gated until
  // approval + funding. The on-conflict update deliberately NEVER touches `active`.
  await pool.query(`delete from commission_categories where id in
    ('acquisition','marketplace_direct','retention','advancement_recognition','gen2','gen3','gen4','gen5')`);
  await pool.query(`insert into commission_categories (id, name, description, rate_bps, active) values
    ('referral_gen1','Direct Referral Reward','Generation 1 — $5 of each eligible $20 registration.',2500,false),
    ('referral_gen2','Second-Generation Referral Reward','Generation 2 — $2 of each eligible $20 registration.',1000,false),
    ('referral_gen3','Third-Generation Referral Reward','Generation 3 — $1 of each eligible $20 registration.',500,false)
    on conflict (id) do update set name=excluded.name, description=excluded.description, rate_bps=excluded.rate_bps`);

  const pages = ['home','about','how-it-works','marketplace','fees','referrals','rewards','faq','contact','terms','privacy','refunds','market-rules','testimonials','community-rules'];
  for (const slug of pages) {
    await pool.query(`insert into content_pages (slug, title, body) values ($1,$2,$3) on conflict (slug) do nothing`,
      [slug, slug.replace(/-/g, ' ').toUpperCase(), `Admin-editable content for ${slug}. No investment claims permitted.`]);
  }

  await pool.query(`insert into system_settings (key, value) values
    ('platform', '{"name":"TOCKINAX","company":"TOCKINAX","domain":"tockinax.com"}'),
    ('allowed_currencies', '["USD","NGN"]'),
    ('payout_policy', '{"min_usd":"10","dual_approval_ngn":500000,"schedule":"manual_review"}')
    on conflict (key) do nothing`);
  // Branding correction: an early seed wrote company = "MMITPS INC". Fix only that
  // exact stale value and leave any admin-edited name/domain/company untouched.
  await pool.query(`update system_settings
    set value = jsonb_set(value, '{company}', to_jsonb('TOCKINAX'::text))
    where key = 'platform' and value->>'company' = 'MMITPS INC'`);
  // APPROVED-PLAN RECORD ONLY: platform fees are recorded here but NOT enforced yet
  // (no purchase gating, no withdrawal deduction) until separately approved.
  await pool.query(`insert into system_settings (key, value) values
    ('platform_fees', '{"activation_usdt":"20","withdrawal_usdt":"1","transfer_usdt":"0"}')
    on conflict (key) do nothing`);
  // Approved $20 registration allocation — recorded; fee collection stays gated.
  await pool.query(`insert into system_settings (key, value) values
    ('registration_fee_split', '{"direct":"5","gen2":"2","gen3":"1","leadership":"2","transaction":"2","administration":"8","total":"20"}')
    on conflict (key) do update set value=excluded.value`);
  // Approved lock terms and daily target rates (recorded; targets are not guarantees).
  await pool.query(`insert into system_settings (key, value) values
    ('lock_terms', '{"7":{"rate_per_day":"0.0060","term":"0.0420"},"14":{"rate_per_day":"0.0075","term":"0.1050"},"30":{"rate_per_day":"0.0100","term":"0.3000"}}')
    on conflict (key) do update set value=excluded.value`);
  await pool.query(`insert into feature_flags (key, enabled, description) values
    ('live_payments', false, 'Live money movement gate — needs legal + provider approval'),
    ('rewards_payouts', false, 'Company-funded reward payouts'),
    ('crypto_payouts', false, 'USDT/crypto transfers — needs network + legal + ops approval'),
    ('crypto_deposits', false, 'Crypto deposits'),
    ('seller_open', true, 'Allow seller applications (still admin-approved per listing)'),
    ('community_rewards', true, 'Public testimonials, social promotion and weekly leaderboards'),
    ('community_bonus_payouts', false, 'Weekly bonus ledger payouts — needs funded pool + admin approval')
    on conflict (key) do update set description=excluded.description`);

  // ---- Community & weekly rewards seeds (all monetary values default to 0) ----
  // Social media channels are NOT pre-populated with real-looking URLs: an admin
  // must configure the official accounts in the dashboard (Community & Rewards
  // Management -> Social Media). The table is empty on a fresh install until
  // configured; no placeholder URLs are shipped as company accounts.
  await pool.query(`insert into social_media_accounts (platform, label, url, enabled, sort_order) values
    ('telegram','Telegram','',true,1),
    ('youtube','YouTube','',true,2),
    ('x','X (Twitter)','',true,3),
    ('instagram','Instagram','',true,4),
    ('facebook','Facebook','',true,5)
    on conflict (platform) do nothing`);

  // Bonus configuration is admin-editable; the seed only guarantees a row exists.
  // Never overwrite an existing active configuration (an admin may have funded it).
  await pool.query(`insert into weekly_bonus_configurations
      (kind, active, pool_amount, currency, position_rewards, min_metric, approval_required,
       notification_settings, timezone, start_dow, start_time, end_dow, end_time, eligibility)
    values
      ('testimonial', true, 0, 'USDT', '{"1":"0","2":"0","3":"0","4":"0","5":"0"}', 10, true,
       '{"leaderboard_updates":true,"email":false,"public_amounts":true}', 'UTC', 1, '00:00', 0, '23:59',
       '{"require_active":true,"require_verified_email":false,"require_approved_testimonial":true}'),
      ('referral', true, 0, 'USDT', '{"1":"0","2":"0","3":"0","4":"0","5":"0"}', 1, true,
       '{"leaderboard_updates":true,"email":false,"public_amounts":true}', 'UTC', 1, '00:00', 0, '23:59',
       '{"require_active":true,"require_verified_email":false,"require_qualified_registration":true,"exclude_self":true}')
    on conflict (kind) where active do nothing`);

  await pool.query(`insert into system_settings (key, value) values
    ('community_rewards', '{"view_dedup_hours":24,"view_trust_proxy":false,"suspicion_threshold":60,"max_video_mb":50,"max_image_mb":8,"max_video_seconds":120,"testimonial_min_views":10,"referral_min_qualified":1,"leaderboard_public":true}')
    on conflict (key) do nothing`);

  console.log('[seed] done. All financial incentives ship DISABLED.');
  await pool.end();
}
main().catch((e) => { console.error('[seed] failed:', e.message); process.exit(1); });
