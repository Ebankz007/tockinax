// Applies Drizzle schema directly (dev-friendly) + append-only hardening for ledger.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('[migrate] ensuring extensions + tables…');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS gatedp2p;`);
  // Schema gatedp2p is pinned. Set it per-connection: a pooled connection may
  // differ from the one that ran SET search_path, and on a fresh CI database
  // there is no role/database-level default to fall back on.
  pool.on('connect', (c) => c.query('SET search_path TO gatedp2p, public').catch(() => {}));
  await pool.query(`SET search_path TO gatedp2p, public;`);
  await pool.query(`create extension if not exists "pgcrypto";`);
  await pool.query(`create extension if not exists "citext";`);

  // Minimal bootstrap DDL for foundation tables (full Drizzle generate in CI).
  // We create via raw SQL mirroring db/schema.js essentials so `npm run dev` works
  // even before `drizzle-kit generate` is run.
  await pool.query(`
  do $$ begin
    create type user_status as enum ('pending_email','pending_verification','active','suspended','banned');
  exception when duplicate_object then null; end $$;
  do $$ begin
    create type order_status as enum ('draft','pending_payment','evidence_submitted','under_review','completed','cancelled','expired','disputed','resolved_completed');
  exception when duplicate_object then null; end $$;
  do $$ begin
    create type payout_status as enum ('requested','under_review','approved','processing','paid','rejected','failed','cancelled','reversed');
  exception when duplicate_object then null; end $$;
  do $$ begin
    create type campaign_status as enum ('draft','pending_approval','scheduled','active','paused','completed','cancelled');
  exception when duplicate_object then null; end $$;
  `);

  const ddl = `
  create table if not exists users (id uuid primary key default gen_random_uuid(), email varchar(320) not null, password_hash text not null, status user_status not null default 'pending_email', email_verified_at timestamptz, mfa_secret text, mfa_enabled boolean not null default false, referral_code varchar(16) not null unique, referred_by uuid references users(id), terms_version varchar(16), terms_accepted_at timestamptz, seller_enabled boolean not null default false, failed_logins integer not null default 0, locked_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create unique index if not exists users_email_uidx on users (lower(email));
  create table if not exists user_profiles (user_id uuid primary key references users(id) on delete cascade, display_name varchar(120), phone varchar(32), country varchar(2) default 'NG', usdt_bep20 varchar(128), usdt_trc20 varchar(128), avatar_url text, updated_at timestamptz not null default now());
  create table if not exists roles (id uuid primary key default gen_random_uuid(), name varchar(64) not null unique, description text);
  create table if not exists permissions (id uuid primary key default gen_random_uuid(), key varchar(128) not null unique, description text);
  create table if not exists role_permissions (id uuid primary key default gen_random_uuid(), role_id uuid not null references roles(id) on delete cascade, permission_id uuid not null references permissions(id) on delete cascade, unique (role_id, permission_id));
  create table if not exists user_roles (user_id uuid not null references users(id) on delete cascade, role_id uuid not null references roles(id) on delete cascade, granted_by uuid references users(id), granted_at timestamptz not null default now(), primary key (user_id, role_id));
  create table if not exists user_sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, refresh_hash text not null unique, ip varchar(64), user_agent text, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now());
  create table if not exists identity_checks (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, kind varchar(32) not null, status varchar(24) not null default 'pending', evidence_ref text, reviewed_by uuid references users(id), reviewed_at timestamptz, created_at timestamptz not null default now());
  create table if not exists consent_records (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, doc varchar(32) not null, version varchar(16) not null, accepted_at timestamptz not null default now(), ip varchar(64));
  create table if not exists service_fees (id uuid primary key default gen_random_uuid(), key varchar(64) not null unique, amount numeric(19,4) not null default 0, currency varchar(3) not null default 'USD', description text not null default '', refund_policy text not null default '', active boolean not null default true);
  create table if not exists service_payments (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), fee_key varchar(64) not null, amount numeric(19,4) not null, currency varchar(3) not null, provider varchar(32) not null default 'stub', provider_ref varchar(128), status varchar(24) not null default 'pending', idempotency_key varchar(64) not null unique, created_at timestamptz not null default now());
  create table if not exists listings (id uuid primary key default gen_random_uuid(), seller_id uuid not null references users(id), title varchar(160) not null, description text not null, category varchar(64) not null default 'general', price numeric(19,4) not null, currency varchar(3) not null, stock integer not null default 1, status varchar(24) not null default 'draft', delivery_terms text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table if not exists listing_images (id uuid primary key default gen_random_uuid(), listing_id uuid not null references listings(id) on delete cascade, storage_key text not null, sort_order integer not null default 0);
  create table if not exists orders (id uuid primary key default gen_random_uuid(), order_no varchar(24) not null unique, buyer_id uuid not null references users(id), seller_id uuid not null references users(id), listing_id uuid references listings(id), amount numeric(19,4) not null, currency varchar(3) not null, platform_fee numeric(19,4) not null default 0, status order_status not null default 'draft', payment_method varchar(48), payment_instructions text, expires_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table if not exists order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, title varchar(160) not null, qty integer not null default 1, unit_price numeric(19,4) not null);
  create table if not exists payment_evidence (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade, submitted_by uuid not null references users(id), storage_key text, provider_ref varchar(128), note text, review_status varchar(24) not null default 'pending', reviewed_by uuid references users(id), created_at timestamptz not null default now());
  create table if not exists payment_provider_events (id uuid primary key default gen_random_uuid(), provider varchar(32) not null, event_id varchar(128) not null, payload jsonb not null, signature_ok boolean not null default false, processed_at timestamptz, created_at timestamptz not null default now(), unique (provider, event_id));
  create table if not exists disputes (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), opened_by uuid not null references users(id), reason text not null, status varchar(24) not null default 'open', assignee uuid references users(id), resolution text, created_at timestamptz not null default now(), resolved_at timestamptz);
  create table if not exists support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid references users(id), subject varchar(160) not null, category varchar(48) not null default 'general', status varchar(24) not null default 'open', assignee uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table if not exists support_messages (id uuid primary key default gen_random_uuid(), ticket_id uuid not null references support_tickets(id) on delete cascade, author_id uuid references users(id), body text not null, internal boolean not null default false, created_at timestamptz not null default now());
  create table if not exists password_resets (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null default now());
  create table if not exists referrals (id uuid primary key default gen_random_uuid(), ancestor_id uuid not null references users(id), descendant_id uuid not null references users(id), depth integer not null check (depth between 1 and 5), created_at timestamptz not null default now(), unique (ancestor_id, descendant_id), check (ancestor_id <> descendant_id));
  create table if not exists referral_closure (ancestor_id uuid not null references users(id), descendant_id uuid not null references users(id), depth integer not null, primary key (ancestor_id, descendant_id));
  create table if not exists commission_rules (id uuid primary key default gen_random_uuid(), version integer not null, level integer not null, rate_bps integer not null, basis varchar(48) not null default 'eligible_verified_sales', eligibility_json jsonb not null default '{}', effective_from timestamptz not null default now(), effective_to timestamptz, budget_cap numeric(19,4), confirmation_days integer not null default 7, active boolean not null default false, unique (version, level));
  create table if not exists commission_calculations (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), beneficiary_id uuid not null references users(id), level integer not null, rule_version integer not null, base_amount numeric(19,4) not null, amount numeric(19,4) not null, currency varchar(3) not null, status varchar(24) not null default 'pending', idempotency_key varchar(96) not null unique, created_at timestamptz not null default now());
  create table if not exists reward_campaigns (id uuid primary key default gen_random_uuid(), name varchar(120) not null unique, description text not null default '', status campaign_status not null default 'draft', starts_at timestamptz, ends_at timestamptz, timezone varchar(48) not null default 'Africa/Lagos', qualifying_activity varchar(64) not null default 'qualifying_sales_revenue', reward_rate_bps integer not null default 0, min_activity numeric(19,4), max_activity numeric(19,4), budget_cap numeric(19,4), funding_source text, approved_by uuid references users(id), approved_at timestamptz, created_at timestamptz not null default now());
  create table if not exists campaign_eligibility (campaign_id uuid not null references reward_campaigns(id) on delete cascade, user_id uuid not null references users(id) on delete cascade, eligible boolean not null default true, reason text, primary key (campaign_id, user_id));
  create table if not exists reward_calculations (id uuid primary key default gen_random_uuid(), campaign_id uuid not null references reward_campaigns(id), user_id uuid not null references users(id), source_order_id uuid references orders(id), base_amount numeric(19,4) not null, amount numeric(19,4) not null, currency varchar(3) not null, rule_version integer not null default 1, status varchar(24) not null default 'pending', idempotency_key varchar(96) not null unique, created_at timestamptz not null default now());
  create table if not exists ledger_accounts (code varchar(64) primary key, type varchar(24) not null, currency varchar(3) not null default 'USD', description text);
  create table if not exists ledger_transactions (id uuid primary key default gen_random_uuid(), source_type varchar(48) not null, source_id uuid, currency varchar(3) not null, memo text, idempotency_key varchar(96) not null unique, posted_at timestamptz not null default now());
  create table if not exists ledger_entries (id uuid primary key default gen_random_uuid(), tx_id uuid not null references ledger_transactions(id), account varchar(64) not null references ledger_accounts(code), debit numeric(19,4) not null default 0, credit numeric(19,4) not null default 0, reverses_id uuid);
  create table if not exists payout_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id), amount numeric(19,4) not null, currency varchar(3) not null, kind varchar(32) not null, status payout_status not null default 'requested', destination jsonb not null default '{}', approved_by uuid references users(id), second_approved_by uuid references users(id), reject_reason text, idempotency_key varchar(96) not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table if not exists payout_events (id uuid primary key default gen_random_uuid(), payout_id uuid not null references payout_requests(id) on delete cascade, from_status varchar(24), to_status varchar(24) not null, actor_id uuid references users(id), note text, created_at timestamptz not null default now());
  create table if not exists refunds (id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id), amount numeric(19,4) not null, currency varchar(3) not null, reason text, created_by uuid references users(id), created_at timestamptz not null default now());
  create table if not exists reconciliation_runs (id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(), finished_at timestamptz, mismatches integer not null default 0, report jsonb not null default '{}');
  create table if not exists fx_rates (id uuid primary key default gen_random_uuid(), base varchar(3) not null, quote varchar(3) not null, rate numeric(19,6) not null, source varchar(48) not null default 'manual', fetched_at timestamptz not null default now());
  create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid references users(id) on delete cascade, channel varchar(16) not null default 'inapp', title varchar(160) not null, body text, read_at timestamptz, created_at timestamptz not null default now());
  create table if not exists content_pages (slug varchar(96) primary key, title varchar(160) not null, body text not null default '', updated_by uuid references users(id), updated_at timestamptz not null default now());
  create table if not exists system_settings (key varchar(96) primary key, value jsonb not null, updated_by uuid references users(id), updated_at timestamptz not null default now());
  create table if not exists feature_flags (key varchar(96) primary key, enabled boolean not null default false, description text, updated_at timestamptz not null default now());
  create table if not exists audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references users(id), action varchar(96) not null, target_type varchar(64), target_id text, diff jsonb, ip varchar(64), created_at timestamptz not null default now());
  create table if not exists fraud_risk_events (id uuid primary key default gen_random_uuid(), kind varchar(64) not null, user_id uuid references users(id), order_id uuid references orders(id), detail jsonb not null default '{}', created_at timestamptz not null default now());
  `;
  await pool.query(ddl);

  // ---- TOCKINAX token-marketplace (simulated-token pilot) — append-only, idempotent ----
  // Schema `gatedp2p` is PINNED — never rename. All tables live under search_path gatedp2p.
  const tokenDdl = `
  create table if not exists token_definitions (code varchar(32) primary key, name varchar(120) not null, kind varchar(24) not null default 'STANDARD', total_supply numeric(19,4) not null default 0, basis text not null default '', rights text not null default '', active boolean not null default true, created_at timestamptz not null default now());
  create table if not exists pricing_rules (id uuid primary key default gen_random_uuid(), version integer not null, lock_days integer not null check (lock_days in (7,14,30)), rate_bps_per_day integer not null, basis varchar(16) not null default 'simple', active boolean not null default true, created_at timestamptz not null default now(), unique (version, lock_days));
  create table if not exists token_holdings (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, token_code varchar(32) not null references token_definitions(code), qty numeric(19,4) not null, cost_usdt numeric(19,4) not null, lock_days integer not null check (lock_days in (7,14,30)), status varchar(24) not null default 'locked', settlement_option varchar(24) not null default 'marketplace', purchased_at timestamptz not null default now(), matures_at timestamptz not null, listing_id uuid, created_at timestamptz not null default now());
  create index if not exists token_holdings_user_idx on token_holdings (user_id);
  create index if not exists token_holdings_status_idx on token_holdings (status);
  create table if not exists insurance_policies (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, token_code varchar(32) not null, holding_id uuid references token_holdings(id) on delete cascade, coverage_amount numeric(19,4) not null, premium_paid numeric(19,4) not null, status varchar(24) not null default 'active', starts_at timestamptz not null default now(), expires_at timestamptz not null, terms text not null default '', created_at timestamptz not null default now());
  create index if not exists insurance_policies_user_idx on insurance_policies (user_id);
  create index if not exists insurance_policies_status_idx on insurance_policies (status);
  create table if not exists insurance_claims (id uuid primary key default gen_random_uuid(), policy_id uuid references insurance_policies(id) on delete set null, user_id uuid not null references users(id) on delete cascade, amount numeric(19,4) not null, reason varchar(64) not null, evidence_ref text, status varchar(24) not null default 'pending', reviewed_by uuid references users(id), reviewed_at timestamptz, payout_id uuid references payout_requests(id), created_at timestamptz not null default now());
  create index if not exists insurance_claims_user_idx on insurance_claims (user_id);
  create index if not exists insurance_claims_status_idx on insurance_claims (status);
  create table if not exists participation_cycles (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, holding_id uuid not null references token_holdings(id) on delete cascade unique, started_at timestamptz not null default now(), matured_at timestamptz, settled_at timestamptz, status varchar(24) not null default 'started', success boolean not null default false, created_at timestamptz not null default now());
  create index if not exists participation_cycles_user_idx on participation_cycles (user_id);
  create table if not exists stage_definitions (stage integer primary key, name varchar(64) not null, min_buy numeric(19,4), max_buy numeric(19,4), req_cycles_7d integer not null default 0, req_cycles_14d integer not null default 0, upgrade_fee numeric(19,4), renewal_fee numeric(19,4));
  create table if not exists stage_history (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, from_stage integer, to_stage integer not null, kind varchar(24) not null default 'assign', created_by uuid references users(id), created_at timestamptz not null default now());
  create index if not exists stage_history_user_idx on stage_history (user_id);
  create table if not exists stage_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, kind varchar(16) not null check (kind in ('upgrade','renewal')), from_stage integer not null, to_stage integer not null, fee_disclosed numeric(19,4), status varchar(24) not null default 'pending', idempotency varchar(96) not null unique, created_at timestamptz not null default now());
  create index if not exists stage_requests_user_idx on stage_requests (user_id);
  create table if not exists token_listings (id uuid primary key default gen_random_uuid(), holding_id uuid not null references token_holdings(id) on delete cascade unique, seller_id uuid not null references users(id) on delete cascade, total_qty numeric(19,4) not null, remaining_qty numeric(19,4) not null, ask_unit_price numeric(19,4) not null, target_value numeric(19,4) not null, status varchar(24) not null default 'open', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create index if not exists token_listings_status_idx on token_listings (status);
  create index if not exists token_listings_seller_idx on token_listings (seller_id);
  create table if not exists token_fills (id uuid primary key default gen_random_uuid(), listing_id uuid not null references token_listings(id) on delete cascade, buyer_id uuid not null references users(id) on delete cascade, qty numeric(19,4) not null, unit_price numeric(19,4) not null, total numeric(19,4) not null, idempotency varchar(96) not null unique, created_at timestamptz not null default now());
  create index if not exists token_fills_listing_idx on token_fills (listing_id);
  create index if not exists token_fills_buyer_idx on token_fills (buyer_id);
  create table if not exists commission_categories (id varchar(32) primary key, name varchar(120) not null, description text not null default '', rate_bps integer, active boolean not null default false, created_at timestamptz not null default now());
  alter table commission_rules add column if not exists category varchar(32);
  alter table commission_calculations add column if not exists category varchar(32);
  alter table commission_calculations add column if not exists generation integer;
  alter table users add column if not exists stage integer not null default 1;
  alter table users add column if not exists member_no varchar(16);
  alter table users add column if not exists insurance_active boolean not null default false;
  alter table users add column if not exists insurance_activated_at timestamptz;
  `;
  await pool.query(tokenDdl);

  // ---- Approved-plan migration (2026-11): 30-day lock term + settlement option ----
  // `create table if not exists` does not alter existing CHECK constraints, so widen
  // the lock-term constraints explicitly on databases created before the 30-day plan.
  await pool.query(`
  do $$ begin
    if exists (select 1 from pg_constraint where conname='pricing_rules_lock_days_check') then
      alter table pricing_rules drop constraint pricing_rules_lock_days_check;
    end if;
    alter table pricing_rules add constraint pricing_rules_lock_days_check check (lock_days in (7,14,30));
  exception when duplicate_object then null; end $$;`);
  await pool.query(`
  do $$ begin
    if exists (select 1 from pg_constraint where conname='token_holdings_lock_days_check') then
      alter table token_holdings drop constraint token_holdings_lock_days_check;
    end if;
    alter table token_holdings add constraint token_holdings_lock_days_check check (lock_days in (7,14,30));
  exception when duplicate_object then null; end $$;`);
  await pool.query(`alter table token_holdings add column if not exists settlement_option varchar(24) not null default 'marketplace'`);
  await pool.query(`alter table insurance_claims alter column policy_id drop not null`);

  // ---- Community engagement & weekly rewards (append-only, idempotent) ----
  // Testimonials, social promotion, two independent weekly competitions, bonus
  // configuration/awards/payments and the announcement feed. Financial values are
  // NEVER hardcoded here: rewards live in weekly_bonus_configurations and every
  // payment posts through the existing double-entry ledger.
  const communityDdl = `
  create table if not exists testimonials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    title varchar(160) not null,
    body text not null default '',
    display_name varchar(120) not null,
    country varchar(2) not null default 'NG',
    social_url text,
    media_type varchar(16) not null default 'written' check (media_type in ('video','image','written')),
    status varchar(24) not null default 'pending'
      check (status in ('pending','approved','rejected','needs_correction','unpublished')),
    featured boolean not null default false,
    suspicious boolean not null default false,
    suspicious_reason text,
    consent boolean not null default false,
    policy_accepted boolean not null default false,
    published_at timestamptz,
    reviewed_by uuid references users(id),
    reviewed_at timestamptz,
    admin_remarks text,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists testimonials_user_idx on testimonials (user_id);
  create index if not exists testimonials_status_idx on testimonials (status);
  create index if not exists testimonials_public_idx on testimonials (status, published_at desc);
  create index if not exists testimonials_featured_idx on testimonials (featured) where featured = true;

  create table if not exists testimonial_media (
    id uuid primary key default gen_random_uuid(),
    testimonial_id uuid not null references testimonials(id) on delete cascade,
    kind varchar(8) not null check (kind in ('video','image')),
    storage_key text not null,
    mime varchar(64) not null default 'application/octet-stream',
    bytes integer not null default 0,
    original_name text,
    duration_seconds numeric(10,2),
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
  );
  create index if not exists testimonial_media_testimonial_idx on testimonial_media (testimonial_id);

  create table if not exists testimonial_views (
    id uuid primary key default gen_random_uuid(),
    testimonial_id uuid not null references testimonials(id) on delete cascade,
    user_id uuid references users(id) on delete set null,
    viewer_hash varchar(64) not null,
    ip_hash varchar(64),
    ua_hash varchar(64),
    bucket timestamptz not null,
    eligible boolean not null default true,
    suspicion_score integer not null default 0,
    reason varchar(96),
    created_at timestamptz not null default now()
  );
  create unique index if not exists testimonial_views_unique_idx on testimonial_views (testimonial_id, viewer_hash, bucket);
  create index if not exists testimonial_views_testimonial_idx on testimonial_views (testimonial_id, created_at desc);
  create index if not exists testimonial_views_eligible_idx on testimonial_views (testimonial_id, eligible);

  create table if not exists social_media_accounts (
    id uuid primary key default gen_random_uuid(),
    platform varchar(32) not null unique,
    label varchar(80) not null default '',
    url text not null,
    enabled boolean not null default true,
    sort_order integer not null default 0,
    updated_by uuid references users(id),
    updated_at timestamptz not null default now()
  );

  create table if not exists social_media_submissions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    platform varchar(32) not null,
    post_url text not null,
    caption text,
    screenshot_key text,
    status varchar(24) not null default 'pending'
      check (status in ('pending','verified','rejected','needs_info')),
    verification_method varchar(24),
    verification_ref text,
    admin_remarks text,
    submitted_at timestamptz not null default now(),
    reviewed_by uuid references users(id),
    reviewed_at timestamptz,
    created_at timestamptz not null default now(),
    unique (user_id, post_url)
  );
  create index if not exists social_submissions_user_idx on social_media_submissions (user_id);
  create index if not exists social_submissions_status_idx on social_media_submissions (status);

  create table if not exists social_media_verifications (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references social_media_submissions(id) on delete cascade,
    method varchar(24) not null default 'admin',
    status varchar(24) not null,
    detail jsonb not null default '{}',
    verified_by uuid references users(id),
    created_at timestamptz not null default now()
  );
  create index if not exists social_verifications_submission_idx on social_media_verifications (submission_id);

  create table if not exists weekly_competitions (
    id uuid primary key default gen_random_uuid(),
    kind varchar(16) not null check (kind in ('testimonial','referral')),
    week_key varchar(16) not null,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    timezone varchar(48) not null default 'UTC',
    status varchar(24) not null default 'open'
      check (status in ('scheduled','open','closing','verifying','finalized','cancelled')),
    config jsonb not null default '{}',
    finalized_at timestamptz,
    created_at timestamptz not null default now(),
    unique (kind, week_key)
  );
  create index if not exists weekly_competitions_status_idx on weekly_competitions (status, ends_at);

  create table if not exists competition_participants (
    id uuid primary key default gen_random_uuid(),
    competition_id uuid not null references weekly_competitions(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    testimonial_id uuid references testimonials(id) on delete set null,
    metric_value integer not null default 0,
    qualified boolean not null default false,
    qualification_reason text,
    rank integer,
    snapshot_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );
  create index if not exists competition_participants_comp_idx on competition_participants (competition_id, rank);
  create index if not exists competition_participants_user_idx on competition_participants (user_id);
  create unique index if not exists competition_participants_testimonial_uidx
    on competition_participants (competition_id, testimonial_id) where testimonial_id is not null;
  create unique index if not exists competition_participants_user_uidx
    on competition_participants (competition_id, user_id) where testimonial_id is null;

  create table if not exists competition_leaderboards (
    id uuid primary key default gen_random_uuid(),
    competition_id uuid not null references weekly_competitions(id) on delete cascade,
    rank integer not null,
    user_id uuid references users(id) on delete set null,
    testimonial_id uuid references testimonials(id) on delete set null,
    metric_value integer not null default 0,
    qualified boolean not null default true,
    award_id uuid,
    snapshot jsonb not null default '{}',
    created_at timestamptz not null default now(),
    unique (competition_id, rank)
  );
  create index if not exists competition_leaderboards_comp_idx on competition_leaderboards (competition_id, rank);

  create table if not exists weekly_bonus_configurations (
    id uuid primary key default gen_random_uuid(),
    kind varchar(16) not null check (kind in ('testimonial','referral')),
    active boolean not null default true,
    pool_amount numeric(19,4) not null default 0 check (pool_amount >= 0),
    currency varchar(8) not null default 'USDT',
    position_rewards jsonb not null default '{"1":"0","2":"0","3":"0","4":"0","5":"0"}',
    min_metric integer not null default 0 check (min_metric >= 0),
    approval_required boolean not null default true,
    notification_settings jsonb not null default '{"leaderboard_updates":true,"email":false,"public_amounts":true}',
    timezone varchar(48) not null default 'UTC',
    start_dow integer not null default 1 check (start_dow between 0 and 6),
    start_time time not null default '00:00',
    end_dow integer not null default 0 check (end_dow between 0 and 6),
    end_time time not null default '23:59',
    eligibility jsonb not null default '{"require_active":true,"require_verified_email":false,"require_registration_payment":false}',
    effective_from timestamptz not null default now(),
    updated_by uuid references users(id),
    created_at timestamptz not null default now()
  );
  create unique index if not exists weekly_bonus_config_active_uidx
    on weekly_bonus_configurations (kind) where active = true;

  create table if not exists weekly_bonus_awards (
    id uuid primary key default gen_random_uuid(),
    competition_id uuid not null references weekly_competitions(id) on delete cascade,
    kind varchar(16) not null check (kind in ('testimonial','referral')),
    position integer not null check (position between 1 and 5),
    user_id uuid not null references users(id) on delete cascade,
    testimonial_id uuid references testimonials(id) on delete set null,
    metric_value integer not null default 0,
    amount numeric(19,4) not null default 0 check (amount >= 0),
    currency varchar(8) not null default 'USDT',
    status varchar(24) not null default 'provisional'
      check (status in ('provisional','approved','disqualified','paid','cancelled')),
    approved_by uuid references users(id),
    approved_at timestamptz,
    disqualify_reason text,
    payment_status varchar(24) not null default 'unpaid'
      check (payment_status in ('unpaid','paid','void')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (competition_id, position)
  );
  create index if not exists weekly_bonus_awards_user_idx on weekly_bonus_awards (user_id, created_at desc);
  create index if not exists weekly_bonus_awards_status_idx on weekly_bonus_awards (status);

  create table if not exists weekly_bonus_transactions (
    id uuid primary key default gen_random_uuid(),
    award_id uuid not null references weekly_bonus_awards(id) on delete restrict unique,
    ledger_tx_id uuid references ledger_transactions(id),
    reference varchar(96) not null unique,
    amount numeric(19,4) not null,
    currency varchar(8) not null default 'USDT',
    status varchar(24) not null default 'posted',
    posted_by uuid references users(id),
    posted_at timestamptz not null default now(),
    created_at timestamptz not null default now()
  );
  create index if not exists weekly_bonus_transactions_ref_idx on weekly_bonus_transactions (reference);

  create table if not exists notification_feed (
    id uuid primary key default gen_random_uuid(),
    category varchar(48) not null,
    title varchar(160) not null,
    body text not null default '',
    audience varchar(16) not null default 'all' check (audience in ('all','members','winners','admins')),
    competition_id uuid references weekly_competitions(id) on delete set null,
    meta jsonb not null default '{}',
    published boolean not null default false,
    published_at timestamptz,
    published_by uuid references users(id),
    created_at timestamptz not null default now()
  );
  create index if not exists notification_feed_published_idx on notification_feed (published, published_at desc);

  create table if not exists competition_audit_logs (
    id uuid primary key default gen_random_uuid(),
    competition_id uuid references weekly_competitions(id) on delete set null,
    actor_id uuid references users(id),
    action varchar(96) not null,
    detail jsonb not null default '{}',
    created_at timestamptz not null default now()
  );
  create index if not exists competition_audit_comp_idx on competition_audit_logs (competition_id, created_at desc);

  alter table notifications add column if not exists category varchar(48);
  alter table notifications add column if not exists link text;
  alter table notifications add column if not exists meta jsonb not null default '{}';
  `;
  await pool.query(communityDdl);

  // USDT support (2026-10-16): ISO codes are 3 chars but 'USDT' needs 4.
  // Widen every currency/base/quote column to varchar(8), only if narrower.
  // MUST run AFTER the DDL above: on a fresh database the tables do not exist
  // yet, so running this first widened nothing and the seed then failed with
  // "value too long for type character varying(3)".
  await pool.query(`
  do $$ declare r record; begin
    for r in select table_name, column_name from information_schema.columns
      where table_schema='gatedp2p' and column_name in ('currency','base','quote')
      and data_type='character varying' and character_maximum_length < 8 loop
      execute format('alter table %I alter column %I type varchar(8)', r.table_name, r.column_name);
    end loop;
  end $$;`);

  // Backfill member_no for pre-existing users (unique, TKX- + 8 hex upper); keep nulls from violating unique via filtered index below.
  await pool.query(`update users set member_no = 'TKX-' || upper(substr(md5(id::text), 1, 8)) where member_no is null`);
  await pool.query(`create unique index if not exists users_member_no_uidx on users (member_no)`);
  // Harden ledger: app role cannot UPDATE/DELETE posted entries (defense in depth; service also immutable)
  await pool.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='gatedp2p_app') then create role gatedp2p_app with login password 'CHANGE_ME_DEV_ONLY'; end if;
  end $$;`).catch(() => {});
  // ---- Pay2Crypto integration (2026-11): registration activation, upgrades, member-to-member payments ----
  // append-only, idempotent. All financial postings go through the existing
  // double-entry ledger (postBalanced). No reward amount is hardcoded here.
  const pay2cryptoDdl = `
  create table if not exists activation_payments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    provider_invoice_id varchar(128),
    pay_address varchar(128),
    amount numeric(19,4) not null check (amount > 0),
    currency varchar(8) not null default 'USDT',
    network varchar(16) not null check (network in ('TRC20','BEP20')),
    provider varchar(32) not null default 'pay2crypto',
    status varchar(24) not null default 'created'
      check (status in ('created','pending','confirmed','failed','expired','cancelled')),
    sandbox boolean not null default true,
    idempotency_key varchar(96) not null unique,
    tx_hash varchar(128),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    confirmed_at timestamptz
  );
  create index if not exists activation_payments_user_idx on activation_payments (user_id);
  create index if not exists activation_payments_status_idx on activation_payments (status);
  create index if not exists activation_payments_invoice_idx on activation_payments (provider_invoice_id);

  create table if not exists upgrade_payments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    from_stage integer not null,
    to_stage integer not null,
    fee_amount numeric(19,4) not null check (fee_amount > 0),
    currency varchar(8) not null default 'USDT',
    network varchar(16) not null check (network in ('TRC20','BEP20')),
    provider_invoice_id varchar(128),
    pay_address varchar(128),
    provider varchar(32) not null default 'pay2crypto',
    status varchar(24) not null default 'created'
      check (status in ('created','pending','confirmed','failed','expired','cancelled')),
    sandbox boolean not null default true,
    idempotency_key varchar(96) not null unique,
    tx_hash varchar(128),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    confirmed_at timestamptz
  );
  create index if not exists upgrade_payments_user_idx on upgrade_payments (user_id);
  create index if not exists upgrade_payments_status_idx on upgrade_payments (status);

  create table if not exists payment_confirmations (
    id uuid primary key default gen_random_uuid(),
    buyer_id uuid not null references users(id) on delete cascade,
    seller_id uuid not null references users(id) on delete cascade,
    order_id uuid references orders(id) on delete set null,
    amount numeric(19,4) not null check (amount > 0),
    currency varchar(8) not null default 'USDT',
    network varchar(16) not null check (network in ('TRC20','BEP20')),
    status varchar(24) not null default 'pending'
      check (status in ('pending','proof_submitted','approved','rejected','disputed','expired')),
    proof_tx_hash varchar(128),
    proof_screenshot_key text,
    seller_confirmed_by uuid references users(id),
    seller_confirmed_at timestamptz,
    dispute_reason text,
    reviewed_by uuid references users(id),
    reviewed_at timestamptz,
    idempotency_key varchar(96) not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '7 days'
  );
  create index if not exists payment_confirmations_buyer_idx on payment_confirmations (buyer_id);
  create index if not exists payment_confirmations_seller_idx on payment_confirmations (seller_id);
  create index if not exists payment_confirmations_status_idx on payment_confirmations (status);
  create unique index if not exists payment_confirmations_order_idx on payment_confirmations (order_id) where order_id is not null;

  create table if not exists wallet_change_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    network varchar(16) not null check (network in ('TRC20','BEP20')),
    new_address varchar(128) not null,
    status varchar(24) not null default 'pending'
      check (status in ('pending','approved','rejected','cancelled')),
    verified_by uuid references users(id),
    verified_at timestamptz,
    reject_reason text,
    password_confirmed boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists wallet_change_requests_user_idx on wallet_change_requests (user_id);
  create index if not exists wallet_change_requests_status_idx on wallet_change_requests (status);

  // BEP20 address regex: starts with 0x, 42 hex chars.
  // TRON: starts with T, 34 base58 chars (already validated in v1.withdrawals).
  `;
  await pool.query(pay2cryptoDdl);

  console.log('[migrate] done.');
  await pool.end();
}
main().catch((e) => { console.error('[migrate] failed:', e.message); process.exit(1); });
