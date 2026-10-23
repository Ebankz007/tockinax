// Pay2Crypto payments migration — standalone, idempotent (IF NOT EXISTS).
// Run: `node db/migrate-payments.cjs` (from backend/).
// Schema `gatedp2p` is PINNED — never rename. No financial rows are seeded here.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('[migrate-payments] ensuring payments tables…');
  await pool.query(`CREATE SCHEMA IF NOT EXISTS gatedp2p;`);
  await pool.query(`SET search_path TO gatedp2p, public;`);
  await pool.query(`create extension if not exists "pgcrypto";`);

  await pool.query(`
  create table if not exists deposit_intents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    purpose varchar(32) not null check (purpose in ('registration_fee','token_purchase','stage_upgrade','stage_renewal')),
    amount numeric(19,4) not null check (amount > 0),
    currency varchar(8) not null default 'USDT',
    network varchar(16) not null default 'TRC20',
    provider varchar(32) not null default 'pay2crypto',
    provider_invoice_id varchar(128),
    pay_address text,
    status varchar(24) not null default 'created'
      check (status in ('created','pending','confirming','confirmed','failed','expired','cancelled')),
    tx_hash varchar(128),
    sandbox boolean not null default true,
    idempotency varchar(96) not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists deposit_intents_user_idx on deposit_intents (user_id);
  create index if not exists deposit_intents_invoice_idx on deposit_intents (provider_invoice_id);
  create index if not exists deposit_intents_status_idx on deposit_intents (status);
  `);

  await pool.query(`
  create table if not exists withdrawal_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    amount numeric(19,4) not null check (amount > 0),
    currency varchar(8) not null default 'USDT',
    dest_address varchar(128) not null,
    network varchar(16) not null default 'TRC20',
    status varchar(24) not null default 'requested'
      check (status in ('requested','under_review','approved','processing','paid','rejected','failed','cancelled')),
    approved_by uuid references users(id),
    second_approved_by uuid references users(id),
    tx_hash varchar(128),
    reject_reason text,
    sandbox boolean not null default true,
    idempotency varchar(96) not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists withdrawal_requests_user_idx on withdrawal_requests (user_id);
  create index if not exists withdrawal_requests_status_idx on withdrawal_requests (status);
  `);

  await pool.query(`
  create table if not exists withdrawal_events (
    id uuid primary key default gen_random_uuid(),
    withdrawal_id uuid not null references withdrawal_requests(id) on delete cascade,
    from_status varchar(24),
    to_status varchar(24) not null,
    actor_id uuid references users(id),
    note text,
    created_at timestamptz not null default now()
  );
  create index if not exists withdrawal_events_withdrawal_idx on withdrawal_events (withdrawal_id);
  `);

  // Ledger accounts for the shared SIM-USDT contract (IF NOT EXISTS only).
  await pool.query(`insert into ledger_accounts (code, type, currency, description) values
    ('LIAB:sim_usdt','LIABILITY','USDT','Member SIM-USDT balances (USDT)'),
    ('SIM:usdt_clearing','ASSET','USDT','SIM-USDT clearing (USDT)')
    on conflict (code) do nothing`);

  console.log('[migrate-payments] done. Tables: deposit_intents, withdrawal_requests, withdrawal_events.');
  await pool.end();
}
main().catch((e) => { console.error('[migrate-payments] failed:', e.message); process.exit(1); });
